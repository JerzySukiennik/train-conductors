// track.js — Grand Conductors track engine
// Graph runtime (pure logic, THREE-free) + procedural track/road geometry (THREE).
// Exports: buildTrackRuntime(level), buildTrackMesh(level, rt), graphSelfTest(level).
// Graph walk (nextEdge) is a pure lookup: switch facing moves use options[state],
// trailing moves through a switch always continue to switch.from ("sprung switch"),
// plain nodes continue to the unique other edge, and >2-edge switchless nodes use a
// continuation map precomputed once from control-point tangents (best alignment).

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const COLORS = {
  ballast: 0x8b6f47,
  ties: 0x5d4330,
  rails: 0xb8c4cc,
  road: 0x3a3f44,
  dash: 0xf2f2f2,
  switchDisc: 0x9aa4ad,
};

function controlPoints(level, edge) {
  const a = level.nodes[edge.a];
  const b = level.nodes[edge.b];
  const pts = [a];
  if (edge.via) for (const v of edge.via) pts.push(v);
  pts.push(b);
  return pts;
}

function norm2(x, z) {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

function awayDir(level, edge, nodeId) {
  const pts = controlPoints(level, edge);
  if (edge.a === nodeId) {
    return norm2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  }
  const n = pts.length;
  return norm2(pts[n - 2][0] - pts[n - 1][0], pts[n - 2][1] - pts[n - 1][1]);
}

function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return L;
}

function buildGraphCore(level) {
  const edgesById = {};
  const edgesAtNode = {};
  const switchByNode = {};
  const switchById = {};
  for (const e of level.edges) {
    edgesById[e.id] = e;
    (edgesAtNode[e.a] = edgesAtNode[e.a] || []).push(e.id);
    if (e.b !== e.a) (edgesAtNode[e.b] = edgesAtNode[e.b] || []).push(e.id);
  }
  for (const sw of level.switches || []) {
    switchByNode[sw.node] = sw;
    switchById[sw.id] = sw;
  }
  const continuation = {};
  for (const nodeId of Object.keys(edgesAtNode)) {
    const list = edgesAtNode[nodeId];
    if (list.length <= 2) continue;
    const map = {};
    for (const inId of list) {
      const inAway = awayDir(level, edgesById[inId], nodeId);
      const incoming = [-inAway[0], -inAway[1]];
      let best = null;
      let bestDot = -Infinity;
      for (const outId of list) {
        if (outId === inId) continue;
        const outAway = awayDir(level, edgesById[outId], nodeId);
        const d = incoming[0] * outAway[0] + incoming[1] * outAway[1];
        if (d > bestDot) {
          bestDot = d;
          best = outId;
        }
      }
      map[inId] = best;
    }
    continuation[nodeId] = map;
  }
  return { level, edgesById, edgesAtNode, switchByNode, switchById, continuation };
}

function coreNextEdge(core, edgeId, dir, switchStates) {
  const e = core.edgesById[edgeId];
  if (!e) return null;
  const node = dir > 0 ? e.b : e.a;
  const sw = core.switchByNode[node];
  let nextId = null;
  if (sw) {
    if (sw.from === edgeId) {
      const st = switchStates && switchStates[sw.id] === 1 ? 1 : 0;
      nextId = sw.options[st] != null ? sw.options[st] : sw.options[0];
    } else if (sw.options.indexOf(edgeId) !== -1) {
      nextId = sw.from;
    }
  }
  if (!nextId) {
    const others = (core.edgesAtNode[node] || []).filter((id) => id !== edgeId);
    if (others.length === 1) nextId = others[0];
    else if (others.length > 1) {
      const map = core.continuation[node];
      nextId = (map && map[edgeId]) || others[0];
    }
  }
  if (!nextId) return null;
  const ne = core.edgesById[nextId];
  if (!ne) return null;
  return { edgeId: nextId, dir: ne.a === node ? 1 : -1 };
}

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

