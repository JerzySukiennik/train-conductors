// pad.js — landscape game controller: sticky vertical throttle slider (8Hz trailing send),
// shared switch grid (optimistic flip), status strip, horn with cooldown, collision warning,
// and level/result banners (Grand Conductors v1).

import { setInput, pushCommand } from "../net.js";
import { t } from "../i18n.js";
import { BALANCE } from "../config.js";

const $ = (id) => document.getElementById(id);

let ctx = null;
let wired = false;

let throttleVal = 0;
let lastSentThrottle = -1;
let lastSendTime = 0;
let sendTimer = null;

let hornCooling = false;
let lastWarnVibe = 0;
let gridSig = "";
let bannerEl = null;
let bannerTimer = 0;
let lastPhase = null;

const FORK_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 22 V13"/><path d="M12 13 L19 5"/><path d="M12 16 L5 9" opacity="0.32"/></svg>';

// ---------- throttle ----------

function throttleEls() {
  return {
    hit: $("throttle-hit"),
    slider: $("throttle"),
    fill: $("throttle") ? $("throttle").querySelector(".track-fill") : null,
    thumb: $("throttle") ? $("throttle").querySelector(".thumb") : null,
    readout: $("speed-readout"),
  };
}

function setThrottleVisual(v) {
  const e = throttleEls();
  if (e.fill) e.fill.style.transform = "scaleY(" + v + ")";
  if (e.thumb && e.slider) {
    const h = e.slider.getBoundingClientRect().height * v;
    e.thumb.style.transform = "translate(-50%,50%) translateY(" + -h + "px)";
  }
  if (e.readout) e.readout.textContent = Math.round(v * 100) + "%";
}

function doSend() {
  lastSentThrottle = throttleVal;
  lastSendTime = performance.now();
  if (ctx.code && ctx.pid) setInput(ctx.code, ctx.pid, { throttle: +throttleVal.toFixed(3) });
}

function queueSend() {
  if (Math.abs(throttleVal - lastSentThrottle) < 0.01) return;
  const dt = performance.now() - lastSendTime;
  if (dt >= 125) {
    doSend();
  } else if (!sendTimer) {
    sendTimer = setTimeout(() => {
      sendTimer = null;
      doSend();
    }, 125 - dt);
  }
}

function pointerToVal(e) {
  const slider = $("throttle");
  if (!slider) return throttleVal;
  const r = slider.getBoundingClientRect();
  return Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
}

let dragging = false;
function wireThrottle() {
  const hit = $("throttle-hit");
  if (!hit) return;
  hit.addEventListener("pointerdown", (e) => {
    dragging = true;
    try { hit.setPointerCapture(e.pointerId); } catch (err) {}
    throttleVal = pointerToVal(e);
    setThrottleVisual(throttleVal);
    queueSend();
  });
  hit.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    throttleVal = pointerToVal(e);
    setThrottleVisual(throttleVal);
    queueSend();
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    queueSend();
  };
  hit.addEventListener("pointerup", end);
  hit.addEventListener("pointercancel", end);
}

// ---------- horn ----------

function wireHorn() {
  const btn = $("btn-horn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (hornCooling) return;
    if (ctx.code && ctx.pid) setInput(ctx.code, ctx.pid, { hornTs: Date.now() });
    ctx.vibe(20);
    hornCooling = true;
    btn.disabled = true;
    setTimeout(() => {
      hornCooling = false;
      btn.disabled = false;
    }, (BALANCE.HORN_COOLDOWN || 1.5) * 1000);
  });
}

// ---------- switch grid ----------

function buildGrid(switches) {
  const grid = $("switch-grid");
  if (!grid) return;
  const letters = Object.keys(switches).sort();
  grid.innerHTML = "";
  grid.classList.toggle("dense", letters.length > 6);
  for (const letter of letters) {
    const key = document.createElement("button");
    key.className = "glass-key";
    key.dataset.switch = letter;
    key.innerHTML =
      '<span class="letter">' + letter + '</span><span class="state">' + FORK_SVG + "</span>";
    key.classList.toggle("flipped", switches[letter] === 1);
    key.addEventListener("click", () => {
      key.classList.toggle("flipped");
      ctx.vibe(10);
      if (ctx.code && ctx.pid) pushCommand(ctx.code, { type: "switch", pid: ctx.pid, switchId: letter });
    });
    grid.appendChild(key);
  }
}

function syncGrid(switches) {
  const grid = $("switch-grid");
  if (!grid) return;
  const sig = Object.keys(switches).sort().join("");
  if (sig !== gridSig) {
    gridSig = sig;
    buildGrid(switches);
    return;
  }
  grid.querySelectorAll(".glass-key").forEach((key) => {
    key.classList.toggle("flipped", switches[key.dataset.switch] === 1);
  });
}

// ---------- status strip ----------

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m + ":" + (sec < 10 ? "0" : "") + sec;
}

