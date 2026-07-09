// smooth-check.mjs — verify corner-fillet smoothing.
// Runs graphSelfTest on all 5 smoothed levels and reports the max turn angle
// between consecutive polyline samples (before vs after smoothing). After should
// be well under before. Run from project root: `node Niepotrzebne/smooth-check.mjs`.

import { LEVELS, getLevel } from "../v1/js/display/levels.js";
import { buildTrackRuntime, graphSelfTest } from "../v1/js/display/track.js";

const STEP = 0.5; // fixed arc-length sample step (m) along the continuous route

// Max direction change between consecutive fixed-step samples along the CONTINUOUS
// train path. Each edge is stitched to its graph continuation so node joints (where
// the sharp corners actually live on straight-chord levels) are included.
function maxTurnDeg(level) {
  const rt = buildTrackRuntime(level);
  const states = {};
  for (const id of rt.switchIds) states[id] = 0;
  // node degree + switch set: only measure joints at the plain degree-2 corners we fillet
  const deg = {};
  for (const e of level.edges) {
    deg[e.a] = (deg[e.a] || 0) + 1;
    if (e.b !== e.a) deg[e.b] = (deg[e.b] || 0) + 1;
  }
  const switchNodes = new Set((level.switches || []).map((s) => s.node));
  const filletNode = (id) => deg[id] === 2 && !switchNodes.has(id);
  let maxDeg = 0;
  for (const e of level.edges) {
    const seq = [{ edgeId: e.id, dir: 1 }];
    // stitch into the continuation only across a corner we are responsible for
    if (filletNode(e.b)) {
      const nx = rt.nextEdge(e.id, 1, states);
      if (nx) seq.push(nx);
    }
    const pts = [];
    for (const seg of seq) {
      const s = rt.sampler(seg.edgeId);
      if (!s) continue;
      const n = Math.max(2, Math.ceil(s.length / STEP));
      for (let i = 0; i <= n; i++) {
        const t = seg.dir < 0 ? 1 - i / n : i / n;
        pts.push(s.pointAt(t));
      }
    }
    // drop coincident points (shared node appears twice at each joint)
    const clean = [];
    for (const p of pts) {
      if (!clean.length || clean[clean.length - 1].distanceTo(p) > 1e-6) clean.push(p);
    }
    for (let i = 1; i < clean.length - 1; i++) {
      const a = clean[i].clone().sub(clean[i - 1]);
      const b = clean[i + 1].clone().sub(clean[i]);
      const la = a.length();
      const lb = b.length();
      if (la < 1e-6 || lb < 1e-6) continue;
      let d = a.dot(b) / (la * lb);
      d = Math.max(-1, Math.min(1, d));
      const deg = (Math.acos(d) * 180) / Math.PI;
      if (deg > maxDeg) maxDeg = deg;
    }
  }
  return maxDeg;
}

let allOk = true;
console.log("level | selfTest | maxTurn before -> after (deg per sample step)");
for (let i = 0; i < LEVELS.length; i++) {
  const raw = LEVELS[i];
  const smooth = getLevel(i);
  const res = graphSelfTest(smooth);
  const before = maxTurnDeg(raw);
  const after = maxTurnDeg(smooth);
  const ok = res.ok && after < before;
  allOk = allOk && ok;
  console.log(
    `  ${raw.id}  |  ${res.ok ? "PASS" : "FAIL"}  |  ${before.toFixed(1)} -> ${after.toFixed(1)}  ${ok ? "" : "  <-- ISSUE"}`
  );
  if (!res.ok) console.log("     problems:", res.problems);
}
console.log(allOk ? "\nALL GREEN" : "\nFAILURES PRESENT");
process.exit(allOk ? 0 : 1);
