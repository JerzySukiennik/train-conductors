// scene.js — Grand Conductors TV world (static visuals only), Conduct DELUXE! look.
// Renderer + sunny lighting + gradient sky + sea, bright green island plateau with tan
// sloping dirt sides, track mesh (via track.buildTrackMesh), instanced Kenney scenery
// (trees/rocks/flowers/grass/fences, track-corridor aware, seeded), procedural cute
// stations tinted per slot, glass switch letter signs + ground arrows, level-crossing
// gates/lights, stone bridges with water inlets, rock tunnels. Every GLB has a procedural
// fallback so the scene is NEVER empty. Dynamic actors (trains/sheep/cars) live in trains.js.
//
// API (per CONTRACT ADDENDUM):
//   initScene(canvasParent) -> sc { renderer, scene, camera3, resize(), setPixelRatioCap(n), sun }
//   buildWorld(sc, level, rt) -> world { group, switchSigns, stationAnchors, crossingSet, update(dt), dispose() }
//   loadGLB(path, timeoutMs=6000) -> Promise<Group|null>   (null => caller builds fallback)

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildTrackMesh } from "./track.js";
import { COLORS, ASSETS } from "../config.js";

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const C = {
  grass: new THREE.Color(COLORS.world.grass),
  grass2: new THREE.Color(COLORS.world.grass).offsetHSL(0.02, -0.06, 0.05),
  dirt: new THREE.Color(COLORS.world.dirt),
  sea: new THREE.Color(COLORS.world.sea),
  skyTop: new THREE.Color("#8Fc7f0"),
  skyBot: new THREE.Color("#dff1ff"),
  wood: new THREE.Color("#8a5a34"),
  stone: new THREE.Color("#9aa1a6"),
  leaf: new THREE.Color("#4e8a3a"),
  inlet: new THREE.Color("#245785"),
};

const ISLAND_DEPTH = 3.2; // dirt side height (grass top y=0 -> sea below)
const SEA_Y = -ISLAND_DEPTH - 0.1;

// ---------------------------------------------------------------------------
// Small seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// GLB loader (shared) — timeout + null-on-failure
// ---------------------------------------------------------------------------

const _gltfLoader = new GLTFLoader();
const _glbCache = new Map(); // path -> Promise<gltf|null>

export function loadGLB(path, timeoutMs = 6000) {
  if (_glbCache.has(path)) return _glbCache.get(path);
  const p = new Promise((resolve) => {
    let done = false;
    const to = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs);
    _gltfLoader.load(
      path,
      (gltf) => {
        if (done) return;
        done = true;
        clearTimeout(to);
        resolve(gltf.scene || (gltf.scenes && gltf.scenes[0]) || null);
      },
      undefined,
      () => {
        if (done) return;
        done = true;
        clearTimeout(to);
        resolve(null);
      }
    );
  });
  _glbCache.set(path, p);
  return p;
}

// Convert a loaded GLB root into a single {geometry, material} for InstancedMesh use.
// Bakes world transforms, keeps attributes common to all meshes, ground-aligns + centers.
const _srcCache = new Map(); // path -> Promise<{geometry,material}|null>
function instanceSource(path, scale = 1) {
  const key = path + "|" + scale;
  if (_srcCache.has(key)) return _srcCache.get(key);
  const p = loadGLB(path).then((root) => {
    if (!root) return null;
    try {
      root.updateMatrixWorld(true);
      const geos = [];
      let material = null;
      root.traverse((o) => {
        if (o.isMesh && o.geometry) {
          const g = o.geometry.clone();
          g.applyMatrix4(o.matrixWorld);
          geos.push(g);
          if (!material) material = Array.isArray(o.material) ? o.material[0] : o.material;
        }
      });
      if (!geos.length) return null;
      const keep = ["position", "normal", "uv"].filter((a) =>
        geos.every((g) => g.getAttribute(a))
      );
      const norm = geos.map((g) => {
        for (const name of Object.keys(g.attributes)) {
          if (!keep.includes(name)) g.deleteAttribute(name);
        }
        g.morphAttributes = {};
        return g.index ? g.toNonIndexed() : g;
      });
      let merged = norm.length === 1 ? norm[0] : mergeGeometries(norm, false);
      if (!merged) merged = norm[0];
      if (!merged.getAttribute("normal")) merged.computeVertexNormals();
      merged.computeBoundingBox();
      const bb = merged.boundingBox;
      const cx = (bb.min.x + bb.max.x) / 2;
      const cz = (bb.min.z + bb.max.z) / 2;
      merged.translate(-cx, -bb.min.y, -cz);
      if (scale !== 1) merged.scale(scale, scale, scale);
      const mat = material ? material.clone() : new THREE.MeshStandardMaterial({ color: 0x88aa66, roughness: 0.9 });
      return { geometry: merged, material: mat };
    } catch (e) {
      return null;
    }
  });
  _srcCache.set(key, p);
  return p;
}

