// trains.js — Grand Conductors dynamic actors.
// Owns player trains (GLB tinted, procedural fallback) + wagons, NPC freight trains,
// sheep, level-crossing cars and waiting/boarding passengers. Kinematic on the track
// runtime (rt) from track.js. Head + wagons trail via an arc-length breadcrumb buffer.
// Public API per CONTRACT ADDENDUM "trains.js". GLB loader is pulled lazily from
// ./scene.js (loadGLB); _setLoaderForTest injects a stub (return null => procedural).
// Emits per update(dt): atStation, crash, sheepHit, carCrash, warn, hornSheep, crossingState.

import * as THREE from "three";
import { COLORS, ASSETS, BALANCE } from "../config.js";

const TRAIN_Y = 0.15;
const LOCO_LEN = 2.2;
const WAGON_GAP = 2.4;
const ACCEL = 1.2;
const DECEL = 2.5;
const CRUMB_STEP = 0.3;
const HORIZON = 4.0;
const WARN_DT = 0.25;
const WARN_STEPS = Math.round(HORIZON / WARN_DT);
const WARN_DIST = BALANCE.COLLISION_DIST * 1.6;
const SHEEP_HIT_DIST = 1.2;
const CAR_HIT_DIST = 1.5;
const CAR_CROSS_TIME = 3.0;
const CROSS_ZONE = 1.6;
const GLB_FORWARD_YAW = Math.PI;
const MAX_BACK = WAGON_GAP * (BALANCE.WAGON_CAP + 1) + 3;

const SKIN = ["#F1C27D", "#E0AC69", "#C68642", "#FFE0BD", "#8D5524"];

let _loaderOverride = null;
let _loaderPromise = null;
export function _setLoaderForTest(fn) {
  _loaderOverride = fn;
  _loaderPromise = null;
}
function getLoader() {
  if (_loaderOverride) return Promise.resolve(_loaderOverride);
  if (_loaderPromise) return _loaderPromise;
  _loaderPromise = import("./scene.js")
    .then((m) => m.loadGLB || (() => Promise.resolve(null)))
    .catch(() => () => Promise.resolve(null));
  return _loaderPromise;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function isSaturated(c) {
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  return mx - mn > 0.15;
}
function tintClone(src, hex) {
  const g = src.clone(true);
  const col = new THREE.Color(hex);
  g.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const arr = Array.isArray(o.material) ? o.material : [o.material];
    const out = arr.map((m) => {
      if (m && m.isMeshStandardMaterial) {
        const nm = m.clone();
        if (isSaturated(nm.color)) nm.color.copy(col);
        return nm;
      }
      return m;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
    o.castShadow = true;
  });
  return g;
}
function wrapGLB(group) {
  const outer = new THREE.Group();
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const span = Math.max(size.x, size.z) || 1;
  const s = LOCO_LEN / span;
  group.scale.setScalar(s);
  group.rotation.y = GLB_FORWARD_YAW;
  const center = new THREE.Vector3();
  box.getCenter(center);
  group.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  outer.add(group);
  return outer;
}

function stdMat(hex, rough) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: rough == null ? 0.7 : rough,
    metalness: 0.05,
  });
}
function addWheels(group, hw, z0, z1, r) {
  const geo = new THREE.CylinderGeometry(r, r, 0.12, 10);
  const mat = stdMat("#20262b", 0.6);
  for (const z of [z0, z1]) {
    for (const x of [-hw, hw]) {
      const w = new THREE.Mesh(geo, mat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, r * 0.7, z);
      w.castShadow = true;
      group.add(w);
    }
  }
}
function buildLoco(hex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.5), stdMat(hex));
  body.position.set(0, 0.55, -0.15);
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.5), stdMat(hex));
  nose.position.set(0, 0.45, 0.75);
  nose.castShadow = true;
  g.add(nose);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.9, 12), stdMat(hex));
  tip.rotation.z = Math.PI / 2;
  tip.position.set(0, 0.45, 1.02);
  tip.castShadow = true;
  g.add(tip);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 1.2), stdMat("#F5F5F5", 0.5));
  roof.position.set(0, 0.95, -0.15);
  g.add(roof);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.32, 0.42), stdMat("#2b3540", 0.3));
  win.position.set(0, 0.7, 0.5);
  g.add(win);
  addWheels(g, 0.5, -0.55, 0.35, 0.22);
  return g;
}
function buildWagon(hex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 1.5), stdMat(hex));
  body.position.set(0, 0.5, 0);
  body.castShadow = true;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.1, 1.4), stdMat("#F5F5F5", 0.5));
  roof.position.set(0, 0.86, 0);
  g.add(roof);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.26, 1.2), stdMat("#2b3540", 0.3));
  win.position.set(0, 0.62, 0);
  g.add(win);
  addWheels(g, 0.5, -0.45, 0.45, 0.2);
  return g;
}
function buildFreightCar(hex, kind) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 1.5), stdMat("#3a4248"));
  base.position.set(0, 0.32, 0);
  base.castShadow = true;
  g.add(base);
  if (kind === "tank") {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.4, 14), stdMat(hex));
    t.rotation.x = Math.PI / 2;
    t.position.set(0, 0.75, 0);
    t.castShadow = true;
    g.add(t);
  } else {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 1.4), stdMat(hex));
    b.position.set(0, 0.75, 0);
    b.castShadow = true;
    g.add(b);
  }
  addWheels(g, 0.5, -0.45, 0.45, 0.2);
  return g;
}
function buildSheep() {
  const g = new THREE.Group();
  const wool = stdMat("#f2f2ef", 0.95);
  const dark = stdMat("#2c2622", 0.7);
  const woolGeo = new THREE.SphereGeometry(0.28, 10, 8);
  const offsets = [
    [0, 0.32, 0],
    [0.16, 0.3, 0.05],
    [-0.15, 0.31, -0.04],
    [0.02, 0.36, -0.14],
  ];
  for (const o of offsets) {
    const s = new THREE.Mesh(woolGeo, wool);
    s.position.set(o[0], o[1], o[2]);
    s.scale.setScalar(0.8 + Math.random() * 0.4);
    s.castShadow = true;
    g.add(s);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), dark);
  head.position.set(0, 0.34, 0.34);
  g.add(head);
  const legGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.22, 6);
  for (const lx of [-0.13, 0.13]) {
    for (const lz of [-0.13, 0.13]) {
      const leg = new THREE.Mesh(legGeo, dark);
      leg.position.set(lx, 0.11, lz);
      g.add(leg);
    }
  }
  return g;
}
function buildCar(hex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 1.3), stdMat(hex, 0.4));
  body.position.set(0, 0.3, 0);
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.7), stdMat(hex, 0.4));
  cabin.position.set(0, 0.58, -0.05);
  g.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.55), stdMat("#9fd4e0", 0.2));
  glass.position.set(0, 0.6, -0.05);
  g.add(glass);
  addWheels(g, 0.36, -0.4, 0.4, 0.16);
  return g;
}
function buildPassenger(hex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.22, 4, 8), stdMat(hex, 0.6));
  body.position.set(0, 0.28, 0);
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    stdMat(SKIN[(Math.random() * SKIN.length) | 0], 0.7)
  );
  head.position.set(0, 0.52, 0);
  g.add(head);
  return g;
}

