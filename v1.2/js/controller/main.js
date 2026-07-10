// main.js — controller boot: net init, join/rejoin routing, phase-driven screen transitions,
// orientation blocker, wake lock, WebAudio click, vibration helper (Grand Conductors v1).

import { initNet, watchRoom, presence } from "../net.js";
import { t, getLang, setLang } from "../i18n.js";
import { startJoin, joinApplyLang } from "./join.js";
import { initLobby, enterLobby, leaveLobby, updateLobby, lobbyApplyLang } from "./lobby.js";
import { initPad, enterPad, leavePad, padOnState, padOnMeta, padOnPlayers, padApplyLang } from "./pad.js";
import { initHostPanel, updateHostPanel, hostApplyLang } from "./hostpanel.js";

const $ = (id) => document.getElementById(id);
const PAD_SCREENS = ["screen-join", "screen-lobby-player", "screen-lobby-host", "screen-pad"];
const PAD_PHASES = ["countdown", "playing", "levelFail", "levelWin", "results", "paused"];

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

const ctx = {
  code: null,
  pid: null,
  isHost: false,
  slot: 0,
  name: "",
  meta: {},
  players: {},
  state: {},
  joined: false,
  pendingVerify: false,
  vibe,
};

let unwatch = null;
let mode = "join";
let wakeLockSentinel = null;

function vibe(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

// ---------- WebAudio click ----------

let actx = null;
function click() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const now = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = "square";
    osc.frequency.value = 520;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain).connect(actx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  } catch (e) {}
}

document.addEventListener(
  "pointerdown",
  (e) => {
    const el = e.target && e.target.closest
      ? e.target.closest(".glass-btn,.glass-key,.glass-arrow,.glass-seg button,.glass-stepper button")
      : null;
    if (el) click();
  },
  { passive: true }
);

// ---------- Wake lock ----------

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) wakeLockSentinel = await navigator.wakeLock.request("screen");
  } catch (e) {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") requestWakeLock();
});

// ---------- Orientation blocker ----------

const orientationMQ = window.matchMedia("(orientation: portrait)");
function updateOrientation() {
  const blocker = $("portrait-blocker");
  const join = $("screen-join");
  const onJoin = ctx.screen === "screen-join";
  if (blocker) blocker.style.display = onJoin ? "none" : orientationMQ.matches ? "flex" : "none";
  if (join) join.style.visibility = onJoin ? "visible" : "";
}
if (orientationMQ.addEventListener) orientationMQ.addEventListener("change", updateOrientation);
else if (orientationMQ.addListener) orientationMQ.addListener(updateOrientation);
window.addEventListener("resize", updateOrientation);

// ---------- Screen switching ----------

function showScreen(id) {
  PAD_SCREENS.forEach((s) => {
    const el = $(s);
    if (el) el.classList.toggle("hidden", s !== id);
  });
  const el = $(id);
  if (el) {
    const panel = el.querySelector(".glass-panel") || el;
    panel.classList.remove("pop-in");
    void panel.offsetWidth;
    panel.classList.add("pop-in");
  }
  ctx.screen = id;
  updateOrientation();
}

function setBodySlot(slot) {
  document.body.classList.remove("slot-0", "slot-1", "slot-2");
  document.body.classList.add("slot-" + slot);
}

function computeSlot() {
  const me = ctx.players[ctx.pid];
  const order = me && typeof me.order === "number" ? me.order : 0;
  ctx.slot = order;
  setBodySlot(order);
}

// ---------- i18n refresh ----------

function fillOverlays() {
  set($("overlay-paused")?.querySelector(".ov-title"), t("pad.pausedTitle"));
  set($("overlay-paused")?.querySelector(".ov-sub"), t("pad.pausedSub"));
  set($("overlay-disconnected")?.querySelector(".ov-title"), t("pad.disconnectedTitle"));
  set($("overlay-disconnected")?.querySelector(".ov-sub"), t("pad.disconnectedSub"));
  set(document.querySelector("#portrait-blocker .rotate-msg"), t("pad.rotate"));
}
function set(el, text) { if (el) el.textContent = text; }

function refreshTexts() {
  joinApplyLang();
  lobbyApplyLang();
  padApplyLang();
  hostApplyLang();
  fillOverlays();
}

function adoptLang(m) {
  const lang = m && m.settings && m.settings.lang;
  if (lang && lang !== getLang()) {
    setLang(lang);
    refreshTexts();
    if (mode === "lobby") updateLobby();
    updateHostPanel();
  }
}

