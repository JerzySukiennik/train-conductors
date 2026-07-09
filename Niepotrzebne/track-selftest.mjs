// track-selftest.mjs — node harness for v1/js/display/track.js
// Requires `three` resolvable from v1/js/display (node_modules at repo root).
// Run: node track-selftest.mjs  → exit 0 when green.

import { buildTrackRuntime, buildTrackMesh, graphSelfTest } from "../v1/js/display/track.js";

const level = {
  id: "TEST",
  nameKey: "level.test.name",
  island: { w: 46, d: 30 },
  nodes: {
    n1: [-10, 0],
    n2: [0, -6],
    n3: [10, 0],
    n4: [0, 6],
  },
  edges: [
    { id: "e1", a: "n1", b: "n2", via: [[-6, -4]] },
    { id: "e2", a: "n2", b: "n3", via: [[4, -5], [8, -3]] },
    { id: "e3", a: "n2", b: "n3", via: [[4, -3], [8, -2]] },
    { id: "e4", a: "n3", b: "n4", via: [[8, 3]] },
    { id: "e5", a: "n4", b: "n1", via: [[-6, 4]] },
  ],
  switches: [{ id: "A", node: "n2", from: "e1", options: ["e2", "e3"] }],
  stations: [
    { id: "s1", edge: "e5", t: 0.5, slot: 0, home: true },
    { id: "s2", edge: "e4", t: 0.3, slot: 1, home: true },
  ],
  npc: {
    freight: null,
    sheepSpots: [{ edge: "e2", t: 0.3 }],
    crossing: { edge: "e5", t: 0.6, road: [[-9, 8], [-4, -2]], period: { easy: 14, normal: 10, hard: 7 } },
  },
  goal: { deliver: 4, time: 120 },
  decor: { seed: 7 },
  spawns: {
    0: { edge: "e1", t: 0.1, dir: 1 },
    1: { edge: "e4", t: 0.9, dir: -1 },
  },
};

let failures = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log(`  PASS ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${extra ? " — " + extra : ""}`);
  }
}

console.log("[1] graphSelfTest");
const st = graphSelfTest(level);
check("selftest ok", st.ok, JSON.stringify(st.problems));

console.log("[2] buildTrackRuntime");
const rt = buildTrackRuntime(level);
check("edges map size", rt.edges.size === 5);
check("switchIds", JSON.stringify(rt.switchIds) === '["A"]');
check("defaultSwitchStates", JSON.stringify(rt.defaultSwitchStates()) === '{"A":0}');
check("nodeOf e1 b", rt.nodeOf("e1", "b") === "n2");
check("nodeOf e1 a", rt.nodeOf("e1", "a") === "n1");

const s1 = rt.sampler("e1");
check("sampler length > 2", s1.length > 2, String(s1.length));
const p = s1.pointAt(0.5);
const tg = s1.tangentAt(0.5);
check("pointAt finite y=0", isFinite(p.x) && isFinite(p.z) && p.y === 0);
check("tangent normalized", Math.abs(tg.length() - 1) < 1e-6);
const sp = rt.stationPos(level.stations[0]);
check("stationPos", sp && isFinite(sp.pos.x) && Math.abs(sp.tangent.length() - 1) < 1e-6);

console.log("[3] nextEdge — three arrival cases");
const facing0 = rt.nextEdge("e1", 1, { A: 0 });
check("facing state 0 -> e2", facing0 && facing0.edgeId === "e2" && facing0.dir === 1, JSON.stringify(facing0));
const facing1 = rt.nextEdge("e1", 1, { A: 1 });
check("facing state 1 -> e3", facing1 && facing1.edgeId === "e3" && facing1.dir === 1, JSON.stringify(facing1));
const trailing = rt.nextEdge("e2", -1, { A: 1 });
check("trailing e2 -> e1 (sprung, ignores state)", trailing && trailing.edgeId === "e1" && trailing.dir === -1, JSON.stringify(trailing));
const trailing2 = rt.nextEdge("e3", -1, { A: 0 });
check("trailing e3 -> e1", trailing2 && trailing2.edgeId === "e1" && trailing2.dir === -1, JSON.stringify(trailing2));
const plain = rt.nextEdge("e4", 1, { A: 0 });
check("plain node n4: e4 -> e5", plain && plain.edgeId === "e5" && plain.dir === 1, JSON.stringify(plain));
const cont = rt.nextEdge("e2", 1, { A: 0 });
check("3-way no-switch n3: e2 -> e4 (alignment)", cont && cont.edgeId === "e4" && cont.dir === 1, JSON.stringify(cont));
const cont2 = rt.nextEdge("e3", 1, { A: 1 });
check("3-way no-switch n3: e3 -> e4 (alignment)", cont2 && cont2.edgeId === "e4" && cont2.dir === 1, JSON.stringify(cont2));

console.log("[4] 1000-step random walk with flips");
(function () {
  let cur = { edgeId: "e1", dir: 1 };
  const states = rt.defaultSwitchStates();
  let dead = null;
  for (let i = 0; i < 1000; i++) {
    if (Math.random() < 0.3) states.A = states.A ? 0 : 1;
    const next = rt.nextEdge(cur.edgeId, cur.dir, states);
    if (!next) { dead = { step: i, cur }; break; }
    cur = next;
  }
  check("no dead ends", dead === null, JSON.stringify(dead));
})();

console.log("[5] buildTrackMesh");
const mesh = buildTrackMesh(level, rt);
check("group children > 3", mesh.children.length > 3, String(mesh.children.length));
check("switchAnchors A", !!mesh.userData.switchAnchors.A);
const anc = mesh.userData.switchAnchors.A;
check("anchor dirs unit", Math.abs(anc.dirA.length() - 1) < 1e-6 && Math.abs(anc.dirB.length() - 1) < 1e-6);

console.log("[6] validator catches broken level");
const broken = JSON.parse(JSON.stringify(level));
broken.edges[0].b = "nMISSING";
const bad = graphSelfTest(broken);
check("broken level flagged", !bad.ok && bad.problems.length > 0, JSON.stringify(bad.problems));

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll green.");
process.exit(0);