const CARRIAGE_KINDS = ["coal", "box", "tank"];

export function initTrains(sc, level, rt, opts) {
  const options = opts || {};
  const slots = options.slots || [0, 1, 2];
  const difficulty = options.difficulty || "normal";
  const scene = sc && sc.scene ? sc.scene : sc;

  const root = new THREE.Group();
  root.name = "trains";
  if (scene && scene.add) scene.add(root);

  const TPL = { head: null, wagon: null, freightLoco: null, carriages: {} };

  const players = [];
  const playerBySlot = {};
  const freights = [];
  const sheepList = [];
  const stations = {};
  const anims = [];
  const hornQueue = [];

  let crossing = null;
  let time = 0;
  let crashEmitted = false;

  const _out = { x: 0, z: 0, tx: 0, tz: 1 };
  const _out2 = { x: 0, z: 0, tx: 0, tz: 1 };
  const _pos = new THREE.Vector3();
  const _tan = new THREE.Vector3();

  function sampleWorld(edgeId, t) {
    const s = rt.sampler(edgeId);
    if (!s) return null;
    _pos.copy(s.pointAt(t));
    _tan.copy(s.tangentAt(t));
    return s;
  }

  function graphStep(state, ds, states) {
    let edgeId = state.edgeId;
    let t = state.t;
    let dir = state.dir;
    let remaining = ds;
    let guard = 0;
    while (remaining > 1e-9 && guard++ < 128) {
      const s = rt.sampler(edgeId);
      if (!s) return { edgeId, t, dir, dead: true };
      const len = s.length;
      if (dir > 0) {
        const room = (1 - t) * len;
        if (remaining < room) {
          t += remaining / len;
          remaining = 0;
        } else {
          remaining -= room;
          const nx = rt.nextEdge(edgeId, 1, states);
          if (!nx) return { edgeId, t: 1, dir, dead: true };
          edgeId = nx.edgeId;
          dir = nx.dir;
          t = dir > 0 ? 0 : 1;
        }
      } else {
        const room = t * len;
        if (remaining < room) {
          t -= remaining / len;
          remaining = 0;
        } else {
          remaining -= room;
          const nx = rt.nextEdge(edgeId, -1, states);
          if (!nx) return { edgeId, t: 0, dir, dead: true };
          edgeId = nx.edgeId;
          dir = nx.dir;
          t = dir > 0 ? 0 : 1;
        }
      }
    }
    return { edgeId, t, dir, dead: false };
  }

  function pathStep(state, ds, path) {
    let idx = state.idx;
    let t = state.t;
    let remaining = ds;
    let guard = 0;
    while (remaining > 1e-9 && guard++ < 128) {
      const seg = path[idx];
      const len = seg.length;
      const room = (1 - t) * len;
      if (remaining < room) {
        t += remaining / len;
        remaining = 0;
      } else {
        remaining -= room;
        idx = (idx + 1) % path.length;
        t = 0;
      }
    }
    return { idx, t };
  }

  function pushCrumb(tr) {
    const edgeId = tr.mode === "path" ? tr.path[tr.idx].edgeId : tr.edgeId;
    const dir = tr.mode === "path" ? tr.path[tr.idx].dir : tr.dir;
    const t = tr.t;
    const s = sampleWorld(edgeId, t);
    if (!s) return;
    tr.crumbs.push({
      x: _pos.x,
      z: _pos.z,
      tx: _tan.x * dir,
      tz: _tan.z * dir,
      dist: tr.headDist,
    });
    const cutoff = tr.headDist - MAX_BACK;
    while (tr.crumbs.length > 2 && tr.crumbs[1].dist < cutoff) tr.crumbs.shift();
  }

  function seedCrumbs(tr) {
    tr.crumbs = [];
    const back = [];
    let acc = 0;
    if (tr.mode === "path") {
      let st = { idx: tr.idx, t: tr.t };
      const revDir = 1;
      let cur = st;
      while (acc < MAX_BACK) {
        acc += CRUMB_STEP;
        cur = pathStepBack(cur, CRUMB_STEP, tr.path);
        const seg = tr.path[cur.idx];
        const s = sampleWorld(seg.edgeId, cur.t);
        if (!s) break;
        back.push({ x: _pos.x, z: _pos.z, tx: _tan.x * seg.dir, tz: _tan.z * seg.dir, dist: -acc });
      }
    } else {
      let cur = { edgeId: tr.edgeId, t: tr.t, dir: -tr.dir };
      while (acc < MAX_BACK) {
        acc += CRUMB_STEP;
        const r = graphStep(cur, CRUMB_STEP, tr.states);
        cur = { edgeId: r.edgeId, t: r.t, dir: r.dir };
        const fwd = -cur.dir;
        const s = sampleWorld(cur.edgeId, cur.t);
        if (!s) break;
        back.push({ x: _pos.x, z: _pos.z, tx: _tan.x * fwd, tz: _tan.z * fwd, dist: -acc });
        if (r.dead) break;
      }
    }
    back.reverse();
    tr.crumbs = back;
    tr.headDist = 0;
    pushCrumb(tr);
  }

  function pathStepBack(state, ds, path) {
    let idx = state.idx;
    let t = state.t;
    let remaining = ds;
    let guard = 0;
    while (remaining > 1e-9 && guard++ < 128) {
      const seg = path[idx];
      const len = seg.length;
      const room = t * len;
      if (remaining < room) {
        t -= remaining / len;
        remaining = 0;
      } else {
        remaining -= room;
        idx = (idx - 1 + path.length) % path.length;
        t = 1;
      }
    }
    return { idx, t };
  }

  function getPointBack(tr, back, out) {
    const arr = tr.crumbs;
    if (!arr || !arr.length) {
      out.x = 0;
      out.z = 0;
      out.tx = 0;
      out.tz = 1;
      return out;
    }
    const target = tr.headDist - back;
    if (target <= arr[0].dist) {
      Object.assign(out, arr[0]);
      return out;
    }
    const last = arr[arr.length - 1];
    if (target >= last.dist) {
      Object.assign(out, last);
      return out;
    }
    for (let i = arr.length - 1; i > 0; i--) {
      const a = arr[i - 1];
      const b = arr[i];
      if (target >= a.dist && target <= b.dist) {
        const span = b.dist - a.dist || 1;
        const f = (target - a.dist) / span;
        out.x = a.x + (b.x - a.x) * f;
        out.z = a.z + (b.z - a.z) * f;
        out.tx = a.tx + (b.tx - a.tx) * f;
        out.tz = a.tz + (b.tz - a.tz) * f;
        return out;
      }
    }
    Object.assign(out, last);
    return out;
  }

  function placeMesh(mesh, o) {
    mesh.position.set(o.x, TRAIN_Y, o.z);
    mesh.rotation.y = Math.atan2(o.tx, o.tz);
  }

  function makeHead(tr) {
    if (tr.kind === "freight") {
      if (TPL.freightLoco) return tintClone(TPL.freightLoco, COLORS.npc);
      return buildLoco(COLORS.npc);
    }
    const hex = COLORS.slots[tr.slot];
    if (TPL.head) return wrapGLB(tintClone(TPL.head, hex));
    return buildLoco(hex);
  }
  function makeWagon(tr, index) {
    if (tr.kind === "freight") {
      const kind = CARRIAGE_KINDS[index % CARRIAGE_KINDS.length];
      if (TPL.carriages[kind]) return tintClone(TPL.carriages[kind], COLORS.npc);
      return buildFreightCar(COLORS.npc, kind);
    }
    const hex = COLORS.slots[tr.slot];
    if (TPL.wagon) return wrapGLB(tintClone(TPL.wagon, hex));
    return buildWagon(hex);
  }

  function rebuildMeshes(tr) {
    if (tr.headMesh) tr.group.remove(tr.headMesh);
    for (const w of tr.wagonMeshes) tr.group.remove(w);
    tr.headMesh = makeHead(tr);
    tr.group.add(tr.headMesh);
    tr.wagonMeshes = [];
    for (let i = 0; i < tr.wagons; i++) {
      const m = makeWagon(tr, i);
      tr.group.add(m);
      tr.wagonMeshes.push(m);
    }
    layoutTrain(tr);
  }

  function layoutTrain(tr) {
    placeMesh(tr.headMesh, getPointBack(tr, 0, _out));
    for (let i = 0; i < tr.wagonMeshes.length; i++) {
      placeMesh(tr.wagonMeshes[i], getPointBack(tr, WAGON_GAP * (i + 1), _out2));
    }
  }

  function centersOf(tr) {
    const n = 1 + tr.wagons;
    if (!tr._centers || tr._centers.length < n) {
      tr._centers = [];
      for (let i = 0; i < n; i++) tr._centers.push({ x: 0, z: 0 });
    }
    for (let i = 0; i < n; i++) {
      getPointBack(tr, WAGON_GAP * i, _out);
      tr._centers[i].x = _out.x;
      tr._centers[i].z = _out.z;
    }
    tr._centerCount = n;
    return tr._centers;
  }

  function newPlayer(slot) {
    const sp = level.spawns[slot];
    if (!sp) return null;
    const g = new THREE.Group();
    root.add(g);
    const tr = {
      kind: "player",
      slot,
      mode: "graph",
      edgeId: sp.edge,
      t: sp.t,
      dir: sp.dir,
      states: rt.switchStates || rt.defaultSwitchStates(),
      speed: 0,
      inputThrottle: 0,
      autopilot: false,
      lockTimer: 0,
      wagons: 0,
      wagonMeshes: [],
      headMesh: null,
      group: g,
      headDist: 0,
      crumbs: [],
      zones: {},
      lastWarn: -10,
      _proj: [],
    };
    seedCrumbs(tr);
    rebuildMeshes(tr);
    players.push(tr);
    playerBySlot[slot] = tr;
    return tr;
  }

  function buildFreightPath(pathIds) {
    const segs = [];
    const n = pathIds.length;
    for (let i = 0; i < n; i++) {
      const e = rt.edges.get(pathIds[i]);
      const eNext = rt.edges.get(pathIds[(i + 1) % n]);
      let shared = null;
      if (e.b === eNext.a || e.b === eNext.b) shared = e.b;
      else if (e.a === eNext.a || e.a === eNext.b) shared = e.a;
      const dir = e.b === shared ? 1 : -1;
      segs.push({ edgeId: pathIds[i], dir, length: e.length });
    }
    return segs;
  }

  function newFreight(spec, carriages) {
    const g = new THREE.Group();
    root.add(g);
    const path = buildFreightPath(spec.path);
    const tr = {
      kind: "freight",
      slot: -1,
      mode: "path",
      path,
      idx: 0,
      t: 0,
      dir: path[0].dir,
      speed: spec.speed * BALANCE.MAXSPEED,
      wagons: carriages,
      wagonMeshes: [],
      headMesh: null,
      group: g,
      headDist: 0,
      crumbs: [],
      _proj: [],
    };
    tr.edgeId = path[0].edgeId;
    seedCrumbs(tr);
    rebuildMeshes(tr);
    freights.push(tr);
    return tr;
  }

  function newSheep(spot, spotsPool) {
    const s = sampleWorld(spot.edge, spot.t);
    const mesh = buildSheep();
    root.add(mesh);
    const base = { x: _pos.x, z: _pos.z };
    const perp = { x: _tan.z, z: -_tan.x };
    const sh = {
      spot,
      pool: spotsPool,
      edge: spot.edge,
      base,
      perp,
      pos: { x: base.x, z: base.z },
      mesh,
      phase: "graze",
      target: { x: base.x, z: base.z },
      wanderT: Math.random() * 2,
      bob: Math.random() * 6,
      fleeT: 0,
      fleeDir: { x: perp.x, z: perp.z },
      respawn: 0,
    };
    mesh.position.set(base.x, 0, base.z);
    sheepList.push(sh);
    return sh;
  }

  function difficultyCount(spots) {
    const n = spots.length;
    if (difficulty === "easy") return Math.min(2, n);
    if (difficulty === "hard") return n;
    return Math.max(1, Math.round(n * 0.6));
  }

  // ---- passengers ----
  function stationRT(st) {
    if (stations[st.id]) return stations[st.id];
    const s = sampleWorld(st.edge, st.t);
    const pos = { x: _pos.x, z: _pos.z };
    const right = { x: _tan.z, z: -_tan.x };
    const rec = {
      station: st,
      pos,
      right,
      forward: { x: _tan.x, z: _tan.z },
      slot: st.slot,
      waiting: [],
    };
    stations[st.id] = rec;
    return rec;
  }
  function passengerSlotPos(rec, i) {
    const off = 1.5;
    const along = (i - 1.5) * 0.5;
    return {
      x: rec.pos.x + rec.right.x * off + rec.forward.x * along,
      z: rec.pos.z + rec.right.z * off + rec.forward.z * along,
    };
  }

  function addPop(mesh, dur, delay) {
    let t = -(delay || 0);
    mesh.scale.setScalar(0.001);
    anims.push((dt) => {
      t += dt;
      if (t < 0) return false;
      const f = Math.min(1, t / dur);
      const e = f < 1 ? 1 - Math.pow(1 - f, 3) : 1;
      mesh.scale.setScalar(0.001 + e);
      return f >= 1;
    });
  }

  // ---- crossing ----
  function initCrossing() {
    if (!level.npc || !level.npc.crossing) return;
    const cr = level.npc.crossing;
    const road = cr.road;
    if (!road || road.length < 2) return;
    const pts = road.map((p) => new THREE.Vector3(p[0], 0, p[1]));
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
    curve.arcLengthDivisions = 60;
    const s = sampleWorld(cr.edge, cr.t);
    const trackPt = { x: _pos.x, z: _pos.z };
    let bestU = 0;
    let bestD = Infinity;
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const p = curve.getPointAt(u);
      const d = (p.x - trackPt.x) ** 2 + (p.z - trackPt.z) ** 2;
      if (d < bestD) {
        bestD = d;
        bestU = u;
      }
    }
    const period = (cr.period && cr.period[difficulty]) || 10;
    crossing = {
      curve,
      trackPt,
      crossU: bestU,
      period,
      timer: period,
      car: null,
      carU: 0,
      state: "idle",
    };
  }

  function updateCrossing(dt, events) {
    if (!crossing) return;
    const c = crossing;
    let next = "idle";
    if (!c.car) {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.timer += c.period;
        const cheerful = ["#E8734A", "#4AA3E8", "#7BC043", "#F2C14E", "#B96FE0", "#EA5A78"];
        c.car = buildCar(cheerful[(Math.random() * cheerful.length) | 0]);
        root.add(c.car);
        c.carU = 0;
      }
    }
    if (c.car) {
      c.carU += dt / CAR_CROSS_TIME;
      if (c.carU >= 1) {
        root.remove(c.car);
        disposeObject(c.car);
        c.car = null;
        c.carU = 0;
      } else {
        const p = c.curve.getPointAt(c.carU);
        const tg = c.curve.getTangentAt(c.carU);
        c.car.position.set(p.x, TRAIN_Y, p.z);
        c.car.rotation.y = Math.atan2(tg.x, tg.z);
        const du = c.crossU - c.carU;
        const speedU = 1 / CAR_CROSS_TIME;
        const dist2 =
          (p.x - c.trackPt.x) ** 2 + (p.z - c.trackPt.z) ** 2;
        if (dist2 < CROSS_ZONE * CROSS_ZONE) next = "closed";
        else if (du > 0 && du / speedU < 1.5) next = "warning";
        else next = "idle";
      }
    }
    if (next !== c.state) {
      c.state = next;
      events.push({ type: "crossingState", state: next });
    }
  }

  // ---- sheep ----
  function updateSheep(dt) {
    for (const sh of sheepList) {
      if (sh.phase === "gone") {
        sh.respawn -= dt;
        if (sh.respawn <= 0) respawnSheep(sh);
        continue;
      }
      if (sh.phase === "flee") {
        sh.fleeT += dt;
        const f = Math.min(1, sh.fleeT / 1.0);
        sh.pos.x = sh.base.x + sh.fleeDir.x * 4 * f;
        sh.pos.z = sh.base.z + sh.fleeDir.z * 4 * f;
        const hop = Math.abs(Math.sin(sh.fleeT * 12)) * 0.35 * (1 - f);
        sh.mesh.position.set(sh.pos.x, hop, sh.pos.z);
        sh.mesh.rotation.y = Math.atan2(sh.fleeDir.x, sh.fleeDir.z);
        if (f >= 1) {
          sh.phase = "gone";
          sh.respawn = 8 + Math.random() * 7;
          sh.mesh.visible = false;
        }
        continue;
      }
      sh.wanderT -= dt;
      if (sh.wanderT <= 0) {
        sh.wanderT = 1.5 + Math.random() * 2.5;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.5;
        sh.target.x = sh.base.x + Math.cos(a) * r * sh.perp.x + Math.sin(a) * r * -sh.perp.z;
        sh.target.z = sh.base.z + Math.cos(a) * r * sh.perp.z + Math.sin(a) * r * sh.perp.x;
      }
      sh.pos.x += (sh.target.x - sh.pos.x) * Math.min(1, dt * 1.5);
      sh.pos.z += (sh.target.z - sh.pos.z) * Math.min(1, dt * 1.5);
      sh.bob += dt * 3;
      sh.mesh.position.set(sh.pos.x, Math.abs(Math.sin(sh.bob)) * 0.03, sh.pos.z);
    }
  }
  function respawnSheep(sh) {
    const free = sh.pool.filter((sp) => !sheepList.some((o) => o !== sh && o.phase !== "gone" && o.spot === sp));
    const pick = (free.length ? free : sh.pool)[(Math.random() * (free.length ? free.length : sh.pool.length)) | 0];
    const s = sampleWorld(pick.edge, pick.t);
    sh.spot = pick;
    sh.edge = pick.edge;
    sh.base = { x: _pos.x, z: _pos.z };
    sh.perp = { x: _tan.z, z: -_tan.x };
    sh.pos = { x: sh.base.x, z: sh.base.z };
    sh.target = { x: sh.base.x, z: sh.base.z };
    sh.phase = "graze";
    sh.wanderT = Math.random() * 2;
    sh.mesh.visible = true;
    sh.mesh.scale.setScalar(1);
    sh.mesh.position.set(sh.base.x, 0, sh.base.z);
  }
  function fleeSheep(sh, fromX, fromZ) {
    if (sh.phase !== "graze") return;
    let dx = sh.pos.x - fromX;
    let dz = sh.pos.z - fromZ;
    let dot = dx * sh.perp.x + dz * sh.perp.z;
    if (dot === 0) dot = 1;
    const sign = dot >= 0 ? 1 : -1;
    sh.fleeDir = { x: sh.perp.x * sign, z: sh.perp.z * sign };
    sh.base = { x: sh.pos.x, z: sh.pos.z };
    sh.phase = "flee";
    sh.fleeT = 0;
  }

  // ---- kinematics ----
  function advanceTrain(tr, dt, states) {
    if (tr.speed <= 1e-6) return;
    let dist = tr.speed * dt;
    while (dist > 1e-6) {
      const step = Math.min(CRUMB_STEP, dist);
      if (tr.mode === "path") {
        const r = pathStep({ idx: tr.idx, t: tr.t }, step, tr.path);
        tr.idx = r.idx;
        tr.t = r.t;
        tr.edgeId = tr.path[tr.idx].edgeId;
        tr.dir = tr.path[tr.idx].dir;
        tr.headDist += step;
        pushCrumb(tr);
      } else {
        const r = graphStep({ edgeId: tr.edgeId, t: tr.t, dir: tr.dir }, step, states);
        tr.edgeId = r.edgeId;
        tr.t = r.t;
        tr.dir = r.dir;
        tr.headDist += step;
        pushCrumb(tr);
        if (r.dead) {
          tr.speed = 0;
          break;
        }
      }
      dist -= step;
    }
  }

  function projectTrain(tr, states) {
    const arr = tr._proj;
    while (arr.length < WARN_STEPS) arr.push({ x: 0, z: 0 });
    let cur =
      tr.mode === "path"
        ? { idx: tr.idx, t: tr.t }
        : { edgeId: tr.edgeId, t: tr.t, dir: tr.dir };
    const stepDist = tr.speed * WARN_DT;
    for (let k = 0; k < WARN_STEPS; k++) {
      if (stepDist > 1e-6) {
        if (tr.mode === "path") cur = pathStep(cur, stepDist, tr.path);
        else {
          const r = graphStep(cur, stepDist, states);
          cur = { edgeId: r.edgeId, t: r.t, dir: r.dir };
        }
      }
      const edgeId = tr.mode === "path" ? tr.path[cur.idx].edgeId : cur.edgeId;
      const s = sampleWorld(edgeId, cur.t);
      arr[k].x = s ? _pos.x : 0;
      arr[k].z = s ? _pos.z : 0;
    }
    return arr;
  }

  // ---- events / update ----
  function update(dt) {
    time += dt;
    const events = [];
    const states = rt.switchStates || tr0States();

    while (hornQueue.length) {
      const slot = hornQueue.shift();
      const tr = playerBySlot[slot];
      if (!tr) continue;
      getPointBack(tr, 0, _out);
      let fled = false;
      for (const sh of sheepList) {
        if (sh.phase !== "graze") continue;
        const d = Math.hypot(sh.pos.x - _out.x, sh.pos.z - _out.z);
        if (d < BALANCE.SHEEP_FLEE_RADIUS) {
          fleeSheep(sh, _out.x, _out.z);
          fled = true;
        }
      }
      if (fled) events.push({ type: "hornSheep", pos: new THREE.Vector3(_out.x, TRAIN_Y, _out.z) });
    }

    for (const tr of players) {
      if (tr.lockTimer > 0) tr.lockTimer = Math.max(0, tr.lockTimer - dt);
      let throttle = tr.inputThrottle;
      if (tr.autopilot) throttle = BALANCE.AUTOPILOT_THROTTLE;
      if (tr.lockTimer > 0) throttle = 0;
      const target = throttle * BALANCE.MAXSPEED;
      if (tr.speed < target) tr.speed = Math.min(target, tr.speed + ACCEL * dt);
      else tr.speed = Math.max(target, tr.speed - DECEL * dt);
      advanceTrain(tr, dt, states);
      layoutTrain(tr);
    }
    for (const tr of freights) {
      advanceTrain(tr, dt, states);
      layoutTrain(tr);
    }

    updateSheep(dt);
    updateCrossing(dt, events);

    for (let i = anims.length - 1; i >= 0; i--) {
      if (anims[i](dt)) anims.splice(i, 1);
    }

    // collisions (train-train incl freight)
    const allTrains = players.concat(freights);
    if (!crashEmitted) {
      outer: for (let i = 0; i < allTrains.length; i++) {
        const A = allTrains[i];
        const ca = centersOf(A);
        const na = A._centerCount;
        for (let j = i + 1; j < allTrains.length; j++) {
          const B = allTrains[j];
          const cb = centersOf(B);
          const nb = B._centerCount;
          for (let a = 0; a < na; a++) {
            for (let b = 0; b < nb; b++) {
              const dx = ca[a].x - cb[b].x;
              const dz = ca[a].z - cb[b].z;
              if (dx * dx + dz * dz < BALANCE.COLLISION_DIST * BALANCE.COLLISION_DIST) {
                const involved = [];
                if (A.kind === "player") involved.push(A.slot);
                if (B.kind === "player") involved.push(B.slot);
                events.push({
                  type: "crash",
                  pos: new THREE.Vector3((ca[a].x + cb[b].x) / 2, TRAIN_Y, (ca[a].z + cb[b].z) / 2),
                  slots: involved,
                });
                crashEmitted = true;
                break outer;
              }
            }
          }
        }
      }
    }

    // sheep hits
    for (const tr of players) {
      getPointBack(tr, 0, _out);
      for (const sh of sheepList) {
        if (sh.phase !== "graze") continue;
        if (sh.edge !== tr.edgeId) continue;
        const d = Math.hypot(sh.pos.x - _out.x, sh.pos.z - _out.z);
        if (d < SHEEP_HIT_DIST) {
          events.push({ type: "sheepHit", slot: tr.slot, pos: new THREE.Vector3(_out.x, TRAIN_Y, _out.z) });
          fleeSheep(sh, _out.x, _out.z);
        }
      }
    }

    // car crash
    if (crossing && crossing.car && crossing.state === "closed") {
      const cp = crossing.car.position;
      for (const tr of players) {
        if (tr.edgeId !== level.npc.crossing.edge) continue;
        getPointBack(tr, 0, _out);
        const d = Math.hypot(cp.x - _out.x, cp.z - _out.z);
        if (d < CAR_HIT_DIST) {
          events.push({ type: "carCrash", slot: tr.slot, pos: new THREE.Vector3(_out.x, TRAIN_Y, _out.z) });
        }
      }
    }

    // atStation (enter zone)
    for (const tr of players) {
      getPointBack(tr, 0, _out);
      for (const st of level.stations || []) {
        const rec = stationRT(st);
        const d = Math.hypot(rec.pos.x - _out.x, rec.pos.z - _out.z);
        const inside = d < BALANCE.STATION_RADIUS;
        const was = !!tr.zones[st.id];
        if (inside && !was) {
          events.push({
            type: "atStation",
            slot: tr.slot,
            stationId: st.id,
            speed01: tr.speed / BALANCE.MAXSPEED,
          });
        }
        tr.zones[st.id] = inside;
      }
    }

    // warn (time-to-conflict)
    if (allTrains.length > 1) {
      for (const tr of allTrains) tr._projCache = projectTrain(tr, states);
      for (let i = 0; i < allTrains.length; i++) {
        for (let j = i + 1; j < allTrains.length; j++) {
          const A = allTrains[i];
          const B = allTrains[j];
          if (A.kind !== "player" && B.kind !== "player") continue;
          if (A.speed < 0.05 && B.speed < 0.05) continue;
          const pa = A._projCache;
          const pb = B._projCache;
          let ttc = -1;
          for (let k = 0; k < WARN_STEPS; k++) {
            const dx = pa[k].x - pb[k].x;
            const dz = pa[k].z - pb[k].z;
            if (dx * dx + dz * dz < WARN_DIST * WARN_DIST) {
              ttc = k * WARN_DT;
              break;
            }
          }
          if (ttc >= 0 && ttc <= BALANCE.WARN_TTC) {
            for (const P of [A, B]) {
              if (P.kind !== "player") continue;
              if (time - P.lastWarn >= 1) {
                P.lastWarn = time;
                getPointBack(P, 0, _out);
                events.push({
                  type: "warn",
                  slot: P.slot,
                  pos: new THREE.Vector3(_out.x, TRAIN_Y, _out.z),
                  ttc,
                });
              }
            }
          }
        }
      }
    }

    return events;
  }

  function tr0States() {
    const o = {};
    for (const id of rt.switchIds || []) o[id] = 0;
    return o;
  }

  // ---- public passenger ops ----
  function spawnPassenger(stationId) {
    const st = (level.stations || []).find((s) => s.id === stationId);
    if (!st) return;
    const rec = stationRT(st);
    if (rec.waiting.length >= 4) return;
    const hex = COLORS.slots[rec.slot] || COLORS.npc;
    const m = buildPassenger(hex);
    root.add(m);
    rec.waiting.push(m);
    relayoutQueue(rec);
    addPop(m, 0.35, 0);
  }
  function relayoutQueue(rec) {
    for (let i = 0; i < rec.waiting.length; i++) {
      const p = passengerSlotPos(rec, i);
      rec.waiting[i].position.set(p.x, 0, p.z);
    }
  }
  function passengersWaiting(stationId) {
    const rec = stations[stationId];
    return rec ? rec.waiting.length : 0;
  }
  function boardPassenger(slot, stationId) {
    const tr = playerBySlot[slot];
    if (!tr) return { ok: false, wagons: 0 };
    if (tr.wagons >= BALANCE.WAGON_CAP) return { ok: false, wagons: tr.wagons };
    const st = (level.stations || []).find((s) => s.id === stationId);
    const rec = st ? stationRT(st) : null;
    let hopMesh = null;
    if (rec && rec.waiting.length) {
      hopMesh = rec.waiting.shift();
      relayoutQueue(rec);
    }
    tr.wagons += 1;
    const wm = makeWagon(tr, tr.wagons - 1);
    tr.group.add(wm);
    tr.wagonMeshes.push(wm);
    placeMesh(wm, getPointBack(tr, WAGON_GAP * tr.wagons, _out2));
    addPop(wm, 0.3, 0.1);
    if (hopMesh) {
      const start = { x: hopMesh.position.x, z: hopMesh.position.z };
      getPointBack(tr, 0, _out);
      const end = { x: _out.x, z: _out.z };
      let t = 0;
      anims.push((dt) => {
        t += dt;
        const f = Math.min(1, t / 0.4);
        hopMesh.position.set(
          start.x + (end.x - start.x) * f,
          Math.sin(f * Math.PI) * 0.8,
          start.z + (end.z - start.z) * f
        );
        if (f >= 1) {
          root.remove(hopMesh);
          disposeObject(hopMesh);
          return true;
        }
        return false;
      });
    }
    return { ok: true, wagons: tr.wagons };
  }
  function deliverPassengers(slot, stationId, n) {
    const tr = playerBySlot[slot];
    if (!tr) return;
    const count = Math.min(n, tr.wagons);
    getPointBack(tr, 0, _out);
    const rec = (level.stations || []).find((s) => s.id === stationId);
    const base = rec ? stationRT(rec) : null;
    for (let i = 0; i < count; i++) {
      const w = tr.wagonMeshes.pop();
      tr.wagons -= 1;
      if (w) {
        tr.group.remove(w);
        disposeObject(w);
      }
      const hex = COLORS.slots[slot];
      const fig = buildPassenger(hex);
      root.add(fig);
      const dir = base ? base.right : { x: 1, z: 0 };
      const sx = _out.x;
      const sz = _out.z;
      let t = 0;
      const delay = i * 0.15;
      fig.position.set(sx, 0, sz);
      anims.push((dt) => {
        t += dt;
        if (t < delay) return false;
        const f = Math.min(1, (t - delay) / 1.0);
        fig.position.set(sx + dir.x * 2 * f, Math.sin(f * Math.PI) * 0.3, sz + dir.z * 2 * f);
        fig.traverse((o) => {
          if (o.isMesh && o.material) o.material.transparent = true, (o.material.opacity = 1 - f);
        });
        if (f >= 1) {
          root.remove(fig);
          disposeObject(fig);
          return true;
        }
        return false;
      });
    }
  }

  // ---- control ----
  function setThrottle(slot, v) {
    const tr = playerBySlot[slot];
    if (tr) tr.inputThrottle = clamp01(v);
  }
  function horn(slot) {
    hornQueue.push(slot);
  }
  function setSwitchStates(states) {
    if (!states) return;
    for (const tr of players) tr.states = states;
    if (rt.switchStates) Object.assign(rt.switchStates, states);
  }
  function stateOf(slot) {
    const tr = playerBySlot[slot];
    if (!tr) return null;
    getPointBack(tr, 0, _out);
    return {
      speed01: tr.speed / BALANCE.MAXSPEED,
      wagons: tr.wagons,
      stopped: tr.speed < 0.02,
      pos: new THREE.Vector3(_out.x, TRAIN_Y, _out.z),
    };
  }
  function emergencyStop(slot, seconds) {
    const tr = playerBySlot[slot];
    if (!tr) return;
    tr.speed = 0;
    tr.lockTimer = Math.max(tr.lockTimer, seconds);
  }
  function autopilot(slot, on) {
    const tr = playerBySlot[slot];
    if (tr) tr.autopilot = !!on;
  }

  function reset() {
    for (const tr of players) {
      tr.group.clear();
      root.remove(tr.group);
    }
    for (const tr of freights) {
      tr.group.clear();
      root.remove(tr.group);
    }
    for (const sh of sheepList) {
      root.remove(sh.mesh);
      disposeObject(sh.mesh);
    }
    for (const id of Object.keys(stations)) {
      for (const w of stations[id].waiting) {
        root.remove(w);
        disposeObject(w);
      }
      delete stations[id];
    }
    if (crossing && crossing.car) {
      root.remove(crossing.car);
      disposeObject(crossing.car);
    }
    players.length = 0;
    freights.length = 0;
    sheepList.length = 0;
    anims.length = 0;
    hornQueue.length = 0;
    for (const k of Object.keys(playerBySlot)) delete playerBySlot[k];
    crashEmitted = false;
    time = 0;
    buildAll();
  }

  function dispose() {
    reset();
    for (const tr of players.concat(freights)) {
      tr.group.clear();
      root.remove(tr.group);
    }
    if (scene && scene.remove) scene.remove(root);
    root.clear();
  }

  function buildAll() {
    for (const slot of slots) newPlayer(slot);
    if (level.npc && level.npc.freight && level.npc.freight.count) {
      const nF = level.npc.freight.count[difficulty] || 0;
      for (let i = 0; i < nF; i++) {
        const carriages = 2 + ((i + (difficulty === "hard" ? 1 : 0)) % 2);
        newFreight(level.npc.freight, carriages);
      }
    }
    if (level.npc && level.npc.sheepSpots && level.npc.sheepSpots.length) {
      const spots = level.npc.sheepSpots;
      const k = difficultyCount(spots);
      const used = spots.slice(0, k);
      for (const sp of used) newSheep(sp, spots);
    }
    initCrossing();
  }

  // async GLB skinning
  async function loadTemplates() {
    const loader = await getLoader();
    async function one(path) {
      try {
        const g = await Promise.resolve(loader(path));
        return g || null;
      } catch (e) {
        return null;
      }
    }
    const [head, wagon, floco, coal, box, tank] = await Promise.all([
      one(ASSETS.MODELS.trains.playerHead),
      one(ASSETS.MODELS.trains.playerWagon),
      one(ASSETS.MODELS.trains.freightLoco),
      one(ASSETS.MODELS.trains.freightCoal),
      one(ASSETS.MODELS.trains.freightBox),
      one(ASSETS.MODELS.trains.freightTank),
    ]);
    let changed = false;
    if (head) {
      TPL.head = head;
      changed = true;
    }
    if (wagon) {
      TPL.wagon = wagon;
      changed = true;
    }
    if (floco) {
      TPL.freightLoco = floco;
      changed = true;
    }
    if (coal) TPL.carriages.coal = coal;
    if (box) TPL.carriages.box = box;
    if (tank) TPL.carriages.tank = tank;
    if (changed || coal || box || tank) {
      for (const tr of players.concat(freights)) rebuildMeshes(tr);
    }
  }

  buildAll();
  loadTemplates();

  return {
    group: root,
    setThrottle,
    horn,
    setSwitchStates,
    update,
    boardPassenger,
    deliverPassengers,
    passengersWaiting,
    spawnPassenger,
    state: stateOf,
    emergencyStop,
    autopilot,
    reset,
    dispose,
    _centers(slot) {
      const tr = playerBySlot[slot];
      if (!tr) return [];
      const c = centersOf(tr);
      return c.slice(0, tr._centerCount).map((p) => ({ x: p.x, z: p.z }));
    },
  };
}

function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x && x.dispose && x.dispose());
      else if (m && m.dispose) m.dispose();
    }
  });
}
