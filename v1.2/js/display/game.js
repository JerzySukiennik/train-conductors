// game.js — display orchestrator: phase machine, rules (pickup/deliver/crash/goal/timer),
// input & command handling, autopilot, state mirror, fx/audio/camera triggers, rAF loop (Grand Conductors v1)

import { BALANCE, COLORS } from "../config.js";
import { t, setLang, getLang } from "../i18n.js";
import { getLevel } from "./levels.js";
import { buildTrackRuntime } from "./track.js";
import { buildWorld, buildLobbyPodiums } from "./scene.js";
import { initTrains } from "./trains.js";
import {
  writeMeta,
  writeState,
  watchRoom,
  consumeCommands,
  kickPlayer,
} from "../net.js";
import * as hud from "./hud.js";
import * as audio from "./audio.js";

const G = {
  code: null,
  sc: null,
  cam: null,
  fx: null,
  meta: {},
  players: {},
  inputs: {},
  phase: "connect",
  level: null,
  levelIndex: 0,
  attempt: 1,
  rt: null,
  world: null,
  tr: null,
  slots: [],
  playerList: [],
  switchStates: {},
  goal: 0,
  timeLeft: 0,
  delivered: 0,
  levelClock: 0,
  running: false,
  timers: [],
  spawnTimers: {},
  boardCd: {},
  trainStation: {},
  pickupStation: {},
  lastHorn: {},
  warnState: {},
  warnClear: {},
  stateAccum: 0,
  pausedFrom: null,
  stats: { delivered: 0, attempts: 0, best: {} },
  transitioning: false,
};

const _tmp = {};

export function startDisplay(opts) {
  G.code = opts.code;
  G.sc = opts.sc;
  G.cam = opts.cam;
  G.fx = opts.fx;

  watchRoom(G.code, {
    onMeta,
    onPlayers,
    onInput: (inp) => { G.inputs = inp || {}; },
  });
  consumeCommands(G.code, onCommand);

  G.cam.frameLevel(getLevel(0));
  loop();
}

export function getPhase() {
  return G.phase;
}

export function onResize() {
  if (G.transitioning) return;
  if (G.phase === "lobby" && G.lobby) G.cam.frameLobby(G.lobby.bounds);
  else if (G.phase === "playing" && G.level) G.cam.frameLevel(G.level);
  else if (G.phase === "connect") G.cam.frameLevel(getLevel(0));
}

// --------------------------------------------------------------- meta/players

function onMeta(m) {
  G.meta = m || {};
  const lang = G.meta.settings && G.meta.settings.lang;
  if (lang && lang !== getLang()) {
    setLang(lang);
    hud.hudApplyLang();
    if (G.phase === "lobby") renderLobby();
  }
  if (G.phase === "lobby") syncLobby();
}

function onPlayers(p) {
  const prev = G.players;
  G.players = p || {};

  if (G.phase === "connect" && anyConnected()) {
    setPhase("lobby");
    renderLobby();
    syncLobby();
    return;
  }
  if (G.phase === "lobby") {
    renderLobby();
    syncLobby();
  }
  if (isPlayPhase()) {
    for (const slot of G.slots) {
      const pid = slotPid(slot);
      if (!pid) continue;
      const now = G.players[pid];
      const was = prev[pid];
      const nowConn = now && now.connected !== false;
      const wasConn = was && was.connected !== false;
      if (wasConn && !nowConn) {
        if (G.tr) G.tr.autopilot(slot, true);
        hud.toast(t("toast.autopilot", { name: (was && was.name) || "?" }));
      } else if (!wasConn && nowConn) {
        if (G.tr) G.tr.autopilot(slot, false);
        hud.toast(t("toast.playerReconnected", { name: now.name }));
      }
    }
    refreshPlayerList();
  }
}

function anyConnected() {
  return Object.values(G.players).some((p) => p && p.connected !== false);
}

