/*
 * avatars.js — Grand Conductors shared avatar module.
 * 6 procedural low-poly conductor characters (three.js Groups, ~1.7u tall,
 * feet at y=0, facing +Z) + 2D canvas bust portraits for HUD chips / pads.
 * No textures, no WebGL needed for portraits. See CONTRACT.md "Avatars".
 */

import * as THREE from "three";

export const AVATAR_COUNT = 6;

export const AVATAR_META = [
  { id: 0, key: "avatar.0" },
  { id: 1, key: "avatar.1" },
  { id: 2, key: "avatar.2" },
  { id: 3, key: "avatar.3" },
  { id: 4, key: "avatar.4" },
  { id: 5, key: "avatar.5" },
];

const C = {
  navy: 0x2c3e67,
  navyDark: 0x233252,
  gold: 0xf4c542,
  skin: 0xf2c89b,
  skinShade: 0xe0b184,
  white: 0xf5f6f8,
  black: 0x23252b,
  brown: 0x7a4a2b,
  brownDark: 0x5c3820,
  glass: 0x8fd3e8,
  scarf: 0x9aa0a8,
  hiVis: 0xff8c1a,
  reflect: 0xe8ecef,
  hardHat: 0xffd23f,
  silverW: 0xcfd6dd,
  teal: 0x2e8b84,
  tealDark: 0x24706a,
  hairGrey: 0xc9cdd3,
  tin: 0xb8bec6,
  tinDark: 0x8a9099,
  cyan: 0x39e6e0,
  red: 0xe53935,
  ginger: 0xe8862e,
  gingerDark: 0xc96f1e,
  pink: 0xf08a9b,
};

function kit(T) {
  const mats = new Map();
  const mat = (color, opts) => {
    const key = opts ? null : color;
    if (key !== null && mats.has(key)) return mats.get(key);
    const m = new T.MeshStandardMaterial(
      Object.assign({ color, roughness: 0.9, metalness: 0.06 }, opts || {})
    );
    if (key !== null) mats.set(key, m);
    return m;
  };
  const add = (parent, geo, material, x, y, z, rx, ry, rz) => {
    const mesh = new T.Mesh(geo, material);
    mesh.position.set(x, y, z);
    if (rx || ry || rz) mesh.rotation.set(rx || 0, ry || 0, rz || 0);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, seg) => new T.CylinderGeometry(rt, rb, h, seg || 12);
  const sph = (r, w, h) => new T.SphereGeometry(r, w || 14, h || 12);
  const cone = (r, h, seg) => new T.ConeGeometry(r, h, seg || 10);
  return { mat, add, box, cyl, sph, cone, T };
}

function buildBase(k, o) {
  const { mat, add, box, cyl, sph } = k;
  const g = new k.T.Group();

  const legM = mat(o.leg);
  const legGeo = o.boxLegs ? box(0.15, 0.36, 0.15) : cyl(0.08, 0.1, 0.36, 10);
  add(g, legGeo, legM, -0.12, 0.18, 0);
  add(g, legGeo, legM, 0.12, 0.18, 0);
  const shoeM = mat(o.shoe || C.black);
  const shoeGeo = box(0.17, 0.09, 0.26);
  add(g, shoeGeo, shoeM, -0.12, 0.045, 0.04);
  add(g, shoeGeo, shoeM, 0.12, 0.045, 0.04);

  const torsoM = mat(o.torso);
  let torsoGeo;
  if (o.torsoShape === "box") torsoGeo = box(0.52, 0.66, 0.36);
  else if (o.torsoShape === "coat") torsoGeo = cyl(0.21, 0.37, 0.68, 14);
  else torsoGeo = cyl(0.23, 0.28, 0.66, 14);
  const torso = add(g, torsoGeo, torsoM, 0, 0.69, 0);

  const armM = mat(o.arm || o.torso);
  const handM = mat(o.hand || C.skin);
  const armGeo = o.boxLegs ? box(0.11, 0.4, 0.11) : cyl(0.06, 0.07, 0.4, 10);
  const hands = [];
  for (const s of [-1, 1]) {
    const shoulder = new k.T.Group();
    shoulder.position.set(s * (o.shoulderX || 0.3), 0.96, 0);
    shoulder.rotation.z = s * (o.armOut || 0.42);
    g.add(shoulder);
    add(shoulder, armGeo, armM, 0, -0.2, 0);
    hands.push(add(shoulder, sph(0.085, 10, 8), handM, 0, -0.42, 0));
  }

  const headG = new k.T.Group();
  headG.position.set(0, 1.32, 0);
  g.add(headG);
  const headM = mat(o.head || C.skin);
  let head;
  if (o.headShape === "box") head = add(headG, box(0.5, 0.46, 0.46), headM, 0, 0, 0);
  else head = add(headG, sph(0.3, 18, 14), headM, 0, 0, 0);

  if (!o.noEyes) {
    const eyeM = mat(C.black);
    const eyeGeo = sph(0.035, 8, 8);
    add(headG, eyeGeo, eyeM, -0.11, 0.04, o.eyeZ || 0.27);
    add(headG, eyeGeo, eyeM, 0.11, 0.04, o.eyeZ || 0.27);
  }
  if (!o.noNose) {
    add(headG, sph(0.045, 8, 8), mat(o.nose || C.skinShade), 0, -0.04, o.noseZ || 0.29);
  }

  return { g, torso, headG, head, hands };
}

