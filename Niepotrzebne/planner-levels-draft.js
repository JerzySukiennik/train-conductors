// levels.js — Grand Conductors LEVELS[5] dataset (planner draft, v1 format per CONTRACT.md).
// Built with small geometry generators (regular ellipse-polygon rings + connecting chords)
// so every node/edge coordinate is computed rather than hand-typed, keeping the graph
// invariant that guarantees zero dead ends: every switch node touches exactly the 3 edges
// listed in {from, options[0], options[1]}, and every other node touches exactly 2 edges.
// All track edges are straight chords (no via arrays), so via-spacing/turn-radius rules
// are satisfied trivially; curvature comes from using 8-12 sided polygons per loop.

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