// ---------------------------------------------------------------------------
// Procedural fallback geometries (single merged geometry each, vertex-colored)
// ---------------------------------------------------------------------------

function tagColor(geo, color) {
  const n = geo.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(arr, 3));
  return geo;
}

const _vcMat = () =>
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });

// Merge vertex-colored primitives safely: strip any attribute that isn't shared by
// all geometries (e.g. IcosahedronGeometry has no uv) so mergeGeometries never fails.
function mergeVC(geos) {
  const norm = geos.map((g) => {
    for (const name of Object.keys(g.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "color") g.deleteAttribute(name);
    }
    g.morphAttributes = {};
    return g.index ? g.toNonIndexed() : g;
  });
  const m = norm.length === 1 ? norm[0] : mergeGeometries(norm, false);
  return m || norm[0];
}

function fallbackTree() {
  const trunk = tagColor(new THREE.CylinderGeometry(0.16, 0.22, 0.9, 6).translate(0, 0.45, 0), C.wood);
  const c1 = tagColor(new THREE.ConeGeometry(0.9, 1.6, 8).translate(0, 1.5, 0), C.leaf);
  const c2 = tagColor(new THREE.ConeGeometry(0.65, 1.2, 8).translate(0, 2.2, 0), C.leaf.clone().offsetHSL(0, 0, 0.06));
  return { geometry: mergeVC([trunk, c1, c2]), material: _vcMat() };
}
function fallbackRock() {
  const g = tagColor(new THREE.IcosahedronGeometry(0.7, 0).translate(0, 0.55, 0), C.stone);
  g.scale(1.1, 0.8, 1.0);
  return { geometry: g, material: _vcMat() };
}
function fallbackFlower(color) {
  const stem = tagColor(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4).translate(0, 0.2, 0), C.leaf);
  const head = tagColor(new THREE.IcosahedronGeometry(0.14, 0).translate(0, 0.44, 0), color);
  return { geometry: mergeVC([stem, head]), material: _vcMat() };
}
function fallbackGrass() {
  const a = tagColor(new THREE.ConeGeometry(0.14, 0.5, 4).translate(0, 0.25, 0), C.grass2);
  const b = tagColor(new THREE.ConeGeometry(0.11, 0.38, 4).translate(0.12, 0.19, 0.05), C.grass);
  return { geometry: mergeVC([a, b]), material: _vcMat() };
}
function fallbackFence() {
  const parts = [];
  for (const x of [-0.5, 0.5]) parts.push(tagColor(new THREE.BoxGeometry(0.09, 0.6, 0.09).translate(x, 0.3, 0), C.wood));
  parts.push(tagColor(new THREE.BoxGeometry(1.1, 0.09, 0.06).translate(0, 0.45, 0), C.wood));
  parts.push(tagColor(new THREE.BoxGeometry(1.1, 0.09, 0.06).translate(0, 0.22, 0), C.wood));
  return { geometry: mergeVC(parts), material: _vcMat() };
}
function fallbackBridge() {
  const deck = tagColor(new THREE.BoxGeometry(2.2, 0.4, 3.0).translate(0, 0.2, 0), C.stone);
  const rl = tagColor(new THREE.BoxGeometry(0.2, 0.5, 3.0).translate(-1.0, 0.55, 0), C.stone);
  const rr = tagColor(new THREE.BoxGeometry(0.2, 0.5, 3.0).translate(1.0, 0.55, 0), C.stone);
  return { geometry: mergeVC([deck, rl, rr]), material: _vcMat() };
}
function fallbackArch() {
  const l = tagColor(new THREE.BoxGeometry(1.4, 3.0, 2.0).translate(-2.0, 1.5, 0), C.stone);
  const r = tagColor(new THREE.BoxGeometry(1.4, 3.0, 2.0).translate(2.0, 1.5, 0), C.stone);
  const top = tagColor(new THREE.BoxGeometry(5.4, 1.2, 2.0).translate(0, 3.4, 0), C.stone);
  return { geometry: mergeVC([l, r, top]), material: _vcMat() };
}

// ---------------------------------------------------------------------------
// Instanced placement helper — builds fallback immediately, swaps in GLB when ready
// ---------------------------------------------------------------------------

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