// ---------- Routing ----------

function route() {
  const phase = ctx.meta.phase || "lobby";
  computeSlot();

  if (phase === "lobby") {
    if (mode !== "lobby") {
      if (mode === "pad") leavePad();
      showScreen(ctx.isHost ? "screen-lobby-host" : "screen-lobby-player");
      enterLobby(ctx.isHost);
      mode = "lobby";
    }
    updateLobby();
  } else if (PAD_PHASES.includes(phase)) {
    if (mode !== "pad") {
      if (mode === "lobby") leaveLobby();
      showScreen("screen-pad");
      enterPad();
      mode = "pad";
    }
    padOnState(ctx.state);
    padOnPlayers(ctx.players);
  }

  const paused = $("overlay-paused");
  if (paused) paused.classList.toggle("hidden", phase !== "paused");
  const hostBtn = $("btn-hostmenu");
  if (hostBtn) hostBtn.classList.toggle("hidden", !ctx.isHost);
  updateHostPanel();
}

// ---------- Net watchers ----------

function startWatch(code) {
  if (unwatch) { unwatch(); unwatch = null; }
  ctx.code = code;
  unwatch = watchRoom(code, {
    onMeta: onMeta,
    onPlayers: onPlayers,
    onState: onState,
  });
}

function finalizeJoined() {
  ctx.joined = true;
  ctx.isHost = ctx.meta.hostId === ctx.pid;
  ls.set("gc.room", ctx.code);
  presence(ctx.code, ctx.pid);
  computeSlot();
  route();
}

function onMeta(m) {
  const prev = ctx.meta.phase;
  ctx.meta = m || {};
  adoptLang(ctx.meta);
  if (ctx.pendingVerify || !ctx.joined) return;
  ctx.isHost = ctx.meta.hostId === ctx.pid;
  route();
  if (mode === "pad") padOnMeta(ctx.meta, prev);
  updateHostPanel();
}

function onPlayers(p) {
  ctx.players = p || {};
  if (ctx.pendingVerify) {
    ctx.pendingVerify = false;
    if (!ctx.players[ctx.pid]) {
      ctx.joined = false;
      if (unwatch) { unwatch(); unwatch = null; }
      startJoinFlow(ctx.code);
      return;
    }
    finalizeJoined();
  }
  if (!ctx.joined) return;
  ctx.isHost = ctx.meta.hostId === ctx.pid;
  computeSlot();
  if (mode === "lobby") updateLobby();
  if (mode === "pad") padOnPlayers(ctx.players);
  updateHostPanel();
  const hostBtn = $("btn-hostmenu");
  if (hostBtn) hostBtn.classList.toggle("hidden", !ctx.isHost);
}

function onState(s) {
  ctx.state = s || {};
  if (ctx.joined && mode === "pad") padOnState(ctx.state);
}

// ---------- Connectivity overlay ----------

function setDisconnected(on) {
  const el = $("overlay-disconnected");
  if (el) el.classList.toggle("hidden", !on);
}
window.addEventListener("offline", () => setDisconnected(true));
window.addEventListener("online", () => setDisconnected(false));

// ---------- Join flow ----------

function startJoinFlow(room) {
  mode = "join";
  showScreen("screen-join");
  startJoin(ctx, {
    room: room,
    onJoined: (res) => {
      ctx.pid = res.pid;
      ctx.isHost = res.isHost;
      ctx.code = res.code;
      ctx.name = res.name || ctx.name;
      ctx.joined = true;
      ls.set("gc.room", res.code);
      if (ctx.name) ls.set("gc.name", ctx.name);
      startWatch(res.code);
      presence(res.code, res.pid);
      requestWakeLock();
    },
  });
}

// ---------- Boot ----------

function boot() {
  initNet("controller");
  ctx.name = ls.get("gc.name") || "";

  const params = new URLSearchParams(location.search);
  const rawRoom = params.get("room") || "";
  const urlRoom = rawRoom.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || null;

  initLobby(ctx);
  initPad(ctx);
  initHostPanel(ctx);
  refreshTexts();
  requestWakeLock();

  const storedPid = ls.get("gc.pid");
  const storedRoom = ls.get("gc.room");

  if (urlRoom && storedPid && storedRoom === urlRoom) {
    ctx.code = urlRoom;
    ctx.pid = storedPid;
    ctx.joined = true;
    ctx.pendingVerify = true;
    startWatch(urlRoom);
  } else {
    startJoinFlow(urlRoom);
  }
}

boot();