function dressClassic(k, b) {
  const { mat, add, box, cyl, sph } = k;
  const goldM = mat(C.gold, { roughness: 0.5, metalness: 0.5 });
  const btn = sph(0.028, 8, 8);
  add(b.g, btn, goldM, 0, 0.86, 0.245);
  add(b.g, btn, goldM, 0, 0.72, 0.263);
  add(b.g, btn, goldM, 0, 0.58, 0.278);
  add(b.g, cyl(0.29, 0.29, 0.06, 14), mat(C.navyDark), 0, 0.39, 0);
  add(b.g, box(0.08, 0.05, 0.02), goldM, 0, 0.39, 0.28);
  const capM = mat(C.navy);
  add(b.headG, cyl(0.3, 0.32, 0.13, 16), capM, 0, 0.22, 0);
  add(b.headG, sph(0.3, 16, 10), capM, 0, 0.25, 0).scale.set(1, 0.45, 1);
  add(b.headG, cyl(0.315, 0.315, 0.035, 16), goldM, 0, 0.165, 0);
  add(b.headG, box(0.3, 0.03, 0.17), mat(C.black), 0, 0.16, 0.3, -0.12, 0, 0);
  b.hands.forEach((h) => (h.material = mat(C.white)));
}

function dressSteamer(k, b) {
  const { mat, add, box, cyl } = k;
  const capM = mat(C.brownDark);
  add(b.headG, cyl(0.3, 0.32, 0.11, 16), capM, 0, 0.2, 0);
  add(b.headG, box(0.26, 0.025, 0.14), capM, 0, 0.15, 0.3, -0.15, 0, 0);
  const rimM = mat(0x4a3a28);
  const lensM = mat(C.glass, { roughness: 0.25, metalness: 0.35 });
  for (const s of [-1, 1]) {
    add(b.headG, cyl(0.075, 0.075, 0.06, 12), rimM, s * 0.12, 0.27, 0.24, Math.PI / 2 - 0.35, 0, 0);
    add(b.headG, cyl(0.055, 0.055, 0.065, 12), lensM, s * 0.12, 0.285, 0.255, Math.PI / 2 - 0.35, 0, 0);
  }
  add(b.headG, box(0.62, 0.05, 0.05), rimM, 0, 0.24, 0.13);
  const scarfM = mat(C.scarf);
  add(b.g, cyl(0.2, 0.24, 0.14, 12), scarfM, 0, 1.05, 0);
  add(b.g, box(0.14, 0.3, 0.05), scarfM, 0.08, 0.86, 0.24, 0, 0, 0.12);
  add(b.g, box(0.14, 0.56, 0.03), mat(C.brownDark), 0, 0.68, 0.27);
  const beltM = mat(0x3c2f22);
  add(b.g, cyl(0.29, 0.29, 0.055, 14), beltM, 0, 0.42, 0);
}