function applyTransforms(mesh, transforms) {
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    _v.set(t.pos[0], t.y || 0, t.pos[1]);
    _q.setFromAxisAngle(_up, t.yaw || 0);
    const s = t.scale || 1;
    _one.set(s, s * (t.scaleY || 1), s);
    _m4.compose(_v, _q, _one);
    mesh.setMatrixAt(i, _m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function placeInstanced(group, disposables, glbPath, glbScale, fallback, transforms, opts = {}) {
  if (!transforms.length) return;
  const cast = opts.cast !== false;
  const recv = opts.recv !== false;
  const fb = fallback();
  if (!fb || !fb.geometry || !fb.geometry.getAttribute("position")) return;
  let mesh = new THREE.InstancedMesh(fb.geometry, fb.material, transforms.length);
  applyTransforms(mesh, transforms);
  mesh.castShadow = cast;
  mesh.receiveShadow = recv;
  group.add(mesh);
  disposables.push(fb.geometry, fb.material);
  if (glbPath) {
    instanceSource(glbPath, glbScale).then((src) => {
      if (!src || !src.geometry || !src.geometry.getAttribute("position") || !mesh.parent) return;
      const im = new THREE.InstancedMesh(src.geometry, src.material, transforms.length);
      applyTransforms(im, transforms);
      im.castShadow = cast;
      im.receiveShadow = recv;
      group.add(im);
      group.remove(mesh);
      mesh.dispose();
    });
  }
}

// ---------------------------------------------------------------------------
// initScene
// ---------------------------------------------------------------------------

function makeSkyTexture() {
  const cv = document.createElement("canvas");
  cv.width = 8;
  cv.height = 256;
  const g = cv.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#" + C.skyTop.getHexString());
  grad.addColorStop(1, "#" + C.skyBot.getHexString());
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function initScene(canvasParent) {
  const parent = canvasParent || document.body;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  parent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = makeSkyTexture();

  const camera3 = new THREE.PerspectiveCamera(45, 1, 0.5, 500);
  camera3.position.set(0, 40, 40);
  camera3.lookAt(0, 0, 0);

  // Sunny high-saturation lighting
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x6b8f3a, 0.75);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.3);
  sun.position.set(28, 42, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  const cam = sun.shadow.camera;
  cam.near = 1;
  cam.far = 160;
  cam.left = -34;
  cam.right = 34;
  cam.top = 26;
  cam.bottom = -26;
  scene.add(sun);
  scene.add(sun.target);

  // Deep-blue sea plane
  const seaGeo = new THREE.PlaneGeometry(1200, 1200);
  const seaMat = new THREE.MeshStandardMaterial({ color: C.sea, roughness: 0.65, metalness: 0.05 });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_Y;
  sea.receiveShadow = false;
  scene.add(sea);

  function resize() {
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera3.aspect = w / Math.max(1, h);
    camera3.updateProjectionMatrix();
  }
  resize();

  return {
    renderer,
    scene,
    camera3,
    sun,
    resize,
    setPixelRatioCap(n) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, n));
    },
  };
}

// ---------------------------------------------------------------------------
// Island plateau (rounded rect: grass top cap + sloping dirt body via bevel)
// ---------------------------------------------------------------------------

function roundedRectShape(w, d, r) {
  const hw = w / 2;
  const hd = d / 2;
  const rr = Math.min(r, hw * 0.5, hd * 0.5);
  const s = new THREE.Shape();
  s.moveTo(-hw + rr, -hd);
  s.lineTo(hw - rr, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + rr);
  s.lineTo(hw, hd - rr);
  s.quadraticCurveTo(hw, hd, hw - rr, hd);
  s.lineTo(-hw + rr, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - rr);
  s.lineTo(-hw, -hd + rr);
  s.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
  return s;
}

