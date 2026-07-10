// join.js — controller join screen: room code (prefilled + locked from ?room) then nick,
// big join button -> net.joinRoom, inline i18n errors (Grand Conductors v1).

import { joinRoom } from "../net.js";
import { t } from "../i18n.js";

const $ = (id) => document.getElementById(id);
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

let wired = false;
let errEl = null;

function ensureError(form) {
  if (errEl) return errEl;
  errEl = document.createElement("p");
  errEl.className = "join-err";
  errEl.style.cssText =
    "flex-basis:100%;margin:0.2rem 0 0;color:var(--c-danger);font-weight:600;font-size:0.85rem;min-height:1.1em;text-align:center;";
  form.appendChild(errEl);
  return errEl;
}

function showError(msg) {
  if (errEl) errEl.textContent = msg || "";
}

function sanitizeCode(v) {
  return (v || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

export function joinApplyLang() {
  const form = document.querySelector("#screen-join .join-panel");
  const labels = form ? form.querySelectorAll("label") : [];
  if (labels[0]) labels[0].textContent = t("join.codePrompt");
  if (labels[1]) labels[1].textContent = t("join.nickPrompt");
  const btn = $("btn-join");
  if (btn) btn.textContent = t("join.joinBtn");
}

export function startJoin(ctx, { room, onJoined }) {
  const form = document.querySelector("#screen-join .join-panel");
  const code = $("inp-code");
  const nick = $("inp-nick");
  const btn = $("btn-join");
  if (!form || !code || !nick || !btn) return;

  ensureError(form);
  joinApplyLang();

  code.setAttribute("maxlength", "4");
  code.setAttribute("autocapitalize", "characters");
  code.setAttribute("autocomplete", "off");
  nick.setAttribute("maxlength", "14");
  nick.setAttribute("autocomplete", "off");

  if (room) {
    code.value = room;
    code.readOnly = true;
    code.classList.add("locked");
  } else {
    code.readOnly = false;
    code.classList.remove("locked");
  }
  const savedName = ctx.name || ls.get("gc.name") || "";
  if (savedName) nick.value = savedName;

  code.addEventListener("input", () => {
    if (!code.readOnly) code.value = sanitizeCode(code.value);
    showError("");
  });
  nick.addEventListener("input", () => showError(""));

  code.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nick.focus();
    }
  });

  if (!wired) {
    wired = true;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submit();
    });
  }

  async function submit() {
    const c = sanitizeCode(code.value);
    const name = (nick.value || "").trim().slice(0, 14);
    if (c.length !== 4) { showError(t("join.errBadCode")); code.focus(); return; }
    if (!name) { nick.focus(); return; }
    btn.disabled = true;
    ls.set("gc.name", name);
    ctx.name = name;
    const res = await joinRoom(c, { name });
    btn.disabled = false;
    if (!res || res.err || !res.pid) {
      const key =
        res && res.err === "full"
          ? "join.errFull"
          : res && res.err === "started"
          ? "join.errStarted"
          : "join.errBadCode";
      showError(t(key));
      return;
    }
    showError("");
    if (onJoined) onJoined({ pid: res.pid, isHost: res.isHost, code: c, name });
  }

  setTimeout(() => {
    if (room) nick.focus();
    else code.focus();
  }, 60);
}
