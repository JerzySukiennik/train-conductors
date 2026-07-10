// hostpanel.js — host hamburger modal: pause/resume, end game (two-tap), kick list (Grand Conductors v1)

import { pushCommand } from "../net.js";
import { t } from "../i18n.js";

let ctx = null;
let endArmed = false;
let endTimer = null;

const $ = (id) => document.getElementById(id);

export function initHostPanel(context) {
  ctx = context;
  const btnMenu = $("btn-hostmenu");
  const panel = $("hostpanel");
  const btnPause = $("btn-pause");
  const btnEnd = $("btn-end");

  if (btnMenu) btnMenu.addEventListener("click", () => open(true));
  if (panel) {
    panel.addEventListener("click", (e) => {
      if (e.target === panel) open(false);
    });
  }
  if (btnPause) {
    btnPause.addEventListener("click", () => {
      if (!ctx || !ctx.code) return;
      const phase = ctx.meta && ctx.meta.phase;
      const type = phase === "paused" ? "resume" : "pause";
      pushCommand(ctx.code, { type, pid: ctx.pid });
      if (ctx.vibe) ctx.vibe(15);
      open(false);
    });
  }
  if (btnEnd) {
    btnEnd.addEventListener("click", () => {
      if (!ctx || !ctx.code) return;
      if (!endArmed) {
        endArmed = true;
        btnEnd.textContent = t("host.confirmEnd");
        btnEnd.classList.add("armed");
        clearTimeout(endTimer);
        endTimer = setTimeout(() => disarmEnd(), 3000);
        return;
      }
      pushCommand(ctx.code, { type: "endGame", pid: ctx.pid });
      disarmEnd();
      open(false);
    });
  }
  updateHostPanel();
}

function disarmEnd() {
  endArmed = false;
  const btnEnd = $("btn-end");
  if (btnEnd) {
    btnEnd.textContent = t("host.endGame");
    btnEnd.classList.remove("armed");
  }
  clearTimeout(endTimer);
}

function open(on) {
  const panel = $("hostpanel");
  if (!panel) return;
  panel.classList.toggle("open", on);
  if (on) { renderTitleAndPause(); renderKickList(); }
  else disarmEnd();
}

function renderTitleAndPause() {
  const title = document.querySelector("#hostpanel .hp-title");
  if (title) title.textContent = t("host.menu");
  const btnPause = $("btn-pause");
  if (btnPause) {
    const paused = ctx && ctx.meta && ctx.meta.phase === "paused";
    btnPause.textContent = paused ? t("host.resume") : t("host.pause");
  }
}

function renderKickList() {
  const list = document.querySelector("#hostpanel .kick-list");
  if (!list || !ctx) return;
  list.innerHTML = "";
  const players = ctx.players || {};
  const entries = Object.entries(players)
    .filter(([id, p]) => p && p.connected !== false)
    .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  for (const [pid, p] of entries) {
    if (pid === ctx.pid) continue;
    const row = document.createElement("div");
    row.className = "kick-row";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = p.name || "?";
    const btn = document.createElement("button");
    btn.className = "glass-btn sm danger";
    btn.dataset.pid = pid;
    btn.textContent = t("host.kick");
    let armed = false;
    btn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        btn.textContent = "✓ " + t("host.kick");
        setTimeout(() => { armed = false; btn.textContent = t("host.kick"); }, 3000);
        return;
      }
      pushCommand(ctx.code, { type: "kick", pid: ctx.pid, target: pid });
      row.remove();
    });
    row.appendChild(name);
    row.appendChild(btn);
    list.appendChild(row);
  }
  if (!entries.some(([id]) => id !== ctx.pid)) {
    const empty = document.createElement("div");
    empty.className = "kick-empty";
    empty.textContent = "—";
    list.appendChild(empty);
  }
}

export function updateHostPanel() {
  const btnMenu = $("btn-hostmenu");
  if (btnMenu) btnMenu.classList.toggle("hidden", !(ctx && ctx.isHost));
  const panel = $("hostpanel");
  if (panel && panel.classList.contains("open")) {
    renderTitleAndPause();
    renderKickList();
  }
}

export function hostApplyLang() {
  disarmEnd();
  renderTitleAndPause();
}