function buildIsland(level, disposables) {
  const g = new THREE.Group();
  const w = level.island.w;
  const d = level.island.d;
  const shape = roundedRectShape(w, d, 6);

  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: ISLAND_DEPTH,
    bevelEnabled: false,
    steps: 1,
  });
  // shape is in XY; rotateX(+90) lays it flat in XZ and sends the extrude downward.
  // Front cap (z=0) -> y=0 becomes the FLAT grass top; back cap -> y=-ISLAND_DEPTH is the base.
  bodyGeo.rotateX(Math.PI / 2);
  bodyGeo.translate(0, -0.02, 0); // top a hair below 0 so track/props (y>=0) never z-fight or sink
  const grassMat = new THREE.MeshStandardMaterial({ color: C.grass, roughness: 0.95, metalness: 0 });
  const dirtMat = new THREE.MeshStandardMaterial({ color: C.dirt, roughness: 1, metalness: 0 });
  // ExtrudeGeometry groups: 0 = caps (front/back), 1 = sides. Assign grass to caps, dirt to sides.
  const body = new THREE.Mesh(bodyGeo, [grassMat, dirtMat]);
  body.receiveShadow = true;
  body.castShadow = true;
  g.add(body);
  disposables.push(bodyGeo, grassMat, dirtMat);

  // Two-tone grass patches (subtle) scattered on top
  const rand = mulberry32((level.decor && level.decor.seed) || 1);
  const patchGeo = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
  const patchMat = new THREE.MeshStandardMaterial({ color: C.grass2, roughness: 0.95 });
  const nPatch = 26;
  const patches = new THREE.InstancedMesh(patchGeo, patchMat, nPatch);
  for (let i = 0; i < nPatch; i++) {
    const px = (rand() - 0.5) * (w - 8);
    const pz = (rand() - 0.5) * (d - 8);
    const s = 1.5 + rand() * 3.5;
    _v.set(px, 0.02, pz);
    _q.identity();
    _one.set(s, 1, s * (0.7 + rand() * 0.6));
    _m4.compose(_v, _q, _one);
    patches.setMatrixAt(i, _m4);
  }
  patches.receiveShadow = true;
  g.add(patches);
  disposables.push(patchGeo, patchMat);

  return g;
}

// ---------------------------------------------------------------------------
// Track-corridor sampling (for decor avoidance)
// ---------------------------------------------------------------------------

function trackSamples(level, rt) {
  const pts = [];
  for (const e of level.edges) {
    const s = rt.sampler(e.id);
    if (!s) continue;
    const n = Math.max(2, Math.ceil(s.length / 1.4));
    for (let i = 0; i <= n; i++) {
      const p = s.pointAt(i / n);
      pts.push([p.x, p.z]);
    }
  }
  return pts;
}

function minDistToTrack(x, z, samples) {
  let m = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const dx = x - samples[i][0];
    const dz = z - samples[i][1];
    const dd = dx * dx + dz * dz;
    if (dd < m) m = dd;
  }
  return Math.sqrt(m);
}

// ---------------------------------------------------------------------------
// Scenery scatter (instanced, corridor-aware, seeded)
// ---------------------------------------------------------------------------

