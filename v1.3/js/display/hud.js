// hud.js — TV DOM overlays: connect, lobby, in-game HUD bar, countdown, result/final/pause, toasts.
// Builds the full tree at boot per UIBRIEF; render fns only fill text and toggle classes (Grand Conductors v1)

import { t } from "../i18n.js";
import { paintAvatarPortrait } from "../shared/avatars.js";

let root = null;
const el = {};
let lastConnect = null;
let lastLobby = null;
let lastHud = null;
let lastResult = null;
let lastFinal = null;

function h(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

export function initHud(container) {
  root = container || document.body;

  // ---- connect screen ----
  const connect = h("div", "tv-screen", root);
  connect.id = "screen-connect";
  el.connectTitle = h("h1", "tv-title", connect);
  el.connectSub = h("p", "tv-subtitle", connect);
  const qc = h("div", "qr-card", connect);
  el.qrConnect = h("div", "", qc);
  el.qrConnect.id = "qr-connect";
  el.roomCode = h("div", "glass-chip", connect);
  el.roomCode.id = "room-code";
  el.connectHint = h("p", "connect-hint", connect);

  // ---- lobby screen ----
  const lobby = h("div", "tv-screen hidden", root);
  lobby.id = "screen-lobby";
  const lqr = h("div", "glass-panel", lobby);
  lqr.id = "lobby-qr";
  const lqrCard = h("div", "qr-card", lqr);
  el.qrLobby = h("div", "", lqrCard);
  el.qrLobby.id = "qr-lobby";
  const lqrText = h("div", "", lqr);
  el.lobbyCode = h("div", "code", lqrText);
  el.lobbyJoinHint = h("div", "join-hint", lqrText);
  h("div", "", lobby).id = "lobby-stage";
  el.nameplates = h("div", "", lobby);
  el.nameplates.id = "lobby-nameplates";
  el.lobbySettings = h("div", "glass-panel", lobby);
  el.lobbySettings.id = "lobby-settings";
  el.setRows = {};
  for (const key of ["difficulty", "players", "levels", "language"]) {
    const row = h("div", "set-row", el.lobbySettings);
    const ico = h("span", "ico", row);
    ico.textContent = { difficulty: "🎚️", players: "👥", levels: "🗺️", language: "🌐" }[key];
    const label = h("span", "label", row);
    const val = h("span", "val", row);
    el.setRows[key] = { label, val };
  }
  el.startHint = h("div", "glass-chip", lobby);
  el.startHint.id = "lobby-start-hint";

  // ---- in-game HUD bar ----
  const bar = h("div", "glass-panel hidden", root);
  bar.id = "hud-bar";
  const hlevel = h("div", "", bar);
  hlevel.id = "hud-level";
  el.hudBadge = h("span", "glass-badge", hlevel);
  const hscore = h("span", "", hlevel);
  hscore.id = "hud-score";
  el.hudDelivered = h("span", "delivered", hscore);
  el.hudGoal = h("span", "goal", hscore);
  el.hudTimer = h("div", "", bar);
  el.hudTimer.id = "hud-timer";
  el.hudPlayers = h("div", "", bar);
  el.hudPlayers.id = "hud-players";

  // ---- warn flash ----
  el.warnFlash = h("div", "", root);
  el.warnFlash.id = "warn-flash";

  // ---- countdown ----
  el.countdown = h("div", "hidden", root);
  el.countdown.id = "countdown";
  el.countNum = h("div", "count-num", el.countdown);

  // ---- result overlay ----
  el.resultOverlay = h("div", "tv-overlay hidden", root);
  el.resultOverlay.id = "overlay-result";
  const rpanel = h("div", "result-panel glass-panel", el.resultOverlay);
  el.resultTitle = h("h2", "result-title", rpanel);
  el.resultSub = h("p", "result-sub", rpanel);
  el.resultHint = h("p", "result-hint", rpanel);

  // ---- final results screen ----
  const results = h("div", "tv-screen hidden", root);
  results.id = "screen-results";
  const respanel = h("div", "results-panel glass-panel", results);
  el.resultsTitle = h("h2", "results-title", respanel);
  el.resultsRows = h("div", "", respanel);
  el.resultsHint = h("p", "results-hint", respanel);
  el.screenResults = results;

  // ---- pause overlay ----
  el.pauseOverlay = h("div", "tv-overlay hidden", root);
  el.pauseOverlay.id = "overlay-pause";
  el.pauseTitle = h("h2", "pause-title", el.pauseOverlay);
  el.pauseSub = h("p", "pause-sub", el.pauseOverlay);

  // ---- toast ----
  el.toastWrap = h("div", "toast-wrap", root);
  el.toastWrap.id = "toast-wrap";

  el.screens = {
    connect,
    lobby,
    bar,
    results,
  };
}

const PHASE_VIS = {
  connect: ["connect"],
  lobby: ["lobby"],
  countdown: ["bar"],
  playing: ["bar"],
  levelWin: ["bar"],
  levelFail: ["bar"],
  results: ["results"],
  paused: [],
};

export function setPhase(phase) {
  const show = PHASE_VIS[phase] || [];
  el.screens.connect.classList.toggle("hidden", !show.includes("connect"));
  el.screens.lobby.classList.toggle("hidden", !show.includes("lobby"));
  el.screens.bar.classList.toggle("hidden", !show.includes("bar"));
  el.screens.results.classList.toggle("hidden", !show.includes("results"));
  if (phase !== "countdown") hideCountdown();
  if (phase !== "levelWin" && phase !== "levelFail") hideResult();
  if (phase !== "paused") setPauseOverlay(false);
  if (phase === "connect" || phase === "lobby" || phase === "results") setWarn(false);
}

function popIn(node) {
  const panel = node.querySelector(".glass-panel, .result-panel, .results-panel") || node;
  panel.classList.remove("pop-in");
  void panel.offsetWidth;
  panel.classList.add("pop-in");
}

// ---- connect ----
export function renderConnect(code, joinUrl) {
  lastConnect = { code, joinUrl };
  el.connectTitle.textContent = t("connect.title");
  el.connectSub.textContent = t("connect.subtitle");
  el.connectHint.textContent = t("connect.hint");
  el.roomCode.textContent = code || "····";
  makeQR(el.qrConnect, joinUrl, 320);
}

// ---- lobby ----
export function renderLobby(data) {
  lastLobby = data;
  const { players, settings, joinUrl, code } = data;
  el.lobbyCode.textContent = code || "····";
  el.lobbyJoinHint.textContent = t("connect.orCode");
  makeQR(el.qrLobby, joinUrl, 128);

  const count = (settings && settings.playerCount) || 3;
  const bySlot = {};
  for (const pid in players) {
    const p = players[pid];
    if (p && p.connected !== false) bySlot[p.order] = p;
  }
  el.nameplates.innerHTML = "";
  for (let s = 0; s < count; s++) {
    const p = bySlot[s];
    const plate = h("div", "nameplate glass-chip slot-" + s, el.nameplates);
    if (!p) plate.classList.add("empty");
    if (p && p.ready) plate.classList.add("ready");
    const portrait = h("canvas", "plate-portrait", plate);
    portrait.width = 128;
    portrait.height = 128;
    if (p) paintAvatarPortrait(portrait, p.avatar || 0, 128);
    const name = h("span", "name", plate);
    name.textContent = p ? p.name : t("lobby.waiting");
    const check = h("span", "check", plate);
    check.textContent = "✓";
  }

  const dmap = { easy: t("lobby.easy"), normal: t("lobby.normal"), hard: t("lobby.hard") };
  el.setRows.difficulty.label.textContent = t("lobby.difficulty");
  el.setRows.difficulty.val.textContent = dmap[settings ? settings.difficulty : "normal"] || "";
  el.setRows.players.label.textContent = t("lobby.players");
  el.setRows.players.val.textContent = String(count);
  el.setRows.levels.label.textContent = t("lobby.levels");
  el.setRows.levels.val.textContent = String((settings && settings.levels) || 3);
  el.setRows.language.label.textContent = t("lobby.language");
  el.setRows.language.val.textContent = (settings && settings.lang || "pl").toUpperCase();

  el.startHint.textContent = t("lobby.startHint");
}

// ---- countdown ----
export function showCountdown(text) {
  el.countdown.classList.remove("hidden");
  const fresh = document.createElement("div");
  fresh.className = "count-num";
  fresh.textContent = text;
  el.countdown.replaceChildren(fresh);
  el.countNum = fresh;
}
export function hideCountdown() {
  el.countdown.classList.add("hidden");
}

// ---- HUD bar ----
export function renderHudBar(data) {
  lastHud = data;
  el.hudBadge.textContent = t("hud.level", { n: (data.levelIndex || 0) + 1 });
  el.hudDelivered.textContent = String(data.delivered || 0);
  el.hudGoal.textContent = " / " + (data.goal || 0);
  el.hudTimer.textContent = fmtTime(data.timeLeft || 0);
  el.hudTimer.classList.toggle("low", (data.timeLeft || 0) < 15);
  renderChips(data.players || [], data.trains || {});
}

function renderChips(players, trains) {
  const wrap = el.hudPlayers;
  const existing = {};
  wrap.querySelectorAll(".player-chip").forEach((c) => (existing[c.dataset.pid] = c));
  const seen = {};
  for (const p of players) {
    seen[p.pid] = true;
    let chip = existing[p.pid];
    if (!chip) {
      chip = h("div", "player-chip glass-chip slot-" + p.slot, wrap);
      chip.dataset.pid = p.pid;
      const canvas = h("canvas", "chip-portrait", chip);
      canvas.width = 64;
      canvas.height = 64;
      paintAvatarPortrait(canvas, p.avatar || 0, 64);
      const name = h("span", "name", chip);
      name.textContent = p.name;
      chip._name = name;
      chip._avatar = p.avatar;
    }
    if (chip._avatar !== p.avatar) {
      paintAvatarPortrait(chip.querySelector("canvas"), p.avatar || 0, 64);
      chip._avatar = p.avatar;
    }
    chip._name.textContent = p.name;
    chip.classList.toggle("offline", p.connected === false);
  }
  for (const pid in existing) {
    if (!seen[pid]) existing[pid].remove();
  }
}

export function setWarn(on) {
  el.warnFlash.classList.toggle("on", !!on);
}

// ---- result overlay ----
export function showLevelResult(data) {
  lastResult = data;
  el.resultOverlay.classList.remove("hidden", "win", "fail");
  el.resultOverlay.classList.add(data.win ? "win" : "fail");
  el.resultTitle.textContent = data.title;
  el.resultSub.textContent = data.sub || "";
  el.resultHint.textContent = data.hint || t("result.hostContinue");
  popIn(el.resultOverlay);
}
export function hideResult() {
  el.resultOverlay.classList.add("hidden");
}

// ---- final results ----
export function showFinalResults(data) {
  lastFinal = data;
  el.screenResults.classList.remove("hidden");
  el.resultsTitle.textContent = t("results.title");
  el.resultsRows.innerHTML = "";
  const rows = [
    { label: t("results.delivered"), val: data.delivered },
    { label: t("results.attempts"), val: data.attempts },
    { label: t("results.bestTime"), val: data.bestTime != null ? fmtTime(data.bestTime) : "—" },
  ];
  for (const r of rows) {
    const row = h("div", "stat-row", el.resultsRows);
    h("span", "label", row).textContent = r.label;
    h("span", "val", row).textContent = String(r.val);
  }
  el.resultsHint.textContent = t("results.hostContinue");
  popIn(el.screenResults);
}

// ---- pause ----
export function setPauseOverlay(on) {
  el.pauseOverlay.classList.toggle("hidden", !on);
  if (on) {
    el.pauseTitle.textContent = t("host.pause");
    el.pauseSub.textContent = t("pad.pausedSub");
  }
}

// ---- toast ----
export function toast(msg) {
  const node = h("div", "toast glass-chip", el.toastWrap);
  node.textContent = msg;
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 400);
  }, 2600);
}

// ---- re-render on language change ----
export function hudApplyLang() {
  if (lastConnect) renderConnect(lastConnect.code, lastConnect.joinUrl);
  if (lastLobby) renderLobby(lastLobby);
  if (lastHud) renderHudBar(lastHud);
  if (lastResult && !el.resultOverlay.classList.contains("hidden")) showLevelResult(lastResult);
  if (lastFinal && !el.screenResults.classList.contains("hidden")) showFinalResults(lastFinal);
}

// ---- helpers ----
function makeQR(container, text, size) {
  if (!container || !text) return;
  container.innerHTML = "";
  try {
    if (window.QRCode) {
      new window.QRCode(container, {
        text,
        width: size,
        height: size,
        colorDark: "#141414",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : undefined,
      });
    } else {
      container.textContent = text;
    }
  } catch (e) {
    container.textContent = text;
  }
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ":" + (r < 10 ? "0" : "") + r;
}