export function graphSelfTest(level) {
  const problems = [];
  const nodeIds = Object.keys(level.nodes || {});
  if (!nodeIds.length) problems.push("no nodes");
  if (!level.edges || !level.edges.length) problems.push("no edges");
  const edgeIds = new Set();
  for (const e of level.edges || []) {
    if (edgeIds.has(e.id)) problems.push(`duplicate edge id ${e.id}`);
    edgeIds.add(e.id);
    if (!level.nodes[e.a]) problems.push(`edge ${e.id}: unknown node a=${e.a}`);
    if (!level.nodes[e.b]) problems.push(`edge ${e.id}: unknown node b=${e.b}`);
    if (e.via) {
      for (const v of e.via) {
        if (!Array.isArray(v) || v.length !== 2 || !isFinite(v[0]) || !isFinite(v[1])) {
          problems.push(`edge ${e.id}: bad via point`);
        }
      }
    }
    if (level.nodes[e.a] && level.nodes[e.b]) {
      const len = polylineLength(controlPoints(level, e));
      if (!(len > 2)) problems.push(`edge ${e.id}: length ${len.toFixed(2)} <= 2`);
    }
  }
  for (const sw of level.switches || []) {
    if (!level.nodes[sw.node]) problems.push(`switch ${sw.id}: unknown node ${sw.node}`);
    if (!edgeIds.has(sw.from)) problems.push(`switch ${sw.id}: unknown from ${sw.from}`);
    if (!sw.options || sw.options.length !== 2) problems.push(`switch ${sw.id}: needs 2 options`);
    for (const opt of sw.options || []) {
      if (!edgeIds.has(opt)) problems.push(`switch ${sw.id}: unknown option ${opt}`);
    }
    const touching = (level.edges || []).filter(
      (e) => e.a === sw.node || e.b === sw.node
    ).map((e) => e.id);
    for (const ref of [sw.from, ...(sw.options || [])]) {
      if (edgeIds.has(ref) && touching.indexOf(ref) === -1) {
        problems.push(`switch ${sw.id}: edge ${ref} does not touch node ${sw.node}`);
      }
    }
  }
  for (const st of level.stations || []) {
    if (!edgeIds.has(st.edge)) problems.push(`station ${st.id}: unknown edge ${st.edge}`);
    if (!(st.t >= 0 && st.t <= 1)) problems.push(`station ${st.id}: t out of range`);
  }
  const spawns = level.spawns || {};
  for (const slot of Object.keys(spawns)) {
    const sp = spawns[slot];
    if (!edgeIds.has(sp.edge)) problems.push(`spawn ${slot}: unknown edge ${sp.edge}`);
    if (sp.dir !== 1 && sp.dir !== -1) problems.push(`spawn ${slot}: dir must be 1 or -1`);
  }
  if (problems.length) return { ok: false, problems };

  const core = buildGraphCore(level);
  const switchIds = (level.switches || []).map((s) => s.id);
  for (const slot of Object.keys(spawns)) {
    const sp = spawns[slot];
    const rand = mulberry32(1234 + Number(slot));
    const states = {};
    for (const id of switchIds) states[id] = 0;
    let cur = { edgeId: sp.edge, dir: sp.dir };
    for (let step = 0; step < 500; step++) {
      if (switchIds.length && rand() < 0.3) {
        const id = switchIds[Math.floor(rand() * switchIds.length)];
        states[id] = states[id] ? 0 : 1;
      }
      const next = coreNextEdge(core, cur.edgeId, cur.dir, states);
      if (!next) {
        problems.push(
          `spawn ${slot}: dead end at step ${step} on edge ${cur.edgeId} dir ${cur.dir}`
        );
        break;
      }
      cur = next;
    }
  }
  return { ok: problems.length === 0, problems };
}

