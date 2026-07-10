// lobby.js — controller lobby: three.js avatar mini-preview (auto-rotate + drag),
// left/right avatar picker skipping taken avatars, ready toggle, and host settings panel
// writing meta/settings via net.writeMeta slash paths (Grand Conductors v1).

import * as THREE from "three";
import { buildAvatar, AVATAR_COUNT } from "../shared/avatars.js";
import { setPlayer, writeMeta, pushCommand } from "../net.js";
import { t, setLang } from "../i18n.js";

const $ = (id) => document.getElementById(id);

let ctx = null;
let isHostView = false;

let renderer = null;
let scene = null;
let camera = null;
let avatarGroup = null;
let rafId = 0;
let lastT = 0;
let spinY = 0;
let dragging = false;
let dragLastX = 0;
let dragActive = false;
let avatarIndex = 0;

const DIFFS = ["easy", "normal", "hard"];

// ---------- three.js preview ----------

function createRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 1.05, 3.35);
  camera.lookAt(0, 0.9, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc6ff, 0.4);
  fill.position.set(-3, 1.5, -2);
  scene.add(fill);
}

function disposeGroup(g) {
  if (!g) return;
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const m = Array.isArray(o.material) ? o.material : [o.material];
      m.forEach((mm) => mm.dispose && mm.dispose());
    }
  });
}

function setAvatarMesh(idx) {
  if (avatarGroup) {
    scene.remove(avatarGroup);
    disposeGroup(avatarGroup);
    avatarGroup = null;
  }
  avatarGroup = buildAvatar(idx, THREE);
  scene.add(avatarGroup);
}

