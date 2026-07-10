// levels.js — Grand Conductors LEVELS[5] dataset + corner-fillet smoothing (v1).
// The planner (embedded below) builds every level from ellipse-polygon rings joined by
// straight chords, so nodes/edges are computed, guaranteeing the "no dead end" invariant.
// The planner emits STRAIGHT chords; smoothLevel() rounds every degree-2 corner into a
// circular-arc fillet (via points) so the finished track curves like the Conduct trailer,
// while preserving topology exactly (same nodes/edges/switch letters). game.js/scene.js
// consume getLevel(i) = smoothed deep copy (memoized). smoothLevel keeps graphSelfTest green.

// ---------------------------------------------------------------------------
// Planner (embedded from planner-levels-draft.js — validated straight-chord data)
// ---------------------------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100;
}

function ellipseRing(prefix, cx, cz, rx, rz, n) {
  const nodes = {};
  const ring = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const id = `${prefix}${i}`;
    nodes[id] = [round2(cx + rx * Math.cos(ang)), round2(cz + rz * Math.sin(ang))];
    ring.push(id);
  }
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    edges.push({ id: `${prefix}e${i}`, a, b });
  }
  return { nodes, edges, ring };
}

function ringSwitch(letter, ring, edges, idx, extraEdgeId) {
  const n = ring.length;
  const prevEdge = edges[(idx - 1 + n) % n].id;
  const nextEdge = edges[idx % n].id;
  return { id: letter, node: ring[idx], from: prevEdge, options: [nextEdge, extraEdgeId] };
}

function mergeNodes(...maps) {
  return Object.assign({}, ...maps);
}

function nodeOf(level, id) {
  return level.nodes[id];
}

function edgeMidpoint(level, edgeId) {
  const e = level.edges.find((x) => x.id === edgeId);
  const a = nodeOf(level, e.a);
  const b = nodeOf(level, e.b);
  return [round2((a[0] + b[0]) / 2), round2((a[1] + b[1]) / 2)];
}

function edgeRoadCrossing(level, edgeId, halfLen) {
  const e = level.edges.find((x) => x.id === edgeId);
  const a = nodeOf(level, e.a);
  const b = nodeOf(level, e.b);
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;
  const [mx, mz] = edgeMidpoint(level, edgeId);
  return [
    [round2(mx - px * halfLen), round2(mz - pz * halfLen)],
    [round2(mx + px * halfLen), round2(mz + pz * halfLen)],
  ];
}

function buildL1() {
  const ring = ellipseRing("m", 0, 0, 17, 9, 10);
  const chord = { id: "mcShortcut", a: "m1", b: "m6" };
  const edges = [...ring.edges, chord];
  const A = ringSwitch("A", ring.ring, ring.edges, 1, "mcShortcut");
  const B = ringSwitch("B", ring.ring, ring.edges, 6, "mcShortcut");
  const level = {
    id: "L1",
    nameKey: "level.1.name",
    island: { w: 42, d: 26 },
    nodes: mergeNodes(ring.nodes),
    edges,
    switches: [A, B],
    stations: [
      { id: "s1", edge: "me2", t: 0.5, slot: 0, home: true },
      { id: "s2", edge: "me8", t: 0.5, slot: 1, home: true },
      { id: "s3", edge: "me4", t: 0.5, slot: 2, home: true },
    ],
    npc: {
      freight: null,
      sheepSpots: [
        { edge: "me3", t: 0.5 },
        { edge: "me9", t: 0.5 },
      ],
      crossing: null,
    },
    goal: { deliver: 6, time: 150 },
    decor: { seed: 1, treeDensity: 0.5, rocks: [], bridges: [], tunnels: [] },
    spawns: {
      0: { edge: "me2", t: 0.5, dir: 1 },
      1: { edge: "me8", t: 0.5, dir: 1 },
      2: { edge: "me4", t: 0.5, dir: 1 },
    },
  };
  return level;
}