export function buildTrackRuntime(level) {
  const core = buildGraphCore(level);
  const edges = new Map();
  const samplers = new Map();
  for (const e of level.edges) {
    const pts = controlPoints(level, e).map((p) => new THREE.Vector3(p[0], 0, p[1]));
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
    curve.arcLengthDivisions = 200;
    curve.getLengths(200);
    const length = curve.getLength();
    edges.set(e.id, { a: e.a, b: e.b, curve, length });
  }
  function sampler(edgeId) {
    let s = samplers.get(edgeId);
    if (s) return s;
    const e = edges.get(edgeId);
    if (!e) return null;
    s = {
      length: e.length,
      pointAt(t) {
        const p = e.curve.getPointAt(Math.min(1, Math.max(0, t)));
        p.y = 0;
        return p;
      },
      tangentAt(t) {
        const tg = e.curve.getTangentAt(Math.min(1, Math.max(0, t)));
        tg.y = 0;
        return tg.normalize();
      },
    };
    samplers.set(edgeId, s);
    return s;
  }
  const switchIds = (level.switches || []).map((s) => s.id).sort();
  const rt = {
    edges,
    core,
    sampler,
    nextEdge(edgeId, dir, switchStates) {
      return coreNextEdge(core, edgeId, dir, switchStates);
    },
    switchIds,
    defaultSwitchStates() {
      const o = {};
      for (const id of switchIds) o[id] = 0;
      return o;
    },
    nodeOf(edgeId, end) {
      const e = edges.get(edgeId);
      if (!e) return null;
      if (end === "a" || end === -1 || end === 0) return e.a;
      return e.b;
    },
    nodePos(nodeId) {
      const p = level.nodes[nodeId];
      return p ? new THREE.Vector3(p[0], 0, p[1]) : null;
    },
    stationPos(station) {
      const s = sampler(station.edge);
      if (!s) return null;
      return { pos: s.pointAt(station.t), tangent: s.tangentAt(station.t) };
    },
  };
  rt.switchStates = rt.defaultSwitchStates();
  return rt;
}