function connectedPlayers() {
  return Object.entries(G.players)
    .filter(([id, p]) => p && p.connected !== false)
    .map(([id, p]) => ({ pid: id, ...p }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function slotPid(slot) {
  for (const id in G.players) {
    const p = G.players[id];
    if (p && p.order === slot) return id;
  }
  return null;
}

function refreshPlayerList() {
  G.playerList = G.slots.map((slot) => {
    const pid = slotPid(slot);
    const p = pid ? G.players[pid] : null;
    return {
      pid: pid || "slot" + slot,
      slot,
      name: p ? p.name : "—",
      avatar: p ? p.avatar || 0 : 0,
      connected: p ? p.connected !== false : false,
    };
  });
}

function renderLobby() {
  const joinUrl = location.origin + location.pathname + "?role=controller&room=" + G.code;
  hud.renderLobby({
    players: G.players,
    settings: G.meta.settings || {},
    joinUrl,
    code: G.code,
  });
}

function syncLobby() {
  const settings = G.meta.settings || {};
  const count = Math.max(1, Math.min(3, settings.playerCount || 3));
  if (!G.lobby || G.lobby.count !== count) {
    if (G.lobby) { try { G.lobby.dispose(); } catch (e) {} G.lobby = null; }
    G.lobby = buildLobbyPodiums(G.sc, count);
    G.cam.frameLobby(G.lobby.bounds);
  }
  const bySlot = {};
  for (const pid in G.players) {
    const p = G.players[pid];
    if (p && p.connected !== false) bySlot[p.order] = p;
  }
  for (let i = 0; i < count; i++) {
    const p = bySlot[i];
    G.lobby.setSlot(i, {
      present: !!p,
      avatar: p ? (p.avatar || 0) : i,
      name: p ? p.name : "",
      ready: p ? !!p.ready : false,
    });
  }
}

function disposeLobby() {
  if (G.lobby) { try { G.lobby.dispose(); } catch (e) {} G.lobby = null; }
}

// --------------------------------------------------------------- phase machine

function setPhase(p) {
  G.phase = p;
  hud.setPhase(p);
  writeMeta(G.code, { phase: p });
}

function allReady() {
  const conn = connectedPlayers();
  if (conn.length < 1) return false;
  return conn.every((p) => p.ready);
}

function startGame() {
  G.stats = { delivered: 0, attempts: 0, best: {} };
  G.levelIndex = 0;
  G.attempt = 1;
  beginLevel();
}

function beginLevel() {
  disposeLevel();
  disposeLobby();
  const lv = getLevel(G.levelIndex);
  G.level = lv;
  G.rt = buildTrackRuntime(lv);
  G.switchStates = G.rt.defaultSwitchStates();
  G.rt.switchStates = G.switchStates;

  G.world = buildWorld(G.sc, lv, G.rt);
  for (const id in G.world.switchSigns) {
    G.world.switchSigns[id].setState(G.switchStates[id] || 0);
  }

  G.slots = connectedPlayers().map((p) => p.order);
  if (G.slots.length === 0) G.slots = [0];
  const difficulty = (G.meta.settings && G.meta.settings.difficulty) || "normal";
  G.tr = initTrains(G.sc, lv, G.rt, { slots: G.slots, difficulty });
  G.tr.setSwitchStates(G.switchStates);

  G.goal = lv.goal.deliver;
  G.timeLeft = lv.goal.time;
  G.delivered = 0;
  G.levelClock = 0;
  G.spawnTimers = {};
  G.boardCd = {};
  G.trainStation = {};
  G.pickupStation = {};
  G.warnState = {};
  G.warnClear = {};
  refreshPlayerList();

  writeMeta(G.code, { level: { index: G.levelIndex, attempt: G.attempt } });
  writeState(G.code, {
    switches: G.switchStates,
    hud: { timeLeft: G.timeLeft, delivered: 0, goal: G.goal, levelIndex: G.levelIndex },
    warn: {},
  });

  G.transitioning = true;
  G.running = false;
  setPhase("countdown");
  G.cam.flyover(lv, () => runCountdown());
}

function runCountdown() {
  const steps = ["3", "2", "1", t("hud.go")];
  let i = 0;
  const tick = () => {
    if (i >= steps.length) {
      hud.hideCountdown();
      beginPlaying();
      return;
    }
    hud.showCountdown(steps[i]);
    audio.sfx(i < 3 ? "countdown" : "bell", { volume: 0.7 });
    i++;
    after(0.85, tick);
  };
  tick();
}

function beginPlaying() {
  G.transitioning = false;
  G.running = true;
  setPhase("playing");
  audio.music("play");
}

function levelWin() {
  if (!G.running) return;
  G.running = false;
  const clearTime = G.levelClock;
  const prevBest = G.stats.best[G.levelIndex];
  if (prevBest == null || clearTime < prevBest) G.stats.best[G.levelIndex] = clearTime;
  G.stats.delivered += G.delivered;

  audio.sfx("win");
  audio.duck(2);
  const center = G.cam.camera.position.clone();
  center.set(0, 7, 0);
  G.fx.confetti(center);

  const totalLevels = (G.meta.settings && G.meta.settings.levels) || 3;
  const isLast = G.levelIndex + 1 >= totalLevels;

  setPhase("levelWin");
  hud.showLevelResult({
    win: true,
    title: t("result.winTitle"),
    sub: t("result.passengers", { n: G.delivered }) + "  ·  " + t("result.time", { t: fmt(clearTime) }),
    hint: isLast ? t("results.hostContinue") : t("result.hostContinue"),
  });

  if (isLast) {
    after(2.4, () => gotoResults());
  }
}

function levelFail(reason) {
  if (!G.running && G.phase !== "playing") return;
  G.running = false;
  G.stats.attempts += 1;

  const crash = reason === "crash";
  setPhase("levelFail");
  hud.showLevelResult({
    win: false,
    title: crash ? t("result.failCrash") : t("result.failTime"),
    sub: crash ? t("result.crashSub") : "",
    hint: t("result.hostContinue"),
  });
}

function retryLevel() {
  G.attempt += 1;
  beginLevel();
}

function nextLevel() {
  const totalLevels = (G.meta.settings && G.meta.settings.levels) || 3;
  if (G.levelIndex + 1 >= totalLevels) {
    gotoResults();
    return;
  }
  G.levelIndex += 1;
  G.attempt = 1;
  beginLevel();
}

function gotoResults() {
  disposeLevel();
  setPhase("results");
  hud.showFinalResults({
    delivered: G.stats.delivered,
    attempts: G.stats.attempts,
    bestTime: bestOverall(),
  });
  audio.music("pause");
}

function bestOverall() {
  const vals = Object.values(G.stats.best);
  if (!vals.length) return null;
  return Math.min(...vals);
}

function playAgain() {
  disposeLevel();
  setPhase("lobby");
  renderLobby();
  syncLobby();
}

function disposeLevel() {
  if (G.tr) { try { G.tr.dispose(); } catch (e) {} G.tr = null; }
  if (G.world) { try { G.world.dispose(); } catch (e) {} G.world = null; }
  G.rt = null;
  G.level = null;
  hud.setWarn(false);
}

// --------------------------------------------------------------- commands

function onCommand(cmd) {
  if (!cmd || !cmd.type) return;
  const isHost = cmd.pid && cmd.pid === G.meta.hostId;

  if (cmd.type === "switch") {
    doSwitch(cmd.switchId);
    return;
  }
  if (!isHost) return;

  switch (cmd.type) {
    case "start":
      if (G.phase === "lobby" && allReady()) startGame();
      break;
    case "pause":
      if (isPlayPhase() && G.phase !== "paused") {
        G.pausedFrom = G.phase;
        G.running = false;
        G.phase = "paused";
        hud.setPhase("paused");
        hud.setPauseOverlay(true);
        writeMeta(G.code, { phase: "paused", pausedFrom: G.pausedFrom });
        audio.music("pause");
      }
      break;
    case "resume":
      if (G.phase === "paused") {
        const back = G.pausedFrom || "playing";
        G.phase = back;
        hud.setPhase(back);
        hud.setPauseOverlay(false);
        writeMeta(G.code, { phase: back });
        if (back === "playing") { G.running = true; audio.music("play"); }
      }
      break;
    case "endGame":
      gotoResults();
      break;
    case "kick":
      if (cmd.target) kickPlayer(G.code, cmd.target);
      break;
    case "retryLevel":
      if (G.phase === "levelFail") retryLevel();
      break;
    case "nextLevel":
      if (G.phase === "levelWin") nextLevel();
      break;
    case "playAgain":
      if (G.phase === "results") playAgain();
      break;
  }
}

function doSwitch(id) {
  if (!id || !G.switchStates || !(id in G.switchStates)) return;
  G.switchStates[id] = G.switchStates[id] ? 0 : 1;
  if (G.world && G.world.switchSigns[id]) G.world.switchSigns[id].setState(G.switchStates[id]);
  if (G.tr) G.tr.setSwitchStates(G.switchStates);
  audio.sfx("click", { volume: 0.6 });
  writeState(G.code, { switches: G.switchStates });
}

// --------------------------------------------------------------- loop

let lastT = 0;
function loop() {
  const now = performance.now();
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (!(dt > 0)) dt = 0.016;
  if (dt > 0.05) dt = 0.05;

  runTimers(dt);

  if (G.running && G.phase === "playing") {
    stepPlaying(dt);
  }

  if (G.world && (G.phase === "playing" || G.phase === "levelWin" || G.phase === "levelFail")) {
    G.world.update(dt);
  }
  if (G.lobby && G.phase === "lobby") {
    G.lobby.update(dt);
  }
  G.cam.update(dt);
  G.fx.update(dt);
  G.sc.renderer.render(G.sc.scene, G.sc.camera3);

  requestAnimationFrame(loop);
}

export function tick(dt) {
  runTimers(dt);
  if (G.running && G.phase === "playing") stepPlaying(dt);
}

function stepPlaying(dt) {
  applyInputs();
  G.tr.setSwitchStates(G.switchStates);
  const events = G.tr.update(dt) || [];
  for (const ev of events) handleEvent(ev);

  spawnPassengers(dt);
  handleStations(dt);
  decrementBoard(dt);
  updateWarnClear(dt);

  G.levelClock += dt;
  G.timeLeft -= dt;
  if (G.timeLeft <= 0) {
    G.timeLeft = 0;
    levelFail("time");
    return;
  }
  if (G.delivered >= G.goal) {
    levelWin();
    return;
  }

  G.stateAccum += dt;
  const hudData = {
    levelIndex: G.levelIndex,
    levelName: G.level.nameKey,
    delivered: G.delivered,
    goal: G.goal,
    timeLeft: G.timeLeft,
    players: G.playerList,
    trains: {},
  };
  hud.renderHudBar(hudData);

  if (G.stateAccum >= 0.5) {
    G.stateAccum = 0;
    writeStateMirror();
  }
}

function applyInputs() {
  for (const slot of G.slots) {
    const pid = slotPid(slot);
    if (!pid) continue;
    const inp = G.inputs[pid];
    if (!inp) continue;
    const p = G.players[pid];
    const connected = p && p.connected !== false;
    if (connected && typeof inp.throttle === "number") {
      G.tr.setThrottle(slot, inp.throttle);
    }
    if (inp.hornTs && inp.hornTs !== G.lastHorn[pid]) {
      G.lastHorn[pid] = inp.hornTs;
      G.tr.horn(slot);
      audio.sfx("horn", { volume: 0.8 });
    }
  }
}

function handleEvent(ev) {
  switch (ev.type) {
    case "crash":
      onCrash(ev);
      break;
    case "carCrash":
      onCrash({ pos: ev.pos, slots: [ev.slot] });
      break;
    case "sheepHit":
      G.tr.emergencyStop(ev.slot, BALANCE.SHEEP_STOP_TIME);
      audio.sfx("brake", { volume: 0.6 });
      audio.sfx("sheep", { volume: 0.8 });
      break;
    case "hornSheep":
      audio.sfx("sheep", { volume: 0.7 });
      break;
    case "crossingState":
      if (G.world) G.world.crossingSet(ev.state);
      if (ev.state === "warning") audio.sfx("carHorn", { volume: 0.4 });
      break;
    case "warn":
      setWarn(ev.slot, true);
      break;
    case "atStation":
      audio.sfx("bell", { volume: 0.35 });
      break;
  }
}

function onCrash(ev) {
  if (!G.running) return;
  G.running = false;
  const pos = ev.pos;
  G.fx.explosion(pos);
  G.fx.smokePuffs(pos, 8);
  G.cam.crashZoom(pos);
  G.cam.shake(1);
  audio.sfx("crash", { volume: 1 });
  audio.duck(2);
  after(1.6, () => levelFail("crash"));
}

function spawnPassengers(dt) {
  if (!G.level.stations) return;
  for (const st of G.level.stations) {
    if (!G.slots.includes(st.slot)) continue;
    const key = st.id;
    G.spawnTimers[key] = (G.spawnTimers[key] || 0) - dt;
    if (G.spawnTimers[key] <= 0) {
      const waiting = G.tr.passengersWaiting(st.id);
      if (waiting < 3) {
        G.tr.spawnPassenger(st.id);
        G.spawnTimers[key] = 3.5 + Math.random() * 3;
      } else {
        G.spawnTimers[key] = 2;
      }
    }
  }
}

function handleStations(dt) {
  if (!G.world) return;
  for (const slot of G.slots) {
    const st = G.tr.state(slot);
    if (!st) continue;
    const pos = st.pos;
    let near = null;
    let nearDist = BALANCE.STATION_RADIUS;
    for (const sid in G.world.stationAnchors) {
      const a = G.world.stationAnchors[sid];
      const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z);
      if (d < nearDist) { nearDist = d; near = { id: sid, slot: a.slot }; }
    }
    const prevStation = G.trainStation[slot] || null;
    const curId = near ? near.id : null;
    if (curId !== prevStation) {
      G.trainStation[slot] = curId;
      if (curId && G.pickupStation[slot] && curId !== G.pickupStation[slot]) {
        const w = st.wagons;
        if (w > 0) {
          G.tr.deliverPassengers(slot, curId, w);
          G.delivered += w;
          G.pickupStation[slot] = null;
          audio.sfx("bell", { volume: 0.5 });
          G.fx.pickupSparkle(pos, colorInt(slot));
        }
      }
    }
    if (near && near.slot === slot && st.speed01 <= BALANCE.PICKUP_SPEED) {
      if ((G.boardCd[slot] || 0) <= 0 && st.wagons < BALANCE.WAGON_CAP && G.tr.passengersWaiting(near.id) > 0) {
        const r = G.tr.boardPassenger(slot, near.id);
        if (r && r.ok) {
          G.pickupStation[slot] = near.id;
          G.boardCd[slot] = 0.4;
          audio.sfx("pickup", { volume: 0.6 });
          G.fx.pickupSparkle(pos, colorInt(slot));
        }
      }
    }
  }
}

function decrementBoard(dt) {
  for (const slot of G.slots) {
    if (G.boardCd[slot] > 0) G.boardCd[slot] -= dt;
  }
}

function setWarn(slot, on) {
  const pid = slotPid(slot) || "slot" + slot;
  if (on) {
    G.warnState[pid] = true;
    G.warnClear[pid] = 1.5;
    hud.setWarn(true);
    writeState(G.code, { warn: G.warnState });
  }
}

function updateWarnClear(dt) {
  let changed = false;
  let any = false;
  for (const pid in G.warnState) {
    if (G.warnState[pid]) {
      G.warnClear[pid] -= dt;
      if (G.warnClear[pid] <= 0) { G.warnState[pid] = false; changed = true; }
      else any = true;
    }
  }
  if (changed) {
    hud.setWarn(any);
    writeState(G.code, { warn: G.warnState });
  }
}

function writeStateMirror() {
  const trains = {};
  for (const slot of G.slots) {
    const pid = slotPid(slot);
    if (!pid) continue;
    const s = G.tr.state(slot);
    if (s) trains[pid] = { speed: round2(s.speed01), wagons: s.wagons, stopped: s.stopped };
  }
  writeState(G.code, {
    hud: { timeLeft: Math.ceil(G.timeLeft), delivered: G.delivered, goal: G.goal, levelIndex: G.levelIndex },
    trains,
  });
}

// --------------------------------------------------------------- utils

function isPlayPhase() {
  return ["countdown", "playing", "levelWin", "levelFail", "paused"].includes(G.phase);
}

function after(sec, fn) {
  G.timers.push({ t: sec, fn });
}
function runTimers(dt) {
  if (!G.timers.length) return;
  const keep = [];
  for (const tm of G.timers) {
    tm.t -= dt;
    if (tm.t <= 0) { try { tm.fn(); } catch (e) { console.warn(e); } }
    else keep.push(tm);
  }
  G.timers = keep;
}

function colorInt(slot) {
  const hex = COLORS.slots[slot] || "#ffffff";
  return parseInt(hex.slice(1), 16);
}
function round2(x) { return Math.round(x * 100) / 100; }
function fmt(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ":" + (r < 10 ? "0" : "") + r;
}