function dressSignalman(k, b) {
  const { mat, add, box, cyl, sph } = k;
  const stripe = mat(C.reflect, { roughness: 0.55 });
  add(b.g, cyl(0.262, 0.272, 0.08, 14), stripe, 0, 0.74, 0);
  add(b.g, cyl(0.276, 0.284, 0.07, 14), stripe, 0, 0.5, 0);
  const hatM = mat(C.hardHat);
  const dome = add(b.headG, sph(0.31, 16, 10), hatM, 0, 0.13, 0);
  dome.scale.set(1, 0.72, 1);
  add(b.headG, cyl(0.36, 0.38, 0.045, 16), hatM, 0, 0.12, 0);
  add(b.headG, box(0.1, 0.05, 0.62), hatM, 0, 0.3, 0);
  const cordM = mat(C.silverW, { roughness: 0.4, metalness: 0.4 });
  add(b.g, cyl(0.012, 0.012, 0.24, 6), mat(C.black), 0.09, 0.98, 0.22, 0, 0, -0.35);
  add(b.g, sph(0.05, 10, 8), cordM, 0.135, 0.86, 0.24);
}

function dressGranny(k, b) {
  const { mat, add, box, cyl, sph } = k;
  const hairM = mat(C.hairGrey);
  const hood = add(b.headG, sph(0.325, 16, 12), hairM, 0, 0.04, -0.045);
  hood.scale.set(1, 0.95, 1);
  add(b.headG, sph(0.13, 12, 10), hairM, 0, 0.34, -0.05);
  const face = add(b.headG, sph(0.27, 16, 12), mat(C.skin), 0, -0.015, 0.075);
  face.scale.set(0.92, 0.88, 0.8);
  const rimM = mat(0x555a63, { roughness: 0.4, metalness: 0.4 });
  const ring = new k.T.TorusGeometry(0.085, 0.014, 8, 18);
  add(b.headG, ring, rimM, -0.11, 0.045, 0.305);
  add(b.headG, ring, rimM, 0.11, 0.045, 0.305);
  add(b.headG, box(0.06, 0.02, 0.02), rimM, 0, 0.05, 0.31);
  add(b.g, cyl(0.06, 0.06, 0.02, 10), mat(0xd9b8c4), 0, 0.98, 0.19);
  const bagM = mat(0x8a4a5e);
  const bag = add(b.g, box(0.2, 0.16, 0.1), bagM, 0.47, 0.5, 0.06);
  bag.rotation.z = 0.1;
  add(b.g, new k.T.TorusGeometry(0.07, 0.016, 8, 16), bagM, 0.47, 0.61, 0.06);
  add(b.g, cyl(0.375, 0.375, 0.04, 14), mat(C.tealDark), 0, 0.37, 0);
}

function dressTinbot(k, b) {
  const { mat, add, box, cyl, sph } = k;
  const dk = mat(C.tinDark);
  const rivet = sph(0.022, 8, 8);
  for (const s of [-1, 1]) {
    add(b.g, rivet, dk, s * 0.2, 0.92, 0.185);
    add(b.g, rivet, dk, s * 0.2, 0.47, 0.185);
    add(b.headG, rivet, dk, s * 0.19, 0.17, 0.235);
  }
  add(b.g, box(0.3, 0.24, 0.03), dk, 0, 0.7, 0.185);
  add(b.g, cyl(0.05, 0.05, 0.02, 10), mat(C.red, { emissive: C.red, emissiveIntensity: 0.35 }), 0, 0.72, 0.2, Math.PI / 2, 0, 0);
  const eyeM = mat(C.cyan, { emissive: C.cyan, emissiveIntensity: 0.9, roughness: 0.4 });
  add(b.headG, sph(0.055, 10, 8), eyeM, -0.12, 0.05, 0.23);
  add(b.headG, sph(0.055, 10, 8), eyeM, 0.12, 0.05, 0.23);
  add(b.headG, box(0.2, 0.045, 0.02), dk, 0, -0.12, 0.235);
  add(b.headG, cyl(0.016, 0.016, 0.26, 8), dk, 0, 0.35, 0);
  add(b.headG, sph(0.065, 10, 8), mat(C.red, { emissive: C.red, emissiveIntensity: 0.3 }), 0, 0.5, 0);
  add(b.headG, box(0.05, 0.1, 0.05), dk, -0.28, 0, 0);
  add(b.headG, box(0.05, 0.1, 0.05), dk, 0.28, 0, 0);
}