function updateStatus(state) {
  const hud = state.hud || {};
  const timer = $("pad-timer");
  if (timer) {
    timer.textContent = fmtTime(hud.timeLeft);
    timer.classList.toggle("low", (hud.timeLeft || 0) < 15);
  }
  const score = $("pad-score");
  if (score) score.textContent = (hud.delivered || 0) + "/" + (hud.goal || 0);
  const speed = $("pad-speed");
  if (speed) {
    const me = (state.trains || {})[ctx.pid] || {};
    const pct = Math.round((me.speed || 0) * 100);
    speed.textContent = pct + "% 🚃" + (me.wagons || 0);
  }
}

function updateWarn(state) {
  const w = !!(state.warn && state.warn[ctx.pid]);
  document.body.classList.toggle("warn", w);
  if (w) {
    const now = Date.now();
    if (now - lastWarnVibe > 1500) {
      lastWarnVibe = now;
      ctx.vibe([80, 60, 80]);
    }
  }
}

// ---------- banners ----------

function ensureBanner() {
  if (bannerEl) return bannerEl;
  bannerEl = document.createElement("div");
  bannerEl.className = "glass-panel pad-banner";
  bannerEl.style.cssText =
    "position:fixed;z-index:88;left:50%;top:50%;transform:translate(-50%,-50%);" +
    "min-width:16rem;max-width:86vw;padding:1.1rem 1.6rem;display:flex;flex-direction:column;" +
    "align-items:center;gap:0.6rem;text-align:center;";
  bannerEl.innerHTML =
    '<h2 class="pb-title" style="margin:0;font-size:1.5rem;font-weight:700;"></h2>' +
    '<p class="pb-sub" style="margin:0;font-size:0.95rem;color:var(--ink-dim);"></p>' +
    '<div class="pb-actions" style="display:flex;gap:0.6rem;flex-wrap:wrap;justify-content:center;"></div>';
  document.body.appendChild(bannerEl);
  return bannerEl;
}

function clearBanner() {
  if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = 0; }
  if (bannerEl) bannerEl.style.display = "none";
}

function showBanner(title, opts) {
  opts = opts || {};
  const el = ensureBanner();
  el.style.display = "flex";
  el.classList.remove("pop-in");
  void el.offsetWidth;
  el.classList.add("pop-in");
  el.querySelector(".pb-title").textContent = title;
  const sub = el.querySelector(".pb-sub");
  sub.textContent = opts.sub || "";
  sub.style.display = opts.sub ? "block" : "none";
  const actions = el.querySelector(".pb-actions");
  actions.innerHTML = "";
  (opts.buttons || []).forEach((b) => {
    const btn = document.createElement("button");
    btn.className = "glass-btn primary";
    btn.textContent = b.label;
    btn.addEventListener("click", () => {
      if (ctx.code && ctx.pid) pushCommand(ctx.code, { type: b.cmd, pid: ctx.pid });
      clearBanner();
    });
    actions.appendChild(btn);
  });
  if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = 0; }
  if (opts.autoHide) bannerTimer = setTimeout(clearBanner, opts.autoHide);
}

function resultSub(meta) {
  const hud = ctx.state.hud || {};
  const attempt = (meta.level && meta.level.attempt) || 1;
  return t("results.delivered") + ": " + (hud.delivered || 0) + "  ·  " + t("results.attempts") + ": " + attempt;
}

// ---------- exports ----------

export function initPad(context) {
  ctx = context;
  if (wired) return;
  wired = true;
  wireThrottle();
  wireHorn();
}

export function enterPad() {
  setThrottleVisual(throttleVal);
  lastSentThrottle = -1;
  doSend();
  padApplyLang();
}

export function leavePad() {
  clearBanner();
  document.body.classList.remove("warn");
}

export function padOnState(state) {
  if (!state) return;
  syncGrid(state.switches || {});
  updateStatus(state);
  updateWarn(state);
}

export function padOnPlayers() {
  // slot/body handled by main; nothing pad-specific needed here yet
}

export function padOnMeta(meta, prevPhase) {
  const phase = meta.phase;
  if (phase === prevPhase && phase === lastPhase) return;
  lastPhase = phase;
  if (phase === "countdown" || phase === "playing" || phase === "paused") {
    clearBanner();
  } else if (phase === "levelWin") {
    showBanner(t("result.winTitle"), {
      sub: ctx.isHost ? "" : t("pad.waitHost"),
      buttons: ctx.isHost ? [{ label: t("result.next"), cmd: "nextLevel" }] : null,
      autoHide: ctx.isHost ? 0 : 2500,
    });
  } else if (phase === "levelFail") {
    showBanner(t("pad.levelFail"), {
      sub: ctx.isHost ? "" : t("pad.waitHost"),
      buttons: ctx.isHost ? [{ label: t("result.retry"), cmd: "retryLevel" }] : null,
      autoHide: ctx.isHost ? 0 : 2500,
    });
  } else if (phase === "results") {
    showBanner(t("results.title"), {
      sub: resultSub(meta),
      buttons: ctx.isHost ? [{ label: t("results.playAgain"), cmd: "playAgain" }] : null,
    });
  }
}

export function padApplyLang() {
  const small = document.querySelector("#btn-horn small");
  if (small) small.textContent = t("pad.horn");
}