function resizeRenderer() {
  const canvas = $("avatar-canvas");
  if (!canvas || !renderer) return;
  const w = canvas.clientWidth || 220;
  const h = canvas.clientHeight || w;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
  lastT = now;
  if (!dragActive) spinY += dt * 0.6;
  if (avatarGroup) avatarGroup.rotation.y = spinY;
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function startLoop() {
  if (rafId) return;
  lastT = 0;
  rafId = requestAnimationFrame(loop);
}
function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

// ---------- drag rotate ----------

function onPointerDown(e) {
  dragging = true;
  dragActive = true;
  dragLastX = e.clientX;
  try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
}
function onPointerMove(e) {
  if (!dragging) return;
  const dx = e.clientX - dragLastX;
  dragLastX = e.clientX;
  spinY += dx * 0.01;
}
function onPointerUp() {
  dragging = false;
  setTimeout(() => { dragActive = false; }, 1200);
}

// ---------- avatar picker ----------

function takenByOthers() {
  const set = new Set();
  const players = ctx.players || {};
  for (const pid of Object.keys(players)) {
    const p = players[pid];
    if (pid !== ctx.pid && p && p.connected && typeof p.avatar === "number") set.add(p.avatar);
  }
  return set;
}

function nextFree(from, step) {
  const taken = takenByOthers();
  let idx = from;
  for (let i = 0; i < AVATAR_COUNT; i++) {
    idx = ((idx + step) % AVATAR_COUNT + AVATAR_COUNT) % AVATAR_COUNT;
    if (!taken.has(idx)) return idx;
  }
  return from;
}

function applyAvatarIndex(idx, commit) {
  avatarIndex = ((idx % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
  setAvatarMesh(avatarIndex);
  updateAvatarName();
  if (commit && ctx.code && ctx.pid) setPlayer(ctx.code, ctx.pid, { avatar: avatarIndex });
}

function changeAvatar(step) {
  applyAvatarIndex(nextFree(avatarIndex, step), true);
}

function updateAvatarName() {
  const screen = isHostView ? $("screen-lobby-host") : $("screen-lobby-player");
  if (!screen) return;
  const nick = screen.querySelector(".avatar-title .nick");
  const name = screen.querySelector(".avatar-title .av-name");
  if (nick) nick.textContent = ctx.name || (ctx.players[ctx.pid] && ctx.players[ctx.pid].name) || "";
  if (name) name.textContent = t("avatar." + avatarIndex);
}

// ---------- ready ----------

function updateReadyButton() {
  const btn = $("btn-ready");
  if (!btn) return;
  const me = ctx.players[ctx.pid] || {};
  const on = !!me.ready;
  btn.classList.toggle("on", on);
  btn.textContent = on ? t("lobby.unreadyBtn") : t("lobby.readyBtn");
}

function toggleReady() {
  const me = ctx.players[ctx.pid] || {};
  if (ctx.code && ctx.pid) setPlayer(ctx.code, ctx.pid, { ready: !me.ready });
}

// ---------- host settings ----------

let hostWired = false;

function wireHost() {
  if (hostWired) return;
  hostWired = true;

  const seg = $("seg-difficulty");
  if (seg) {
    const btns = seg.querySelectorAll("button");
    btns.forEach((b, i) => {
      b.dataset.val = DIFFS[i] || "normal";
      b.addEventListener("click", () => {
        if (ctx.code) writeMeta(ctx.code, { "settings/difficulty": b.dataset.val });
      });
    });
  }

  wireStepper("step-players", "settings/playerCount", 1, 3);
  wireStepper("step-levels", "settings/levels", 1, 5);

  const lang = $("seg-lang");
  if (lang) {
    const btns = lang.querySelectorAll("button");
    const vals = ["pl", "en"];
    btns.forEach((b, i) => {
      b.dataset.val = vals[i] || "pl";
      b.addEventListener("click", () => {
        if (ctx.code) writeMeta(ctx.code, { "settings/lang": b.dataset.val });
        setLang(b.dataset.val);
      });
    });
  }

  const start = $("btn-start");
  if (start) {
    start.addEventListener("click", () => {
      if (start.disabled) return;
      if (ctx.code && ctx.pid) pushCommand(ctx.code, { type: "start", pid: ctx.pid });
    });
  }
}

function wireStepper(id, path, min, max) {
  const stepper = $(id);
  if (!stepper) return;
  const minus = stepper.querySelector(".minus");
  const plus = stepper.querySelector(".plus");
  const cur = () => {
    const s = (ctx.meta.settings || {});
    const key = path.split("/")[1];
    return Math.max(min, Math.min(max, s[key] || min));
  };
  if (minus) minus.addEventListener("click", () => {
    const v = Math.max(min, cur() - 1);
    if (ctx.code) writeMeta(ctx.code, { [path]: v });
  });
  if (plus) plus.addEventListener("click", () => {
    const v = Math.min(max, cur() + 1);
    if (ctx.code) writeMeta(ctx.code, { [path]: v });
  });
}

function updateHostSettings() {
  const s = ctx.meta.settings || {};
  const seg = $("seg-difficulty");
  if (seg) seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.val === (s.difficulty || "normal")));

  setStepper("step-players", s.playerCount || 1, 1, 3);
  setStepper("step-levels", s.levels || 1, 1, 5);

  const lang = $("seg-lang");
  if (lang) lang.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.val === (s.lang || "pl")));

  const start = $("btn-start");
  if (start) {
    const conn = Object.values(ctx.players || {}).filter((p) => p && p.connected);
    const allReady = conn.length >= 1 && conn.every((p) => p.ready);
    start.disabled = !allReady;
  }
}

function setStepper(id, val, min, max) {
  const stepper = $(id);
  if (!stepper) return;
  const num = stepper.querySelector(".num");
  const minus = stepper.querySelector(".minus");
  const plus = stepper.querySelector(".plus");
  if (num) num.textContent = String(val);
  if (minus) minus.disabled = val <= min;
  if (plus) plus.disabled = val >= max;
}

// ---------- static labels ----------