function ribbonGeometry(curve, halfWidth, yTop, yBottom, offset, step) {
  const length = curve.getLength();
  const n = Math.max(2, Math.ceil(length / step));
  const L = [];
  const R = [];
  const S = [];
  const _side = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = curve.getPointAt(u);
    const tg = curve.getTangentAt(u);
    _side.set(tg.z, 0, -tg.x).normalize();
    const cx = p.x + _side.x * offset;
    const cz = p.z + _side.z * offset;
    L.push([cx + _side.x * halfWidth, cz + _side.z * halfWidth]);
    R.push([cx - _side.x * halfWidth, cz - _side.z * halfWidth]);
    S.push([_side.x, _side.z]);
  }
  const pos = [];
  const nor = [];
  function tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz) {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }
  function quad(a, b, c, d, nx, ny, nz) {
    tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], nx, ny, nz);
    tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], nx, ny, nz);
  }
  for (let i = 0; i < n; i++) {
    quad(
      [L[i][0], yTop, L[i][1]],
      [R[i][0], yTop, R[i][1]],
      [R[i + 1][0], yTop, R[i + 1][1]],
      [L[i + 1][0], yTop, L[i + 1][1]],
      0, 1, 0
    );
    if (yBottom !== null && yBottom !== yTop) {
      quad(
        [L[i][0], yBottom, L[i][1]],
        [L[i][0], yTop, L[i][1]],
        [L[i + 1][0], yTop, L[i + 1][1]],
        [L[i + 1][0], yBottom, L[i + 1][1]],
        S[i][0], 0, S[i][1]
      );
      quad(
        [R[i][0], yTop, R[i][1]],
        [R[i][0], yBottom, R[i][1]],
        [R[i + 1][0], yBottom, R[i + 1][1]],
        [R[i + 1][0], yTop, R[i + 1][1]],
        -S[i][0], 0, -S[i][1]
      );
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

export function buildTrackMesh(level, rt) {
  const group = new THREE.Group();
  const ballastGeos = [];
  const railGeos = [];
  const tieTransforms = [];
  const _q = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);

  for (const [, e] of rt.edges) {
    ballastGeos.push(ribbonGeometry(e.curve, 0.7, 0.1, 0, 0, 0.8));
    railGeos.push(ribbonGeometry(e.curve, 0.045, 0.245, 0.155, 0.35, 0.5));
    railGeos.push(ribbonGeometry(e.curve, 0.045, 0.245, 0.155, -0.35, 0.5));
    const count = Math.floor(e.length / 0.55);
    for (let i = 0; i < count; i++) {
      const u = ((i + 0.5) * 0.55) / e.length;
      if (u > 1) break;
      const p = e.curve.getPointAt(u);
      const tg = e.curve.getTangentAt(u);
      tieTransforms.push({ x: p.x, z: p.z, yaw: Math.atan2(tg.x, tg.z) });
    }
  }

  const ballastMat = new THREE.MeshStandardMaterial({
    color: COLORS.ballast,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const ballastMesh = new THREE.Mesh(mergeGeometries(ballastGeos), ballastMat);
  ballastMesh.receiveShadow = true;
  group.add(ballastMesh);
  for (const g of ballastGeos) g.dispose();

  const railMat = new THREE.MeshStandardMaterial({
    color: COLORS.rails,
    roughness: 0.35,
    metalness: 0.4,
    side: THREE.DoubleSide,
  });
  const railMesh = new THREE.Mesh(mergeGeometries(railGeos), railMat);
  railMesh.receiveShadow = true;
  group.add(railMesh);
  for (const g of railGeos) g.dispose();

  const tieGeo = new THREE.BoxGeometry(1.1, 0.06, 0.28);
  const tieMat = new THREE.MeshStandardMaterial({
    color: COLORS.ties,
    roughness: 0.9,
    metalness: 0,
  });
  const ties = new THREE.InstancedMesh(tieGeo, tieMat, tieTransforms.length);
  const _m = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _scl = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < tieTransforms.length; i++) {
    const t = tieTransforms[i];
    _pos.set(t.x, 0.13, t.z);
    _q.setFromAxisAngle(_up, t.yaw);
    _m.compose(_pos, _q, _scl);
    ties.setMatrixAt(i, _m);
  }
  ties.instanceMatrix.needsUpdate = true;
  ties.receiveShadow = true;
  group.add(ties);

  const anchors = {};
  if (level.switches && level.switches.length) {
    const discGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.08, 20);
    const discMat = new THREE.MeshStandardMaterial({
      color: COLORS.switchDisc,
      roughness: 0.7,
      metalness: 0.1,
    });
    for (const sw of level.switches) {
      const np = level.nodes[sw.node];
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.set(np[0], 0.04, np[1]);
      disc.receiveShadow = true;
      group.add(disc);
      const dirs = sw.options.map((optId) => {
        const e = rt.edges.get(optId);
        const opt = level.edges.find((x) => x.id === optId);
        let tg;
        if (opt.a === sw.node) {
          tg = e.curve.getTangentAt(0);
        } else {
          tg = e.curve.getTangentAt(1).multiplyScalar(-1);
        }
        tg.y = 0;
        return tg.normalize();
      });
      anchors[sw.id] = {
        pos: new THREE.Vector3(np[0], 0, np[1]),
        dirA: dirs[0],
        dirB: dirs[1],
      };
    }
  }
  group.userData.switchAnchors = anchors;

  if (level.npc && level.npc.crossing && level.npc.crossing.road) {
    const roadPts = level.npc.crossing.road.map(
      (p) => new THREE.Vector3(p[0], 0, p[1])
    );
    const roadCurve = new THREE.CatmullRomCurve3(roadPts, false, "centripetal", 0.5);
    roadCurve.arcLengthDivisions = 100;
    const roadMat = new THREE.MeshStandardMaterial({
      color: COLORS.road,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const roadGeo = ribbonGeometry(roadCurve, 1.2, 0.06, null, 0, 1.0);
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    group.add(roadMesh);

    const roadLen = roadCurve.getLength();
    const dashCount = Math.max(0, Math.floor(roadLen / 1.5));
    if (dashCount > 0) {
      const dashGeo = new THREE.BoxGeometry(0.08, 0.02, 0.6);
      const dashMat = new THREE.MeshStandardMaterial({
        color: COLORS.dash,
        roughness: 0.6,
        metalness: 0,
      });
      const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
      for (let i = 0; i < dashCount; i++) {
        const u = ((i + 0.5) * 1.5) / roadLen;
        const p = roadCurve.getPointAt(Math.min(1, u));
        const tg = roadCurve.getTangentAt(Math.min(1, u));
        _pos.set(p.x, 0.075, p.z);
        _q.setFromAxisAngle(_up, Math.atan2(tg.x, tg.z));
        _m.compose(_pos, _q, _scl);
        dashes.setMatrixAt(i, _m);
      }
      dashes.instanceMatrix.needsUpdate = true;
      group.add(dashes);
    }
  }

  return group;
}