function scatterScenery(group, disposables, level, rt) {
  const seed = (level.decor && level.decor.seed) || 1;
  const density = (level.decor && level.decor.treeDensity) || 0.5;
  const rand = mulberry32(seed * 2654435761);
  const samples = trackSamples(level, rt);
  const w = level.island.w;
  const d = level.island.d;
  const hw = w / 2 - 3;
  const hd = d / 2 - 3;
  const area = w * d;

  const TREE_MODELS = ASSETS.MODELS.nature.filter((p) => /tree_/.test(p));
  const ROCK_MODELS = ASSETS.MODELS.nature.filter((p) => /rock_|stone_/.test(p));
  const FLOWER_MODELS = ASSETS.MODELS.nature.filter((p) => /flower_/.test(p));
  const GRASS_MODEL = ASSETS.MODELS.nature.find((p) => /\/grass\.glb$/.test(p));
  const FENCE_MODELS = ASSETS.MODELS.nature.filter((p) => /fence_/.test(p));

  // helper: reject if inside track corridor or too near island edge
  function tryPoint(minTrack) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = (rand() - 0.5) * 2 * hw;
      const z = (rand() - 0.5) * 2 * hd;
      if (minDistToTrack(x, z, samples) > minTrack) return [x, z];
    }
    return null;
  }

  // ---- Trees (clustered) ----
  const treeBuckets = TREE_MODELS.map(() => []);
  const treeTarget = Math.round((area / 90) * (0.6 + density));
  let placed = 0;
  let guard = 0;
  while (placed < treeTarget && guard++ < treeTarget * 8) {
    const c = tryPoint(3.0);
    if (!c) continue;
    const clusterN = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < clusterN && placed < treeTarget; k++) {
      const jx = c[0] + (rand() - 0.5) * 3;
      const jz = c[1] + (rand() - 0.5) * 3;
      if (Math.abs(jx) > hw || Math.abs(jz) > hd) continue;
      if (minDistToTrack(jx, jz, samples) < 2.6) continue;
      const b = Math.floor(rand() * TREE_MODELS.length);
      treeBuckets[b].push({ pos: [jx, jz], yaw: rand() * Math.PI * 2, scale: 0.8 + rand() * 0.7 });
      placed++;
    }
  }
  TREE_MODELS.forEach((path, i) =>
    placeInstanced(group, disposables, path, 1, fallbackTree, treeBuckets[i])
  );

  // ---- Rocks (groups) ----
  const rockBuckets = ROCK_MODELS.map(() => []);
  const rockTarget = Math.round(area / 220 + 6);
  guard = 0;
  placed = 0;
  while (placed < rockTarget && guard++ < rockTarget * 8) {
    const c = tryPoint(2.8);
    if (!c) continue;
    const gN = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < gN && placed < rockTarget; k++) {
      const jx = c[0] + (rand() - 0.5) * 2.4;
      const jz = c[1] + (rand() - 0.5) * 2.4;
      if (Math.abs(jx) > hw || Math.abs(jz) > hd) continue;
      if (minDistToTrack(jx, jz, samples) < 2.6) continue;
      const b = Math.floor(rand() * ROCK_MODELS.length);
      rockBuckets[b].push({ pos: [jx, jz], yaw: rand() * Math.PI * 2, scale: 0.7 + rand() * 0.9 });
      placed++;
    }
  }
  ROCK_MODELS.forEach((path, i) =>
    placeInstanced(group, disposables, path, 1, fallbackRock, rockBuckets[i])
  );

  // ---- Flowers ----
  const flowerColors = [new THREE.Color("#e0524a"), new THREE.Color("#f4d03f"), new THREE.Color("#a86cc4")];
  const flowerBuckets = FLOWER_MODELS.map(() => []);
  const flowerTarget = Math.round((area / 60) * (0.4 + density));
  for (let i = 0; i < flowerTarget; i++) {
    const c = tryPoint(2.2);
    if (!c) continue;
    const b = Math.floor(rand() * FLOWER_MODELS.length);
    flowerBuckets[b].push({ pos: c, yaw: rand() * Math.PI * 2, scale: 0.8 + rand() * 0.5 });
  }
  FLOWER_MODELS.forEach((path, i) =>
    placeInstanced(group, disposables, path, 1, () => fallbackFlower(flowerColors[i % 3]), flowerBuckets[i], { cast: false })
  );

  // ---- Grass tufts ----
  const grassTransforms = [];
  const grassTarget = Math.round((area / 40) * (0.5 + density));
  for (let i = 0; i < grassTarget; i++) {
    const c = tryPoint(1.8);
    if (!c) continue;
    grassTransforms.push({ pos: c, yaw: rand() * Math.PI * 2, scale: 0.7 + rand() * 0.8 });
  }
  placeInstanced(group, disposables, GRASS_MODEL, 1, fallbackGrass, grassTransforms, { cast: false });

  // ---- Fences (short runs across some field patches) ----
  const fenceBuckets = FENCE_MODELS.map(() => []);
  const runs = 3 + Math.floor(density * 4);
  for (let r = 0; r < runs; r++) {
    const start = tryPoint(3.5);
    if (!start) continue;
    const dir = rand() * Math.PI * 2;
    const ux = Math.cos(dir);
    const uz = Math.sin(dir);
    const seg = 3 + Math.floor(rand() * 4);
    const b = Math.floor(rand() * FENCE_MODELS.length);
    for (let s = 0; s < seg; s++) {
      const fx = start[0] + ux * s * 1.1;
      const fz = start[1] + uz * s * 1.1;
      if (Math.abs(fx) > hw || Math.abs(fz) > hd) break;
      if (minDistToTrack(fx, fz, samples) < 2.8) break;
      fenceBuckets[b].push({ pos: [fx, fz], yaw: dir + Math.PI / 2, scale: 1 });
    }
  }
  FENCE_MODELS.forEach((path, i) =>
    placeInstanced(group, disposables, path, 1, fallbackFence, fenceBuckets[i])
  );
}

// ---------------------------------------------------------------------------
// Stations — procedural cute house tinted to slot color
// ---------------------------------------------------------------------------