function dressCat(k, b) {
  const { mat, add, box, cyl, sph, cone } = k;
  const gingerM = mat(C.ginger);
  const earM = mat(C.gingerDark);
  for (const s of [-1, 1]) {
    const ear = add(b.headG, cone(0.085, 0.22, 8), gingerM, s * 0.22, 0.27, -0.02);
    ear.rotation.z = -s * 0.55;
    add(b.headG, cone(0.045, 0.1, 8), earM, s * 0.225, 0.28, 0.01, 0, 0, -s * 0.55);
  }
  const muzzle = add(b.headG, sph(0.14, 12, 10), mat(0xf7ede0), 0, -0.08, 0.22);
  muzzle.scale.set(1.25, 0.85, 0.8);
  add(b.headG, sph(0.035, 8, 8), mat(C.pink), 0, -0.02, 0.325);
  const whiskM = mat(C.white);
  const whisk = box(0.17, 0.012, 0.012);
  for (const s of [-1, 1]) {
    add(b.headG, whisk, whiskM, s * 0.2, -0.05, 0.26, 0, s * 0.5, 0.12);
    add(b.headG, whisk, whiskM, s * 0.2, -0.09, 0.26, 0, s * 0.5, -0.1);
  }
  const vestM = mat(0x6b2c3a);
  add(b.g, cyl(0.245, 0.265, 0.22, 14), vestM, 0, 0.62, 0);
  const goldM = mat(C.gold, { roughness: 0.5, metalness: 0.5 });
  add(b.g, sph(0.026, 8, 8), goldM, 0, 0.68, 0.25);
  add(b.g, sph(0.026, 8, 8), goldM, 0, 0.58, 0.255);
  add(b.g, box(0.1, 0.07, 0.02), goldM, 0.13, 0.75, 0.235, 0, 0, 0.3);
  const tailSeg = cyl(0.045, 0.055, 0.24, 8);
  let t1 = add(b.g, tailSeg, gingerM, 0, 0.5, -0.32, 1.15, 0, 0);
  let t2 = add(b.g, tailSeg, gingerM, 0, 0.62, -0.46, 0.55, 0, 0);
  let t3 = add(b.g, cyl(0.03, 0.045, 0.2, 8), gingerM, 0, 0.8, -0.5, 0.1, 0, 0);
  add(b.g, sph(0.05, 8, 8), earM, 0, 0.91, -0.49);
  void t1; void t2; void t3;
}