function buildL2() {
  const ringA = ellipseRing("a", -8, 0, 10, 9, 12);
  const ringB = ellipseRing("b", 8, 0, 10, 9, 12);
  const chordTop = { id: "chordTop", a: "a3", b: "b3" };
  const chordBot = { id: "chordBot", a: "a9", b: "b9" };
  const edges = [...ringA.edges, ...ringB.edges, chordTop, chordBot];
  const A = ringSwitch("A", ringA.ring, ringA.edges, 3, "chordTop");
  const B = ringSwitch("B", ringB.ring, ringB.edges, 3, "chordTop");
  const C = ringSwitch("C", ringA.ring, ringA.edges, 9, "chordBot");
  const D = ringSwitch("D", ringB.ring, ringB.edges, 9, "chordBot");
  const level = {
    id: "L2",
    nameKey: "level.2.name",
    island: { w: 46, d: 26 },
    nodes: mergeNodes(ringA.nodes, ringB.nodes),
    edges,
    switches: [A, B, C, D],
    stations: [
      { id: "s1", edge: "ae5", t: 0.5, slot: 0, home: true },
      { id: "s2", edge: "be5", t: 0.5, slot: 1, home: true },
      { id: "s3", edge: "ae11", t: 0.5, slot: 2, home: true },
      { id: "s4", edge: "be11", t: 0.5, slot: 0 },
      { id: "s5", edge: "ae7", t: 0.5, slot: 1 },
    ],
    npc: {
      freight: null,
      sheepSpots: [
        { edge: "be7", t: 0.4 },
        { edge: "ae4", t: 0.6 },
      ],
      crossing: { edge: "ae0", t: 0.5, road: null, period: { easy: 14, normal: 10, hard: 7 } },
    },
    goal: { deliver: 8, time: 170 },
    decor: { seed: 2, treeDensity: 0.55, rocks: [], bridges: [], tunnels: [] },
    spawns: {
      0: { edge: "ae5", t: 0.5, dir: 1 },
      1: { edge: "be5", t: 0.5, dir: 1 },
      2: { edge: "ae11", t: 0.5, dir: 1 },
    },
  };
  level.npc.crossing.road = edgeRoadCrossing(level, "ae0", 4);
  return level;
}

function buildL3() {
  const ringA = ellipseRing("a", -9, 0, 11, 9, 12);
  const ringB = ellipseRing("b", 9, 0, 11, 9, 12);
  const freight = ellipseRing("f", 0, 0, 6, 13, 8);
  const siding = { id: "siding", a: "a2", b: "a4" };
  const interlock = { id: "interlock", a: "a9", b: "b9" };
  const edges = [...ringA.edges, ...ringB.edges, ...freight.edges, siding, interlock];
  const A = ringSwitch("A", ringA.ring, ringA.edges, 2, "siding");
  const B = ringSwitch("B", ringA.ring, ringA.edges, 4, "siding");
  const C = ringSwitch("C", ringA.ring, ringA.edges, 9, "interlock");
  const D = ringSwitch("D", ringB.ring, ringB.edges, 9, "interlock");
  const level = {
    id: "L3",
    nameKey: "level.3.name",
    island: { w: 50, d: 34 },
    nodes: mergeNodes(ringA.nodes, ringB.nodes, freight.nodes),
    edges,
    switches: [A, B, C, D],
    stations: [
      { id: "s1", edge: "ae6", t: 0.5, slot: 0, home: true },
      { id: "s2", edge: "be6", t: 0.5, slot: 1, home: true },
      { id: "s3", edge: "ae10", t: 0.5, slot: 2, home: true },
      { id: "s4", edge: "be0", t: 0.5, slot: 0 },
      { id: "s5", edge: "ae0", t: 0.5, slot: 1 },
    ],
    npc: {
      freight: { path: freight.edges.map((e) => e.id), speed: 0.45, count: { easy: 0, normal: 1, hard: 1 } },
      sheepSpots: [
        { edge: "ae5", t: 0.4 },
        { edge: "be3", t: 0.5 },
        { edge: "ae7", t: 0.6 },
      ],
      crossing: null,
    },
    goal: { deliver: 10, time: 190 },
    decor: { seed: 3, treeDensity: 0.6, rocks: [], bridges: [], tunnels: [] },
    spawns: {
      0: { edge: "ae6", t: 0.5, dir: 1 },
      1: { edge: "be6", t: 0.5, dir: 1 },
      2: { edge: "ae10", t: 0.5, dir: 1 },
    },
  };
  return level;
}