function buildStation(pos, tangent, slot, disposables) {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = Math.atan2(tangent.x, tangent.z);
  const slotHex = COLORS.slots[slot] || "#cccccc";
  const roofCol = new THREE.Color(slotHex);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf5f1e8, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: roofCol, roughness: 0.7 });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xb9b4a8, roughness: 0.95 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8d8378, roughness: 0.8 });
  disposables.push(wallMat, roofMat, slabMat, poleMat);

  // platform slab beside track (local +z is the field side)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 1.8), slabMat);
  slab.position.set(0, 0.12, 1.7);
  slab.receiveShadow = true;
  g.add(slab);

  // house body
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.0), wallMat);
  body.position.set(0, 0.8 + 0.24, 3.1);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // prism roof
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 1.75, 1.1, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, 1.6 + 0.24 + 0.55, 3.1);
  roof.castShadow = true;
  g.add(roof);

  // chimney
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.35), slabMat);
  chim.position.set(0.7, 1.6 + 0.24 + 0.5, 3.5);
  chim.castShadow = true;
  g.add(chim);

  // flag pole + slot-color flag
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), poleMat);
  pole.position.set(-1.7, 1.6, 1.2);
  pole.castShadow = true;
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.05), roofMat);
  flag.position.set(-1.7 + 0.5, 2.9, 1.2);
  flag.castShadow = true;
  g.add(flag);

  // sign board
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), poleMat);
  signPost.position.set(1.6, 0.6, 1.0);
  g.add(signPost);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.08), roofMat);
  sign.position.set(1.6, 1.15, 1.0);
  sign.castShadow = true;
  g.add(sign);

  return g;
}

// ---------------------------------------------------------------------------
// Switch signs — glass letter billboard + ground arrow along active option
// ---------------------------------------------------------------------------

function letterSprite(letter) {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext("2d");
  // translucent dark rounded rect
  const r = 44;
  g.fillStyle = "rgba(18,24,32,0.72)";
  roundRectPath(g, 18, 18, 220, 220, r);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = "rgba(255,255,255,0.5)";
  roundRectPath(g, 18, 18, 220, 220, r);
  g.stroke();
  g.fillStyle = "#ffffff";
  g.font = "bold 150px 'Fredoka', 'Trebuchet MS', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, 128, 138);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function arrowGeometry() {
  // flat 3D arrow lying on ground, pointing +Z, base at origin
  const shape = new THREE.Shape();
  shape.moveTo(-0.28, 0);
  shape.lineTo(0.28, 0);
  shape.lineTo(0.28, 0.9);
  shape.lineTo(0.6, 0.9);
  shape.lineTo(0, 1.6);
  shape.lineTo(-0.6, 0.9);
  shape.lineTo(-0.28, 0.9);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); // lie flat, point along +Z
  return geo;
}

function buildSwitchSign(id, anchor, disposables) {
  const g = new THREE.Group();
  g.position.copy(anchor.pos);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8d8378, roughness: 0.8 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6), poleMat);
  pole.position.y = 1.7;
  pole.castShadow = true;
  g.add(pole);
  disposables.push(poleMat);

  const tex = letterSprite(id);
  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(0, 3.9, 0);
  sprite.scale.set(1.6, 1.6, 1.6);
  g.add(sprite);
  disposables.push(tex, spriteMat);

  const arrowGeo = arrowGeometry();
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5, metalness: 0.1, emissive: 0x332200, emissiveIntensity: 0.4 });
  const arrow = new THREE.Mesh(arrowGeo, arrowMat);
  arrow.position.set(0, 0.12, 0);
  arrow.castShadow = true;
  g.add(arrow);
  disposables.push(arrowGeo, arrowMat);

  const dirs = [anchor.dirA, anchor.dirB];
  const angleFor = (d) => Math.atan2(d.x, d.z);
  let curAngle = angleFor(dirs[0]);
  let targetAngle = curAngle;
  arrow.rotation.y = curAngle;

  return {
    group: g,
    setState(s) {
      const d = dirs[s === 1 ? 1 : 0] || dirs[0];
      // choose equivalent target within +-PI of current to tween the short way
      let a = angleFor(d);
      while (a - curAngle > Math.PI) a -= Math.PI * 2;
      while (a - curAngle < -Math.PI) a += Math.PI * 2;
      targetAngle = a;
    },
    update(dt) {
      const k = 1 - Math.pow(0.001, dt); // smooth exponential ease
      curAngle += (targetAngle - curAngle) * k;
      arrow.rotation.y = curAngle;
    },
  };
}

// ---------------------------------------------------------------------------
// Level crossing — 2 warning light posts + gate arms
// ---------------------------------------------------------------------------

