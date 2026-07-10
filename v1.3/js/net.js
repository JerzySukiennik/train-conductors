// net.js — Firebase RTDB layer: room create/join/watch, inputs, commands, presence (Grand Conductors v1)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  remove,
  onValue,
  onChildAdded,
  onDisconnect,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { FIREBASE, ROOM_CODE_CHARS } from "./config.js";

let app = null;
let db = null;
let netRole = "display";

const PID_KEY = "gc.pid";

function roomRef(code, path) {
  return ref(db, "rooms/" + code + (path ? "/" + path : ""));
}

function randomCode() {
  let c = "";
  for (let i = 0; i < 4; i++) {
    c += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return c;
}

function randomPid() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return "p_" + s;
}

export function initNet(role) {
  netRole = role || "display";
  if (!app) {
    app = initializeApp(FIREBASE);
    db = getDatabase(app);
  }
  return { role: netRole };
}

export async function createRoom() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    try {
      const snap = await get(roomRef(code, "meta"));
      if (snap.exists()) continue;
      await set(roomRef(code, "meta"), {
        phase: "connect",
        createdAt: serverTimestamp(),
        settings: { difficulty: "normal", playerCount: 3, levels: 3, lang: "pl" },
      });
      return { code };
    } catch (e) {
      console.warn("createRoom failed", e);
    }
  }
  return { code: null };
}

export function watchRoom(code, handlers) {
  const unsubs = [];
  try {
    if (handlers.onMeta) {
      unsubs.push(onValue(roomRef(code, "meta"), (s) => handlers.onMeta(s.val() || {})));
    }
    if (handlers.onPlayers) {
      unsubs.push(onValue(roomRef(code, "players"), (s) => handlers.onPlayers(s.val() || {})));
    }
    if (handlers.onInput) {
      unsubs.push(onValue(roomRef(code, "input"), (s) => handlers.onInput(s.val() || {})));
    }
    if (handlers.onState) {
      unsubs.push(onValue(roomRef(code, "state"), (s) => handlers.onState(s.val() || {})));
    }
  } catch (e) {
    console.warn("watchRoom failed", e);
  }
  return () => unsubs.forEach((u) => { try { u(); } catch (e) {} });
}

export async function joinRoom(code, { name }) {
  try {
    const roomSnap = await get(roomRef(code));
    if (!roomSnap.exists() || !roomSnap.child("meta").exists()) {
      return { pid: null, isHost: false, err: "badCode" };
    }
    const meta = roomSnap.child("meta").val() || {};
    const players = roomSnap.child("players").val() || {};
    const settings = meta.settings || { playerCount: 3 };
    const phase = meta.phase || "connect";

    let storedPid = null;
    try { storedPid = localStorage.getItem(PID_KEY); } catch (e) {}

    if (storedPid && players[storedPid]) {
      const isHost = meta.hostId === storedPid;
      await update(roomRef(code, "players/" + storedPid), { connected: true, name: String(name || players[storedPid].name || "").slice(0, 14) });
      return { pid: storedPid, isHost };
    }

    const list = Object.values(players);
    const connectedCount = list.filter((p) => p && p.connected).length;
    const noHost = !meta.hostId;
    const becomeHost = connectedCount === 0 && noHost;

    if (!becomeHost) {
      if (phase !== "connect" && phase !== "lobby") {
        return { pid: null, isHost: false, err: "started" };
      }
      if (connectedCount >= (settings.playerCount || 3)) {
        return { pid: null, isHost: false, err: "full" };
      }
    }

    const usedOrders = new Set(list.map((p) => p && p.order).filter((o) => o !== undefined && o !== null));
    let order = 0;
    while (usedOrders.has(order)) order++;

    const pid = randomPid();
    try { localStorage.setItem(PID_KEY, pid); } catch (e) {}

    const updates = {};
    updates["players/" + pid] = {
      name: String(name || "").slice(0, 14),
      avatar: order % 6,
      ready: false,
      connected: true,
      order,
      joinedAt: Date.now(),
    };
    if (becomeHost) updates["meta/hostId"] = pid;
    await update(roomRef(code), updates);

    return { pid, isHost: becomeHost };
  } catch (e) {
    console.warn("joinRoom failed", e);
    return { pid: null, isHost: false, err: "badCode" };
  }
}

export async function setPlayer(code, pid, patch) {
  try {
    await update(roomRef(code, "players/" + pid), patch);
  } catch (e) {
    console.warn("setPlayer failed", e);
  }
}

export async function setInput(code, pid, patch) {
  try {
    await update(roomRef(code, "input/" + pid), patch);
  } catch (e) {
    console.warn("setInput failed", e);
  }
}

export async function pushCommand(code, cmd) {
  try {
    await push(roomRef(code, "commands"), { ...cmd, ts: Date.now() });
  } catch (e) {
    console.warn("pushCommand failed", e);
  }
}

export function consumeCommands(code, cb) {
  try {
    return onChildAdded(roomRef(code, "commands"), (snap) => {
      const val = snap.val();
      try { cb(val); } catch (e) { console.warn("command handler failed", e); }
      remove(snap.ref).catch((e) => console.warn("command remove failed", e));
    });
  } catch (e) {
    console.warn("consumeCommands failed", e);
    return () => {};
  }
}

export async function writeMeta(code, patch) {
  try {
    await update(roomRef(code, "meta"), patch);
  } catch (e) {
    console.warn("writeMeta failed", e);
  }
}

export async function writeState(code, patch) {
  try {
    await update(roomRef(code, "state"), patch);
  } catch (e) {
    console.warn("writeState failed", e);
  }
}

export async function kickPlayer(code, pid) {
  try {
    await remove(roomRef(code, "players/" + pid));
    await remove(roomRef(code, "input/" + pid));
  } catch (e) {
    console.warn("kickPlayer failed", e);
  }
}

export function presence(code, pid) {
  try {
    const connRef = ref(db, ".info/connected");
    const playerRef = roomRef(code, "players/" + pid);
    return onValue(connRef, (snap) => {
      if (snap.val() === true) {
        onDisconnect(playerRef).update({ connected: false }).catch((e) => console.warn("onDisconnect failed", e));
        update(playerRef, { connected: true }).catch((e) => console.warn("presence update failed", e));
      }
    });
  } catch (e) {
    console.warn("presence failed", e);
    return () => {};
  }
}
