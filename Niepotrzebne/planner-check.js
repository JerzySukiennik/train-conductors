// planner-check.js — validates planner-levels-draft.js against CONTRACT.md rules.
// Reuses the real engine validator graphSelfTest (refs, switch touching, 500-step
// random-walk dead-end check per spawn) from v1/js/display/track.js, then layers the
// extra structural rules the planner brief calls out: node degree exactly 2 (plain) or
// exactly 3 (switch: from + 2 options, no stray edges), world bounds, via spacing/turn
// radius, station t away from edge ends, switch letter sequencing, and spawn/home match.

import { graphSelfTest } from "../v1/js/display/track.js";
import { LEVELS, BALANCE_TUNED } from "./planner-levels-draft.js";

let totalViolations = 0;

function fail(levelId, msg) {
  totalViolations++;
  console.error(`  [FAIL] ${levelId}: ${msg}`);
}

function touchingEdges(level, nodeId) {
  return level.edges.filter((e) => e.a === nodeId || e.b === nodeId).map((e) => e.id);
}

function checkDegrees(level) {
  const switchNodes = new Map();
  for (const sw of level.switches) switchNodes.set(sw.node, sw);
  const nodeIds = Object.keys(level.nodes);
  for (const nodeId of nodeIds) {
    const touching = touchingEdges(level, nodeId);
    const sw = switchNodes.get(nodeId);
    if (sw) {
      const expected = new Set([sw.from, ...sw.options]);
      if (touching.length !== 3) {
        fail(level.id, `switch node ${nodeId} (${sw.id}) touches ${touching.length} edges, expected 3`);
      } else if (![...expected].every((id) => touching.includes(id))) {
        fail(level.id, `switch ${sw.id}: from/options do not match touching edges ${touching.join(",")}`);
      }
    } else if (touching.length !== 2) {
      fail(level.id, `plain node ${nodeId} touches ${touching.length} edges, expected 2`);
    }
  }
}

function checkBounds(level) {
  for (const [id, [x, z]] of Object.entries(level.nodes)) {
    if (x < -24 || x > 24 || z < -16 || z > 16) {
      fail(level.id, `node ${id} out of bounds [${x},${z}]`);
    }
  }
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function circumradius(p0, p1, p2) {
  const a = dist(p1, p2);
  const b = dist(p0, p2);
  const c = dist(p0, p1);
  const s = (a + b + c) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
  if (area < 1e-9) return Infinity;
  return (a * b * c) / (4 * area);
}

function checkViaSmoothness(level) {
  for (const e of level.edges) {
    if (!e.via || !e.via.length) continue;
    const a = level.nodes[e.a];
    const b = level.nodes[e.b];
    const pts = [a, ...e.via, b];
    for (let i = 1; i < e.via.length; i++) {
      const spacing = dist(e.via[i - 1], e.via[i]);
      if (spacing < 3) fail(level.id, `edge ${e.id}: via spacing ${spacing.toFixed(2)} < 3`);
    }
    for (let i = 1; i < pts.length - 1; i++) {
      const r = circumradius(pts[i - 1], pts[i], pts[i + 1]);
      if (r < 4) fail(level.id, `edge ${e.id}: implied turn radius ${r.toFixed(2)} < 4 at via index ${i}`);
    }
  }
}

function checkStations(level) {
  const bySlot = { 0: [], 1: [], 2: [] };
  for (const st of level.stations) {
    if (!(st.t >= 0.15 && st.t <= 0.85)) {
      fail(level.id, `station ${st.id}: t=${st.t} within 0.15 of edge end`);
    }
    if (!(st.slot in bySlot)) fail(level.id, `station ${st.id}: bad slot ${st.slot}`);
    else bySlot[st.slot].push(st);
  }
  for (const slot of [0, 1, 2]) {
    const homes = bySlot[slot].filter((s) => s.home);
    if (homes.length !== 1) fail(level.id, `slot ${slot}: expected exactly 1 home station, found ${homes.length}`);
  }
  const minStations = ["L1", "L2"].includes(level.id) ? 3 : 4;
  if (level.stations.length < minStations) {
    fail(level.id, `only ${level.stations.length} stations, expected >= ${minStations}`);
  }
}

function checkSwitchLetters(level) {
  const letters = level.switches.map((s) => s.id);
  const expected = "ABCDEFGH".slice(0, letters.length).split("");
  if (JSON.stringify(letters) !== JSON.stringify(expected)) {
    fail(level.id, `switch letters ${letters.join(",")} not sequential from A`);
  }
  if (letters.length > 8) fail(level.id, `${letters.length} switches exceeds max 8`);
  for (const sw of level.switches) {
    if (!sw.options || sw.options.length !== 2) fail(level.id, `switch ${sw.id}: needs exactly 2 options`);
  }
}

function checkSpawns(level) {
  const homeBySlot = {};
  for (const st of level.stations) if (st.home) homeBySlot[st.slot] = st;
  for (const slot of Object.keys(level.spawns)) {
    const sp = level.spawns[slot];
    const home = homeBySlot[slot];
    if (!home) {
      fail(level.id, `spawn ${slot}: no home station for slot`);
      continue;
    }
    if (sp.edge !== home.edge) {
      fail(level.id, `spawn ${slot}: edge ${sp.edge} does not match home station edge ${home.edge}`);
    }
    if (sp.dir !== 1 && sp.dir !== -1) fail(level.id, `spawn ${slot}: dir must be 1 or -1`);
  }
}

function checkDecorRefs(level) {
  const edgeIds = new Set(level.edges.map((e) => e.id));
  for (const b of level.decor.bridges || []) {
    if (!edgeIds.has(b.edge)) fail(level.id, `bridge references unknown edge ${b.edge}`);
    if (!(b.t0 >= 0 && b.t1 <= 1 && b.t0 < b.t1)) fail(level.id, `bridge on ${b.edge}: bad t0/t1`);
  }
  for (const t of level.decor.tunnels || []) {
    if (!edgeIds.has(t.edge)) fail(level.id, `tunnel references unknown edge ${t.edge}`);
    if (!(t.t0 >= 0 && t.t1 <= 1 && t.t0 < t.t1)) fail(level.id, `tunnel on ${t.edge}: bad t0/t1`);
  }
}

console.log(`Checking ${LEVELS.length} levels...\n`);
for (const level of LEVELS) {
  console.log(`--- ${level.id} ---`);
  const st = graphSelfTest(level);
  if (!st.ok) {
    for (const p of st.problems) fail(level.id, `graphSelfTest: ${p}`);
  } else {
    console.log(`  graphSelfTest: OK (refs, switch touching, 500-step walk per spawn)`);
  }
  checkDegrees(level);
  checkBounds(level);
  checkViaSmoothness(level);
  checkStations(level);
  checkSwitchLetters(level);
  checkSpawns(level);
  checkDecorRefs(level);
  console.log(
    `  nodes=${Object.keys(level.nodes).length} edges=${level.edges.length} switches=${level.switches.length} stations=${level.stations.length}`
  );
}

console.log(`\nBALANCE_TUNED overrides: ${JSON.stringify(BALANCE_TUNED)}`);
console.log(`\nTotal violations: ${totalViolations}`);
process.exit(totalViolations ? 1 : 0);