function buildCrossing(level, rt, disposables) {
  const cr = level.npc && level.npc.crossing;
  if (!cr) return null;
  const s = rt.sampler(cr.edge);
  if (!s) return null;
  const pos = s.pointAt(cr.t);
  const tan = s.tangentAt(cr.t);
  const side = new THREE.Vector3(tan.z, 0, -tan.x).normalize(); // across the track

  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2f34, roughness: 0.6 });
  const gateMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.7 });
  disposables.push(postMat, gateMat, stripeMat);

  const lights = [];
  const gates = [];

  for (const s2 of [1, -1]) {
    const base = pos.clone().add(side.clone().multiplyScalar(s2 * 2.6));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 8), postMat);
    post.position.set(base.x, 1.3, base.z);
    post.castShadow = true;
    g.add(post);

    // two red lamps
    for (const ly of [2.1, 2.4]) {
      const lampMat = new THREE.MeshStandardMaterial({ color: 0x5a0f0f, emissive: 0xff2222, emissiveIntensity: 0 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), lampMat);
      lamp.position.set(base.x, ly, base.z);
      g.add(lamp);
      disposables.push(lampMat);
      lights.push(lampMat);
    }

    // gate arm — pivots from vertical(open) to horizontal(closed) across track
    const pivot = new THREE.Group();
    pivot.position.set(base.x, 2.0, base.z);
    const armLen = 3.0;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.16, 0.16), gateMat);
    arm.position.set((-s2 * armLen) / 2, 0, 0); // extend toward track center
    // orient arm along -side (toward track) when down; start up (rotated to vertical)
    arm.castShadow = true;
    pivot.add(arm);
    // red stripes
    for (let k = 0; k < 3; k++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 0.17), stripeMat);
      st.position.set(-s2 * (0.6 + k * 0.9), 0, 0);
      pivot.add(st);
    }
    // align pivot local +x to -side (toward center)
    pivot.rotation.y = Math.atan2(-side.x * s2, -side.z * s2);
    pivot.rotation.z = Math.PI / 2; // start UP (open)
    pivot.userData.sideSign = s2;
    g.add(pivot);
    gates.push(pivot);
  }

  let blink = false;
  let blinkT = 0;
  let targetZ = Math.PI / 2; // up
  const state = { mode: "idle" };

  return {
    group: g,
    set(mode) {
      state.mode = mode;
      blink = mode === "warning" || mode === "closed";
      targetZ = mode === "closed" ? 0 : Math.PI / 2; // closed = down (horizontal)
    },
    update(dt) {
      // tween gates
      const k = 1 - Math.pow(0.004, dt);
      for (const p of gates) {
        p.rotation.z += (targetZ - p.rotation.z) * k;
      }
      // blink lights
      if (blink) {
        blinkT += dt;
        const on = Math.floor(blinkT * 3) % 2 === 0;
        for (let i = 0; i < lights.length; i++) {
          const phase = i % 2 === 0 ? on : !on;
          lights[i].emissiveIntensity = phase ? 1.6 : 0.0;
        }
      } else {
        for (const l of lights) l.emissiveIntensity = 0;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Bridges & tunnels
// ---------------------------------------------------------------------------

function buildBridges(group, disposables, level, rt) {
  const list = (level.decor && level.decor.bridges) || [];
  for (const br of list) {
    const s = rt.sampler(br.edge);
    if (!s) continue;
    const tMid = (br.t0 + br.t1) / 2;
    const pos = s.pointAt(tMid);
    const tan = s.tangentAt(tMid);
    const yaw = Math.atan2(tan.x, tan.z);
    const spanLen = Math.max(2, s.length * (br.t1 - br.t0));

    // water inlet patch on grass under the bridge, stone-edged
    const side = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
    const inletMat = new THREE.MeshStandardMaterial({ color: C.inlet, roughness: 0.5, metalness: 0.1 });
    const inlet = new THREE.Mesh(new THREE.PlaneGeometry(spanLen * 1.3, 5.2), inletMat);
    inlet.rotation.x = -Math.PI / 2;
    inlet.rotation.z = -yaw;
    inlet.position.set(pos.x, 0.015, pos.z);
    inlet.receiveShadow = true;
    group.add(inlet);
    disposables.push(inletMat, inlet.geometry);

    // stone rim around inlet
    const rimMat = new THREE.MeshStandardMaterial({ color: C.stone, roughness: 0.95 });
    for (const so of [1, -1]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(spanLen * 1.4, 0.3, 0.5), rimMat);
      const c = pos.clone().add(side.clone().multiplyScalar(so * 2.6));
      rim.position.set(c.x, 0.12, c.z);
      rim.rotation.y = yaw;
      rim.receiveShadow = true;
      group.add(rim);
    }
    disposables.push(rimMat);

    // GLB bridge parts along the span (with fallback)
    const parts = Math.max(1, Math.round(spanLen / 2.4));
    const transforms = [];
    for (let i = 0; i < parts; i++) {
      const t = br.t0 + (br.t1 - br.t0) * ((i + 0.5) / parts);
      const p = s.pointAt(t);
      const tg = s.tangentAt(t);
      transforms.push({ pos: [p.x, p.z], yaw: Math.atan2(tg.x, tg.z), scale: 1, y: 0.0 });
    }
    placeInstanced(group, disposables, ASSETS.MODELS.structures.find((p) => /bridge_stone\.glb/.test(p)), 1, fallbackBridge, transforms);
  }
}

function buildTunnels(group, disposables, level, rt) {
  const list = (level.decor && level.decor.tunnels) || [];
  const cliffCluster = ASSETS.MODELS.structures.filter((p) => /cliff_(block|large)/.test(p));
  const portalModel = ASSETS.MODELS.structures.find((p) => /cliff_cave_rock/.test(p));
  for (const tu of list) {
    const s = rt.sampler(tu.edge);
    if (!s) continue;
    const side0 = s.tangentAt((tu.t0 + tu.t1) / 2);
    const side = new THREE.Vector3(side0.z, 0, -side0.x).normalize();

    // portals at both ends (cliff_cave_rock) — trains visually pass "through"
    const portalTransforms = [];
    for (const t of [tu.t0, tu.t1]) {
      const p = s.pointAt(t);
      const tg = s.tangentAt(t);
      portalTransforms.push({ pos: [p.x, p.z], yaw: Math.atan2(tg.x, tg.z), scale: 1.3 });
    }
    placeInstanced(group, disposables, portalModel, 1, fallbackArch, portalTransforms);

    // rock ridge straddling the span, offset to both sides forming an arch mass
    const ridge = [];
    const n = Math.max(2, Math.round((s.length * (tu.t1 - tu.t0)) / 2.2));
    for (let i = 0; i <= n; i++) {
      const t = tu.t0 + (tu.t1 - tu.t0) * (i / n);
      const p = s.pointAt(t);
      for (const so of [1, -1]) {
        const c = p.clone().add(side.clone().multiplyScalar(so * 2.3));
        ridge.push({ pos: [c.x, c.z], yaw: (i * 1.3 + so) % (Math.PI * 2), scale: 1.4 + (i % 2) * 0.4 });
      }
    }
    const model = cliffCluster[0];
    placeInstanced(group, disposables, model, 1, fallbackRock, ridge);
  }
}

// ---------------------------------------------------------------------------
// buildWorld
// ---------------------------------------------------------------------------

export function buildWorld(sc, level, rt) {
  const group = new THREE.Group();
  const disposables = [];
  const updaters = [];

  // island plateau
  group.add(buildIsland(level, disposables));

  // track mesh (ballast/ties/rails + crossing road)
  const trackGroup = buildTrackMesh(level, rt);
  group.add(trackGroup);
  const switchAnchors = trackGroup.userData.switchAnchors || {};

  // scenery
  scatterScenery(group, disposables, level, rt);

  // bridges & tunnels
  buildBridges(group, disposables, level, rt);
  buildTunnels(group, disposables, level, rt);

  // stations
  const stationAnchors = {};
  for (const st of level.stations || []) {
    const sp = rt.stationPos(st);
    if (!sp) continue;
    group.add(buildStation(sp.pos, sp.tangent, st.slot, disposables));
    stationAnchors[st.id] = { pos: sp.pos.clone(), tangent: sp.tangent.clone(), slot: st.slot };
  }

  // switch signs
  const switchSigns = {};
  for (const sw of level.switches || []) {
    const anchor = switchAnchors[sw.id];
    if (!anchor) continue;
    const sign = buildSwitchSign(sw.id, anchor, disposables);
    group.add(sign.group);
    switchSigns[sw.id] = { setState: sign.setState };
    updaters.push(sign);
  }

  // crossing
  const crossing = buildCrossing(level, rt, disposables);
  if (crossing) {
    group.add(crossing.group);
    updaters.push(crossing);
  }

  // frame shadow camera to island
  if (sc && sc.sun) {
    const ext = Math.max(level.island.w, level.island.d) * 0.62;
    const cam = sc.sun.shadow.camera;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.updateProjectionMatrix();
    sc.sun.target.position.set(0, 0, 0);
    sc.sun.target.updateMatrixWorld();
  }

  sc.scene.add(group);

  return {
    group,
    switchSigns,
    stationAnchors,
    crossingSet(state) {
      if (crossing) crossing.set(state);
    },
    update(dt) {
      for (const u of updaters) u.update(dt);
    },
    dispose() {
      sc.scene.remove(group);
      group.traverse((o) => {
        if (o.isMesh || o.isInstancedMesh) {
          if (o.geometry) o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x && x.dispose());
          else if (m) m.dispose();
        }
        if (o.isSprite && o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      for (const d of disposables) {
        if (d && typeof d.dispose === "function") d.dispose();
      }
    },
  };
}