export function buildAvatar(i, THREE_NS) {
  const T = THREE_NS || THREE;
  const k = kit(T);
  let b;
  switch (((i % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT) {
    case 0:
      b = buildBase(k, { leg: C.navy, torso: C.navy, arm: C.navy, hand: C.white });
      dressClassic(k, b);
      break;
    case 1:
      b = buildBase(k, { leg: C.brownDark, torso: C.brown, arm: C.brown });
      dressSteamer(k, b);
      break;
    case 2:
      b = buildBase(k, { leg: C.navy, torso: C.hiVis, arm: C.navy });
      dressSignalman(k, b);
      break;
    case 3:
      b = buildBase(k, {
        leg: 0x6f7680,
        torso: C.teal,
        arm: C.teal,
        torsoShape: "coat",
        shoulderX: 0.26,
        armOut: 0.5,
        eyeZ: 0.3,
        noseZ: 0.315,
      });
      dressGranny(k, b);
      break;
    case 4:
      b = buildBase(k, {
        leg: C.tinDark,
        torso: C.tin,
        arm: C.tin,
        hand: C.tinDark,
        head: C.tin,
        torsoShape: "box",
        headShape: "box",
        boxLegs: true,
        shoulderX: 0.32,
        noEyes: true,
        noNose: true,
        shoe: 0x5f656e,
      });
      dressTinbot(k, b);
      break;
    case 5:
    default:
      b = buildBase(k, {
        leg: C.ginger,
        torso: C.ginger,
        arm: C.ginger,
        hand: C.gingerDark,
        head: C.ginger,
        nose: C.pink,
        noNose: true,
        shoe: C.gingerDark,
      });
      dressCat(k, b);
      break;
  }
  b.g.userData.animBob = true;
  b.g.userData.avatarId = ((i % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
  return b.g;
}

export function buildPodiumAvatar(i, THREE_NS) {
  const g = buildAvatar(i, THREE_NS);
  g.userData.idle = {
    bobAmp: 0.035,
    bobSpeed: 1.4 + (i % AVATAR_COUNT) * 0.17,
    swayAmp: 0.05,
    swaySpeed: 0.85 + (i % AVATAR_COUNT) * 0.11,
    phase: (i % AVATAR_COUNT) * 1.05,
  };
  return g;
}

const P = {
  navy: "#2C3E67",
  navyDark: "#233252",
  gold: "#F4C542",
  skin: "#F2C89B",
  white: "#F5F6F8",
  black: "#23252B",
  brown: "#7A4A2B",
  brownDark: "#5C3820",
  glass: "#8FD3E8",
  scarf: "#9AA0A8",
  hiVis: "#FF8C1A",
  reflect: "#E8ECEF",
  hardHat: "#FFD23F",
  teal: "#2E8B84",
  hairGrey: "#C9CDD3",
  tin: "#B8BEC6",
  tinDark: "#8A9099",
  cyan: "#39E6E0",
  red: "#E53935",
  ginger: "#E8862E",
  gingerDark: "#C96F1E",
  pink: "#F08A9B",
  cream: "#F7EDE0",
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawShoulders(ctx, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(64, 136, 44, 40, 0, Math.PI, 2 * Math.PI);
  ctx.fill();
}

function drawFace(ctx, opt) {
  const o = opt || {};
  const cy = o.cy || 62;
  ctx.fillStyle = o.skin || P.skin;
  ctx.beginPath();
  ctx.arc(64, cy, o.r || 30, 0, 2 * Math.PI);
  ctx.fill();
  if (!o.noEyes) {
    ctx.fillStyle = P.black;
    ctx.beginPath();
    ctx.arc(53, cy + 2, 3.1, 0, 2 * Math.PI);
    ctx.arc(75, cy + 2, 3.1, 0, 2 * Math.PI);
    ctx.fill();
  }
  if (!o.noSmile) {
    ctx.strokeStyle = o.smile || "#B5824F";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(64, cy + 8, 7, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  }
}

const PORTRAIT = [
  function classic(ctx) {
    drawShoulders(ctx, P.navy);
    ctx.fillStyle = P.gold;
    ctx.beginPath();
    ctx.arc(64, 112, 3, 0, 2 * Math.PI);
    ctx.arc(64, 124, 3, 0, 2 * Math.PI);
    ctx.fill();
    drawFace(ctx, {});
    ctx.fillStyle = P.navy;
    ctx.beginPath();
    ctx.arc(64, 52, 31, Math.PI, 2 * Math.PI);
    ctx.fill();
    roundRect(ctx, 33, 22, 62, 18, 8);
    ctx.fill();
    ctx.fillStyle = P.gold;
    ctx.fillRect(33, 46, 62, 4);
    ctx.fillStyle = P.black;
    ctx.beginPath();
    ctx.ellipse(64, 52, 34, 6, 0, 0, Math.PI);
    ctx.fill();
  },
  function steamer(ctx) {
    drawShoulders(ctx, P.brown);
    ctx.fillStyle = P.scarf;
    roundRect(ctx, 36, 94, 56, 14, 7);
    ctx.fill();
    roundRect(ctx, 58, 100, 14, 24, 6);
    ctx.fill();
    drawFace(ctx, {});
    ctx.fillStyle = P.brownDark;
    ctx.beginPath();
    ctx.arc(64, 52, 31, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(64, 52, 33, 5, 0, 0, Math.PI);
    ctx.fill();
    for (const x of [52, 76]) {
      ctx.fillStyle = "#4A3A28";
      ctx.beginPath();
      ctx.arc(x, 38, 9.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = P.glass;
      ctx.beginPath();
      ctx.arc(x, 38, 6.2, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.strokeStyle = "#4A3A28";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(58, 38);
    ctx.lineTo(70, 38);
    ctx.stroke();
  },
  function signalman(ctx) {
    drawShoulders(ctx, P.hiVis);
    ctx.fillStyle = P.reflect;
    ctx.fillRect(24, 116, 80, 8);
    ctx.fillStyle = P.tin;
    ctx.beginPath();
    ctx.arc(78, 108, 4.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = P.black;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(70, 98);
    ctx.lineTo(78, 104);
    ctx.stroke();
    drawFace(ctx, {});
    ctx.fillStyle = P.hardHat;
    ctx.beginPath();
    ctx.arc(64, 48, 30, Math.PI, 2 * Math.PI);
    ctx.fill();
    roundRect(ctx, 28, 44, 72, 8, 4);
    ctx.fill();
    ctx.fillStyle = "#E8B92E";
    roundRect(ctx, 58, 20, 12, 26, 5);
    ctx.fill();
  },
  function granny(ctx) {
    drawShoulders(ctx, P.teal);
    drawFace(ctx, { smile: "#B5824F" });
    ctx.fillStyle = P.hairGrey;
    ctx.beginPath();
    ctx.arc(64, 54, 32, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 26, 11, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = "#555A63";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(53, 64, 8.5, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(75, 64, 8.5, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(61, 63);
    ctx.lineTo(67, 63);
    ctx.stroke();
    ctx.fillStyle = "rgba(240,138,155,0.5)";
    ctx.beginPath();
    ctx.arc(45, 74, 4.5, 0, 2 * Math.PI);
    ctx.arc(83, 74, 4.5, 0, 2 * Math.PI);
    ctx.fill();
  },
  function tinbot(ctx) {
    drawShoulders(ctx, P.tin);
    ctx.fillStyle = P.tinDark;
    for (const x of [34, 94]) {
      ctx.beginPath();
      ctx.arc(x, 112, 2.6, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = P.red;
    ctx.beginPath();
    ctx.arc(64, 118, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = P.tinDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(64, 34);
    ctx.lineTo(64, 18);
    ctx.stroke();
    ctx.fillStyle = P.red;
    ctx.beginPath();
    ctx.arc(64, 15, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = P.tin;
    roundRect(ctx, 34, 34, 60, 56, 12);
    ctx.fill();
    ctx.fillStyle = P.tinDark;
    for (const x of [40, 88]) {
      ctx.beginPath();
      ctx.arc(x, 40, 2.4, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = P.cyan;
    ctx.shadowColor = P.cyan;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(51, 58, 6.5, 0, 2 * Math.PI);
    ctx.arc(77, 58, 6.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = P.tinDark;
    roundRect(ctx, 52, 74, 24, 6, 3);
    ctx.fill();
  },
  function cat(ctx) {
    drawShoulders(ctx, P.ginger);
    ctx.fillStyle = "#6B2C3A";
    roundRect(ctx, 44, 110, 40, 20, 6);
    ctx.fill();
    ctx.fillStyle = P.gold;
    ctx.beginPath();
    ctx.arc(64, 116, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = P.ginger;
    ctx.beginPath();
    ctx.moveTo(38, 48);
    ctx.lineTo(30, 18);
    ctx.lineTo(56, 34);
    ctx.closePath();
    ctx.moveTo(90, 48);
    ctx.lineTo(98, 18);
    ctx.lineTo(72, 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = P.pink;
    ctx.beginPath();
    ctx.moveTo(40, 42);
    ctx.lineTo(36, 27);
    ctx.lineTo(50, 36);
    ctx.closePath();
    ctx.moveTo(88, 42);
    ctx.lineTo(92, 27);
    ctx.lineTo(78, 36);
    ctx.closePath();
    ctx.fill();
    drawFace(ctx, { skin: P.ginger, noSmile: true });
    ctx.fillStyle = P.cream;
    ctx.beginPath();
    ctx.ellipse(64, 74, 14, 10, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = P.pink;
    ctx.beginPath();
    ctx.moveTo(64, 68);
    ctx.lineTo(60, 63);
    ctx.lineTo(68, 63);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = P.white;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(64 + s * 16, 70);
      ctx.lineTo(64 + s * 34, 65);
      ctx.moveTo(64 + s * 16, 75);
      ctx.lineTo(64 + s * 34, 77);
    }
    ctx.stroke();
  },
];

const PORTRAIT_TINT = ["#8FA3CE", "#C9A98C", "#FFC48A", "#8FD0CA", "#AEE9E6", "#F5C08F"];

export function paintAvatarPortrait(canvas, i, size) {
  const s = size || 128;
  const id = ((i % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = s * dpr;
  canvas.height = s * dpr;
  if (canvas.style) {
    canvas.style.width = s + "px";
    canvas.style.height = s + "px";
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform((s * dpr) / 128, 0, 0, (s * dpr) / 128, 0, 0);
  const grad = ctx.createRadialGradient(64, 54, 8, 64, 64, 92);
  grad.addColorStop(0, "#F4F6FA");
  grad.addColorStop(0.55, "#E7EBF2");
  grad.addColorStop(1, PORTRAIT_TINT[id] + "55");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  ctx.save();
  ctx.beginPath();
  ctx.arc(64, 64, 63, 0, 2 * Math.PI);
  ctx.clip();
  PORTRAIT[id](ctx);
  ctx.restore();
  return canvas;
}
