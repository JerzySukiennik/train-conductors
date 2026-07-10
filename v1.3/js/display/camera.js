// camera.js — TV camera: static full-map framing, intro flyover, crash zoom, additive shake (Grand Conductors v1)

import * as THREE from "three";

const TILT = 0.94;
const YAW = 0.62;

export function initCamera(sc) {
  const cam = sc.camera3;

  const home = { pos: new THREE.Vector3(0, 40, 40), look: new THREE.Vector3(0, 0, 0) };
  const cur = { pos: cam.position.clone(), look: new THREE.Vector3(0, 0, 0) };

  let tween = null;
  let shakeMag = 0;
  const shakeOff = new THREE.Vector3();
  const _tmp = new THREE.Vector3();

  const _corner = new THREE.Vector3();

  function computeHome(level) {
    const w = level && level.island ? level.island.w : 46;
    const d = level && level.island ? level.island.d : 30;
    const dir = new THREE.Vector3(
      Math.sin(YAW) * Math.cos(TILT),
      Math.sin(TILT),
      Math.cos(YAW) * Math.cos(TILT)
    ).normalize();
    home.look.set(0, 0, 0);

    // Fit the whole island by projecting its 8 corners (ground + a little height) and
    // scaling distance until they all sit inside NDC. Aspect- and tilt-aware, so a wide
    // 16:9 TV frames the full map instead of only half.
    const hw = w / 2;
    const hd = d / 2;
    const corners = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0, 4]) {
      corners.push([sx * hw, sy, sz * hd]);
    }
    let dist = Math.max(w, d);
    const savedPos = cam.position.clone();
    for (let iter = 0; iter < 5; iter++) {
      cam.position.copy(dir).multiplyScalar(dist).add(home.look);
      cam.lookAt(home.look);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      let maxA = 0;
      for (const c of corners) {
        _corner.set(c[0], c[1], c[2]).project(cam);
        maxA = Math.max(maxA, Math.abs(_corner.x), Math.abs(_corner.y));
      }
      if (!isFinite(maxA) || maxA <= 0) break;
      dist *= maxA * 1.06; // 6% breathing room around the island
    }
    cam.position.copy(savedPos);
    home.pos.copy(dir).multiplyScalar(dist).add(home.look);
  }

  function frameLevel(level) {
    computeHome(level);
    tween = null;
    cur.pos.copy(home.pos);
    cur.look.copy(home.look);
    apply();
  }

  function frameLobby(bounds) {
    const b = bounds || { w: 15, h: 5.2, d: 3.6 };
    const lookY = 1.9;
    const look = new THREE.Vector3(0, lookY, 0);
    const dir = new THREE.Vector3(0, Math.sin(0.42), Math.cos(0.42)).normalize(); // front, slight elevation
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
      corners.push([sx * b.w / 2, sy * b.h, sz * b.d / 2]);
    }
    let dist = Math.max(b.w, b.h) * 1.2;
    const saved = cam.position.clone();
    for (let iter = 0; iter < 5; iter++) {
      cam.position.copy(dir).multiplyScalar(dist).add(look);
      cam.lookAt(look);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      let maxA = 0;
      for (const c of corners) {
        _corner.set(c[0], c[1], c[2]).project(cam);
        maxA = Math.max(maxA, Math.abs(_corner.x), Math.abs(_corner.y));
      }
      if (!isFinite(maxA) || maxA <= 0) break;
      dist *= maxA * 1.05;
    }
    cam.position.copy(saved);
    tween = null;
    home.look.copy(look);
    home.pos.copy(dir).multiplyScalar(dist).add(look);
    cur.pos.copy(home.pos);
    cur.look.copy(look);
    apply();
  }

  function flyover(level, onDone) {
    computeHome(level);
    const startLook = new THREE.Vector3(
      (Math.random() - 0.5) * level.island.w * 0.3,
      0,
      (Math.random() - 0.5) * level.island.d * 0.3
    );
    const startPos = new THREE.Vector3(startLook.x - 10, 7, startLook.z + 16);
    cur.pos.copy(startPos);
    cur.look.copy(startLook);
    tween = {
      t: 0,
      dur: 4,
      fromP: startPos.clone(),
      toP: home.pos.clone(),
      fromL: startLook.clone(),
      toL: home.look.clone(),
      ease: easeInOut,
      onDone,
    };
  }

  function crashZoom(pos, onDone) {
    computeHomeIfNeeded();
    const target = pos.clone();
    const dir = new THREE.Vector3().subVectors(home.pos, home.look).normalize();
    const zoomPos = target.clone().add(dir.multiplyScalar(18));
    zoomPos.y = Math.max(10, zoomPos.y);
    tween = {
      t: 0,
      dur: 1.2,
      fromP: cur.pos.clone(),
      toP: zoomPos,
      fromL: cur.look.clone(),
      toL: target,
      ease: easeOut,
      hold: 0.6,
      onDone,
    };
  }

  function computeHomeIfNeeded() {
    if (!home.pos) computeHome(null);
  }

  function shake(mag01) {
    shakeMag = Math.max(shakeMag, mag01 * 1.4);
  }

  function easeInOut(x) {
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }
  function easeOut(x) {
    return 1 - Math.pow(1 - x, 3);
  }

  function apply() {
    cam.position.copy(cur.pos).add(shakeOff);
    cam.lookAt(cur.look);
  }

  function update(dt) {
    if (tween) {
      tween.t += dt;
      const total = tween.dur + (tween.hold || 0);
      const raw = Math.min(1, tween.t / tween.dur);
      const e = tween.ease(raw);
      cur.pos.lerpVectors(tween.fromP, tween.toP, e);
      cur.look.lerpVectors(tween.fromL, tween.toL, e);
      if (tween.t >= total) {
        const cb = tween.onDone;
        tween = null;
        if (cb) cb();
      }
    }
    if (shakeMag > 0.0005) {
      shakeOff.set(
        (Math.random() - 0.5) * shakeMag,
        (Math.random() - 0.5) * shakeMag,
        (Math.random() - 0.5) * shakeMag
      );
      shakeMag *= Math.pow(0.0008, dt);
    } else {
      shakeOff.set(0, 0, 0);
      shakeMag = 0;
    }
    apply();
  }

  return { frameLevel, frameLobby, flyover, crashZoom, shake, update, camera: cam };
}