function buildL4() {
  const ringA = ellipseRing("a", -9, 0, 11, 9, 12);
  const ringB = ellipseRing("b", 9, 0, 11, 9, 12);
  const freight = ellipseRing("f", 0, 0, 6, 13, 8);
  const chordTop = { id: "chordTop", a: "a3", b: "b3" };
  const chordBot = { id: "chordBot", a: "a9", b: "b9" };
  const sidingB = { id: "sidingB", a: "b0", b: "b2" };
  const edges = [...ringA.edges, ...ringB.edges, ...freight.edges, chordTop, chordBot, sidingB];
  const A = ringSwitch("A", ringA.ring, ringA.edges, 3, "chordTop");
  const B = ringSwitch("B", ringB.ring, ringB.edges, 3, "chordTop");
  const C = ringSwitch("C", ringA.ring, ringA.edges, 9, "chordBot");
  const D = ringSwitch("D", ringB.ring, ringB.edges, 9, "chordBot");
  const E = ringSwitch("E", ringB.ring, ringB.edges, 0, "sidingB");
  const F = ringSwitch("F", ringB.ring, ringB.edges, 2, "sidingB");
  const level = {
    id: "L4",
    nameKey: "level.4.name",
    island: { w: 50, d: 34 },
    nodes: mergeNodes(ringA.nodes, ringB.nodes, freight.nodes),
    edges,
    switches: [A, B, C, D, E, F],
    stations: [
      { id: "s1", edge: "ae5", t: 0.5, slot: 0, home: true },
      { id: "s2", edge: "be5", t: 0.5, slot: 1, home: true },
      { id: "s3", edge: "ae10", t: 0.5, slot: 2, home: true },
      { id: "s4", edge: "be7", t: 0.5, slot: 0 },
      { id: "s5", edge: "ae1", t: 0.5, slot: 1 },
      { id: "s6", edge: "be10", t: 0.5, slot: 2 },
    ],
    npc: {
      freight: { path: freight.edges.map((e) => e.id), speed: 0.5, count: { easy: 0, normal: 1, hard: 1 } },
      sheepSpots: [
        { edge: "ae7", t: 0.4 },
        { edge: "be4", t: 0.6 },
        { edge: "ae4", t: 0.7 },
      ],
      crossing: { edge: "ae0", t: 0.5, road: null, period: { easy: 12, normal: 9, hard: 6 } },
    },
    goal: { deliver: 12, time: 215 },
    decor: {
      seed: 4,
      treeDensity: 0.65,
      rocks: [],
      bridges: [{ edge: "ae6", t0: 0.35, t1: 0.65 }],
      tunnels: [{ edge: "be6", t0: 0.35, t1: 0.65 }],
    },
    spawns: {
      0: { edge: "ae5", t: 0.5, dir: 1 },
      1: { edge: "be5", t: 0.5, dir: 1 },
      2: { edge: "ae10", t: 0.5, dir: 1 },
    },
  };
  level.npc.crossing.road = edgeRoadCrossing(level, "ae0", 4);
  return level;
}