export function lobbyApplyLang() {
  const host = $("screen-lobby-host");
  if (host) {
    const rows = host.querySelectorAll("#host-settings .set-row > label");
    if (rows[0]) rows[0].textContent = t("lobby.difficulty");
    if (rows[1]) rows[1].textContent = t("lobby.players");
    if (rows[2]) rows[2].textContent = t("lobby.levels");
    if (rows[3]) rows[3].textContent = t("lobby.language");
    const seg = $("seg-difficulty");
    if (seg) {
      const b = seg.querySelectorAll("button");
      if (b[0]) b[0].textContent = t("lobby.easy");
      if (b[1]) b[1].textContent = t("lobby.normal");
      if (b[2]) b[2].textContent = t("lobby.hard");
    }
    const lang = $("seg-lang");
    if (lang) {
      const b = lang.querySelectorAll("button");
      if (b[0]) b[0].textContent = "PL";
      if (b[1]) b[1].textContent = "EN";
    }
    const start = $("btn-start");
    if (start) start.textContent = t("lobby.start");
  }
  updateReadyButton();
  updateAvatarName();
}

// ---------- picker mount ----------

function mountPicker(screenEl) {
  if (!screenEl) return;
  const picker = screenEl.querySelector(".avatar-picker");
  const prev = $("btn-av-prev");
  const canvas = $("avatar-canvas");
  const next = $("btn-av-next");
  const ready = $("btn-ready");
  if (picker) {
    if (prev) picker.appendChild(prev);
    if (canvas) picker.appendChild(canvas);
    if (next) picker.appendChild(next);
  }
  if (ready) {
    const host = isHostView ? screenEl.querySelector(".avatar-half") || screenEl : screenEl;
    host.appendChild(ready);
  }
}

let pickerWired = false;
function wirePicker() {
  if (pickerWired) return;
  pickerWired = true;
  const prev = $("btn-av-prev");
  const next = $("btn-av-next");
  const ready = $("btn-ready");
  const canvas = $("avatar-canvas");
  if (prev) prev.addEventListener("click", () => changeAvatar(-1));
  if (next) next.addEventListener("click", () => changeAvatar(1));
  if (ready) ready.addEventListener("click", toggleReady);
  if (canvas) {
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
  }
}

// ---------- lifecycle ----------

export function initLobby(context) {
  ctx = context;
  wirePicker();
  wireHost();
}

export function enterLobby(host) {
  isHostView = !!host;
  const screen = isHostView ? $("screen-lobby-host") : $("screen-lobby-player");
  mountPicker(screen);

  const canvas = $("avatar-canvas");
  if (canvas && !renderer) createRenderer(canvas);

  const me = ctx.players[ctx.pid] || {};
  avatarIndex = typeof me.avatar === "number" ? me.avatar : ctx.slot || 0;
  setAvatarMesh(avatarIndex);

  requestAnimationFrame(() => { resizeRenderer(); });
  window.addEventListener("resize", resizeRenderer);
  startLoop();

  lobbyApplyLang();
  updateLobby();
}

export function leaveLobby() {
  stopLoop();
  window.removeEventListener("resize", resizeRenderer);
  if (avatarGroup) { scene && scene.remove(avatarGroup); disposeGroup(avatarGroup); avatarGroup = null; }
  if (renderer) {
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (e) {}
    renderer = null;
    scene = null;
    camera = null;
  }
}

export function updateLobby() {
  if (!ctx) return;
  const me = ctx.players[ctx.pid];
  if (me && typeof me.avatar === "number" && me.avatar !== avatarIndex && !dragging) {
    avatarIndex = me.avatar;
    if (renderer) setAvatarMesh(avatarIndex);
  }
  const taken = takenByOthers();
  if (taken.has(avatarIndex)) applyAvatarIndex(nextFree(avatarIndex, 1), true);

  updateAvatarName();
  updateReadyButton();
  if (isHostView) updateHostSettings();
}
