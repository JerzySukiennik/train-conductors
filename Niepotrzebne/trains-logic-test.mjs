// trains-logic-test.mjs — node harness for v1/js/display/trains.js
// Uses the real track runtime (buildTrackRuntime) on a 2-edge loop, and stubs the GLB
// loader via _setLoaderForTest(() => null) so trains fall back to procedural THREE meshes
// (no renderer/WebGL needed). Run: node trains-logic-test.mjs  → exit 0 when green.

import * as THREE from "three";
import { buildTrackRuntime } from "../v1/js/display/track.js";
import { initTrains, _setLoaderForTest } from "../v1/js/display/trains.js";

_setLoaderForTest(() => null); // force procedural fallback

const level = {
  id: "TLOOP",
  nameKey: "level.test.name",
  island: { w: 46, d: 30 },
  nodes: { n1: [-12, 0], n2: [12, 0] },
  edges: [
    { id: "e1", a: "n1", b: "n2", via: [[0, -7]] },
    { id: "e2", a: "n2", b: "n1", via: [[0, 7]] },
  ],
  switches: [],
  stations: [{ id: "s1", edge: "e1", t: 0.5, slot: 0, home: true }],
  npc: { freight: null, sheepSpots: [{ edge: "e2", t: 0.5 }], crossing: null },
  goal: { deliver: 4, time: 120 },
  decor: { seed: 7 },
  spawns: {
    0: { edge: "e1", t: 0.1, dir: 1 },
    1: { edge: "e1", t: 0.6, dir: -1 },
  },
};

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log(`  PASS ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${extra !== undefined ? " — " + extra : ""}`);
  }
}
function makeSc() {
  return { scene: new THREE.Scene() };
}

console.log("[1] crash — two trains on collision course, same edge");
(function () {
  const rt = buildTrackRuntime(level);
  const tr = initTrains(makeSc(), level, rt, { slots: [0, 1], difficulty: "normal" });
  tr.setThrottle(0, 1);
  tr.setThrottle(1, 1);
  let crash = null;
  for (let i = 0; i < 400 && !crash; i++) {
    const ev = tr.update(0.05);
    for (const e of ev) if (e.type === "crash") crash = e;
  }
  check("crash emitted", !!crash, JSON.stringify(crash && { slots: crash.slots }));
  check("crash slots include both players", crash && crash.slots.includes(0) && crash.slots.includes(1),
    crash ? JSON.stringify(crash.slots) : "none");
  check("crash pos is Vector3", crash && crash.pos && isFinite(crash.pos.x) && isFinite(crash.pos.z));
  tr.dispose();
})();

console.log("[2] atStation — fires on entering station zone");
(function () {
  const rt = buildTrackRuntime(level);
  const solo = { ...level, spawns: { 0: { edge: "e1", t: 0.05, dir: 1 } } };
  const tr = initTrains(makeSc(), solo, rt, { slots: [0], difficulty: "easy" });
  tr.setThrottle(0, 1);
  let at = null;
  for (let i = 0; i < 400 && !at; i++) {
    const ev = tr.update(0.05);
    for (const e of ev) if (e.type === "atStation") at = e;
  }
  check("atStation emitted", !!at, JSON.stringify(at));
  check("atStation stationId s1", at && at.stationId === "s1", at && at.stationId);
  check("atStation exposes speed01", at && typeof at.speed01 === "number" && at.speed01 > 0, at && at.speed01);
  tr.dispose();
})();

console.log("[3] wagon trailing — gap ~2.4 ±0.3");
(function () {
  const rt = buildTrackRuntime(level);
  const solo = { ...level, spawns: { 0: { edge: "e1", t: 0.05, dir: 1 } } };
  const tr = initTrains(makeSc(), solo, rt, { slots: [0], difficulty: "easy" });
  const b1 = tr.boardPassenger(0, "s1");
  const b2 = tr.boardPassenger(0, "s1");
  check("boardPassenger grows wagons", b1.ok && b2.ok && b2.wagons === 2, JSON.stringify(b2));
  tr.setThrottle(0, 1);
  for (let i = 0; i < 80; i++) tr.update(0.05); // ~4s of motion
  const centers = tr._centers(0); // [head, wagon0, wagon1]
  check("three centers (head + 2 wagons)", centers.length === 3, centers.length);
  const g1 = Math.hypot(centers[0].x - centers[1].x, centers[0].z - centers[1].z);
  const g2 = Math.hypot(centers[1].x - centers[2].x, centers[1].z - centers[2].z);
  check("gap head->wagon0 ~2.4", Math.abs(g1 - 2.4) < 0.3, g1.toFixed(3));
  check("gap wagon0->wagon1 ~2.4", Math.abs(g2 - 2.4) < 0.3, g2.toFixed(3));
  const st = tr.state(0);
  check("state() reports 2 wagons", st.wagons === 2, st.wagons);
  check("state() speed01 in (0,1]", st.speed01 > 0 && st.speed01 <= 1, st.speed01);
  tr.dispose();
})();

console.log("[4] horn scares sheep + hornSheep event");
(function () {
  const rt = buildTrackRuntime(level);
  // put train head near the sheep on e2 by spawning there
  const near = { ...level, spawns: { 0: { edge: "e2", t: 0.5, dir: 1 } } };
  const tr = initTrains(makeSc(), near, rt, { slots: [0], difficulty: "hard" });
  tr.update(0.016); // settle
  tr.horn(0);
  let hs = null;
  for (let i = 0; i < 5 && !hs; i++) {
    const ev = tr.update(0.05);
    for (const e of ev) if (e.type === "hornSheep") hs = e;
  }
  check("hornSheep emitted", !!hs, JSON.stringify(hs && { pos: !!hs.pos }));
  tr.dispose();
})();

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll green.");
process.exit(0);