function buildL5() {
  const ringA = ellipseRing("a", -10, -1, 11, 9, 12);
  const ringB = ellipseRing("b", 10, -1, 11, 9, 12);
  const ringC = ellipseRing("c", 0, 10, 8, 4, 8);
  const freight = ellipseRing("f", 0, -1, 6, 13, 8);
  const chordTop = { id: "chordTop", a: "a3", b: "b3" };
  const chordBot = { id: "chordBot", a: "a9", b: "b9" };
  const chordAC = { id: "chordAC", a: "a0", b: "c2" };
  const chordBC = { id: "chordBC", a: "b0", b: "c6" };
  const edges = [
    ...ringA.edges,
    ...ringB.edges,
    ...ringC.edges,
    ...freight.edges,
    chordTop,
    chordBot,
    chordAC,
    chordBC,
  ];
  const A = ringSwitch("A", ringA.ring, ringA.edges, 3, "chordTop");
  const B = ringSwitch("B", ringB.ring, ringB.edges, 3, "chordTop");
  const C = ringSwitch("C", ringA.ring, ringA.edges, 9, "chordBot");
  const D = ringSwitch("D", ringB.ring, ringB.edges, 9, "chordBot");
  const E = ringSwitch("E", ringA.ring, ringA.edges, 0, "chordAC");
  const F = ringSwitch("F", ringC.ring, ringC.edges, 2, "chordAC");
  const G = ringSwitch("G", ringB.ring, ringB.edges, 0, "chordBC");
  const H = ringSwitch("H", ringC.ring, ringC.edges, 6, "chordBC");
  const level = {
    id: "L5",
    nameKey: "level.5.name",
    island: { w: 52, d: 38 },
    nodes: mergeNodes(ringA.nodes, ringB.nodes, ringC.nodes, freight.nodes),
    edges,
    switches: [A, B, C, D, E, F, G, H],
    stations: [
      { id: "s1", edge: "ae5", t: 0.5, slot: 0, home: true },
      { id: "s2", edge: "be5", t: 0.5, slot: 1, home: true },
      { id: "s3", edge: "ce3", t: 0.5, slot: 2, home: true },
      { id: "s4", edge: "be6", t: 0.5, slot: 0 },
      { id: "s5", edge: "ae6", t: 0.5, slot: 1 },
      { id: "s6", edge: "ce7", t: 0.5, slot: 2 },
      { id: "s7", edge: "be10", t: 0.5, slot: 1 },
    ],
    npc: {
      freight: { path: freight.edges.map((e) => e.id), speed: 0.55, count: { easy: 1, normal: 1, hard: 2 } },
      sheepSpots: [
        { edge: "ae1", t: 0.4 },
        { edge: "be1", t: 0.5 },
        { edge: "ce0", t: 0.5 },
        { edge: "ae10", t: 0.6 },
      ],
      crossing: { edge: "ae7", t: 0.5, road: null, period: { easy: 11, normal: 8, hard: 6 } },
    },
    goal: { deliver: 14, time: 240 },
    decor: {
      seed: 5,
      treeDensity: 0.7,
      rocks: [],
      bridges: [{ edge: "ae4", t0: 0.3, t1: 0.6 }],
      tunnels: [{ edge: "be4", t0: 0.3, t1: 0.6 }],
    },
    spawns: {
      0: { edge: "ae5", t: 0.5, dir: 1 },
      1: { edge: "be5", t: 0.5, dir: 1 },
      2: { edge: "ce3", t: 0.5, dir: 1 },
    },
  };
  level.npc.crossing.road = edgeRoadCrossing(level, "ae7", 4);
  return level;
}

export const LEVELS = [buildL1(), buildL2(), buildL3(), buildL4(), buildL5()];

export const BALANCE_TUNED = {};

// ---------------------------------------------------------------------------
// Corner-fillet smoothing
// ---------------------------------------------------------------------------
//
// The planner emits straight chords. At every degree-2 node (a plain ring node,
// never a switch) where the two touching edge polylines bend by more than ~15°,
// we round the corner with an inscribed circular arc:
//   - tangent points T1, T2 sit at setback t = r/tan(phi/2) along each edge,
//   - the arc apex M (closest circle point to the corner) becomes the new node,
//   - arc samples are distributed as via points into each edge's node-end.
// Radius r is clamped to <= half the shorter adjacent segment (and <= 3.5), and
// the setback is capped so opposing fillets on a short edge can never cross.
// Switch nodes (degree >= 3) are skipped so switch geometry / graph continuation
// tangents stay identical -> topology and graphSelfTest are preserved.

const FILLET = {
  minBendDeg: 15, // below this the corner is basically straight -> leave it
  baseRadius: 3.2, // preferred fillet radius (world units); clamped per corner
  maxRadius: 3.5,
  maxSetbackFrac: 0.45, // setback <= this * shorter adjacent segment length
  segPerRad: 7, // arc samples per radian of half-arc (density of via points)
  maxHalfPts: 5,
};

function v2sub(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}
function v2len(a) {
  return Math.hypot(a[0], a[1]);
}
function v2norm(a) {
  const l = v2len(a) || 1;
  return [a[0] / l, a[1] / l];
}

// control-point list of an edge in a (possibly smoothed) level: [a, ...via, b]
function ctrlPts(level, edge) {
  const pts = [level.nodes[edge.a]];
  if (edge.via) for (const v of edge.via) pts.push(v);
  pts.push(level.nodes[edge.b]);
  return pts;
}

// direction leaving `nodeId` along `edge`, plus distance to the adjacent ctrl point
function awayInfo(level, edge, nodeId) {
  const pts = ctrlPts(level, edge);
  let base, neigh;
  if (edge.a === nodeId) {
    base = pts[0];
    neigh = pts[1];
  } else {
    base = pts[pts.length - 1];
    neigh = pts[pts.length - 2];
  }
  const d = v2sub(neigh, base);
  return { dir: v2norm(d), segLen: v2len(d) };
}

function shortDelta(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// arc samples from apex M (exclusive) to tangent point (inclusive), ordered M->T
function arcSamples(cx, cz, r, aM, aT) {
  const delta = shortDelta(aM, aT);
  const n = Math.min(
    FILLET.maxHalfPts,
    Math.max(2, Math.round(Math.abs(delta) * FILLET.segPerRad))
  );
  const out = [];
  for (let j = 1; j <= n; j++) {
    const ang = aM + delta * (j / n);
    out.push([round2(cx + r * Math.cos(ang)), round2(cz + r * Math.sin(ang))]);
  }
  return out; // last element == tangent point
}

function insertVia(edge, nodeId, arr) {
  edge.via = edge.via || [];
  if (edge.a === nodeId) {
    // node is the first ctrl point; arc runs M-adjacent -> T right after it
    edge.via = [...arr, ...edge.via];
  } else {
    // node is the last ctrl point; arc must read T -> M-adjacent before it
    edge.via = [...edge.via, ...arr.slice().reverse()];
  }
}

export function smoothLevel(level) {
  const L = structuredClone(level);
  const edgesAtNode = {};
  for (const e of L.edges) {
    (edgesAtNode[e.a] = edgesAtNode[e.a] || []).push(e);
    if (e.b !== e.a) (edgesAtNode[e.b] = edgesAtNode[e.b] || []).push(e);
  }
  const switchNodes = new Set((L.switches || []).map((s) => s.node));
  const minBend = (FILLET.minBendDeg * Math.PI) / 180;

  for (const nodeId of Object.keys(edgesAtNode)) {
    const inc = edgesAtNode[nodeId];
    if (inc.length !== 2) continue; // only true corners
    if (switchNodes.has(nodeId)) continue; // never touch switch geometry
    const [e1, e2] = inc;
    const i1 = awayInfo(L, e1, nodeId);
    const i2 = awayInfo(L, e2, nodeId);
    const dot = Math.max(-1, Math.min(1, i1.dir[0] * i2.dir[0] + i1.dir[1] * i2.dir[1]));
    const phi = Math.acos(dot); // interior angle between the two rays
    const bend = Math.PI - phi; // deviation from straight-through
    if (bend <= minBend) continue;

    const minSeg = Math.min(i1.segLen, i2.segLen);
    const half = phi / 2;
    const tanH = Math.tan(half);
    const sinH = Math.sin(half);
    if (tanH < 1e-4 || sinH < 1e-4) continue;

    let r = Math.min(FILLET.maxRadius, 0.5 * minSeg, FILLET.baseRadius);
    let t = r / tanH;
    const maxT = FILLET.maxSetbackFrac * minSeg;
    if (t > maxT) {
      t = maxT;
      r = t * tanH;
    }
    if (r < 0.4) continue; // arc too tiny to matter

    const P = L.nodes[nodeId];
    const bis = v2norm([i1.dir[0] + i2.dir[0], i1.dir[1] + i2.dir[1]]);
    const C = [P[0] + bis[0] * (r / sinH), P[1] + bis[1] * (r / sinH)];
    const T1 = [P[0] + i1.dir[0] * t, P[1] + i1.dir[1] * t];
    const T2 = [P[0] + i2.dir[0] * t, P[1] + i2.dir[1] * t];
    const M = [P[0] + bis[0] * r * (1 / sinH - 1), P[1] + bis[1] * r * (1 / sinH - 1)];

    const aM = Math.atan2(M[1] - C[1], M[0] - C[0]);
    const aT1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]);
    const aT2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]);

    insertVia(e1, nodeId, arcSamples(C[0], C[1], r, aM, aT1));
    insertVia(e2, nodeId, arcSamples(C[0], C[1], r, aM, aT2));
    L.nodes[nodeId] = [round2(M[0]), round2(M[1])];
  }
  return L;
}

// ---------------------------------------------------------------------------
// getLevel(i) — smoothed deep copy, memoized
// ---------------------------------------------------------------------------

const _smoothed = new Array(LEVELS.length).fill(null);

export function getLevel(i) {
  if (i < 0 || i >= LEVELS.length) return null;
  if (!_smoothed[i]) _smoothed[i] = smoothLevel(LEVELS[i]);
  return _smoothed[i];
}
