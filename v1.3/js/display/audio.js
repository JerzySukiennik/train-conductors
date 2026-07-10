// audio.js — Grand Conductors TV audio: SFX pool (Mixkit URLs) with WebAudio
// synth fallbacks per sound, shuffled background music playlist, ducking, mute.
// Safe before init: calls queue/no-op until first user gesture unlocks audio.

import { ASSETS } from "../config.js";

const MUSIC_VOLUME_DEFAULT = 0.22;
const POOL_SIZE = 3;

let ctx = null;              // shared AudioContext (created on first gesture)
let armed = false;           // user gesture happened
let muted = false;
let musicWanted = false;     // "play" requested (possibly before arming)
let musicVolume = MUSIC_VOLUME_DEFAULT;
let duckFactor = 1;          // 1 = normal, <1 = ducked
let duckTimer = 0;           // rAF handle for duck ramp
let musicEl = null;          // single Audio element for music
let playlist = [];           // shuffled copy of ASSETS.MUSIC
let playlistIdx = 0;
let musicDead = false;       // all URLs failed => stay silent

const pools = new Map();     // name -> { els: Audio[], idx, broken }
const pendingSfx = [];       // sfx requested before arming

// ---------------------------------------------------------------------------
// Init / gesture arming
// ---------------------------------------------------------------------------

export function initAudio() {
  if (armed) return;
  const onGesture = () => {
    if (armed) return;
    armed = true;
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    ensureCtx();
    // flush queued sfx (only recent ones make sense; keep it simple, play all)
    while (pendingSfx.length) {
      const { name, opts } = pendingSfx.shift();
      sfx(name, opts);
    }
    if (musicWanted) startMusic();
  };
  window.addEventListener("pointerdown", onGesture, { once: false });
  window.addEventListener("keydown", onGesture, { once: false });
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      try { ctx = new AC(); } catch (_) { ctx = null; }
    }
  }
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// SFX — pooled Audio elements with synth fallback
// ---------------------------------------------------------------------------

export function sfx(name, { volume = 1, rate = 1 } = {}) {
  if (muted) return;
  if (!ASSETS.SOUNDS[name]) return;
  if (!armed) {
    // queue a couple; drop excess so a burst pre-gesture doesn't blast later
    if (pendingSfx.length < 4) pendingSfx.push({ name, opts: { volume, rate } });
    return;
  }
  let pool = pools.get(name);
  if (!pool) {
    pool = { els: [], idx: 0, broken: false };
    pools.set(name, pool);
  }
  if (pool.broken) {
    synthFallback(name);
    return;
  }
  // lazily create up to POOL_SIZE elements
  let el = null;
  if (pool.els.length < POOL_SIZE) {
    el = new Audio(ASSETS.SOUNDS[name]);
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    pool.els.push(el);
  } else {
    el = pool.els[pool.idx % pool.els.length];
    pool.idx++;
  }
  try {
    el.volume = Math.max(0, Math.min(1, volume));
    el.playbackRate = rate;
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        pool.broken = true;
        synthFallback(name);
      });
    }
  } catch (_) {
    pool.broken = true;
    synthFallback(name);
  }
}

// ---------------------------------------------------------------------------
// Synth fallbacks — short WebAudio approximations per sound purpose
// ---------------------------------------------------------------------------

function synthFallback(name) {
  const ac = ensureCtx();
  if (!ac || muted) return;
  const t0 = ac.currentTime;
  try {
    switch (name) {
      case "horn":     synthHorn(ac, t0, 330, 0.55); break;
      case "hornBig":  synthHorn(ac, t0, 185, 0.8); break;
      case "crash":    synthCrash(ac, t0); break;
      case "pickup":   synthPickup(ac, t0); break;
      case "click":    synthClick(ac, t0); break;
      case "alarm":    synthAlarm(ac, t0); break;
      case "countdown":synthCountdown(ac, t0); break;
      case "win":      synthWin(ac, t0); break;
      case "bell":     synthBell(ac, t0); break;
      case "sheep":    synthSheep(ac, t0); break;
      case "brake":    synthBrake(ac, t0); break;
      case "carHorn":  synthCarHorn(ac, t0); break;
      default:         synthClick(ac, t0); break;
    }
  } catch (_) { /* never throw from audio */ }
}

function env(ac, t0, peak, attack, dur) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(ac.destination);
  return g;
}

function noiseBuffer(ac, seconds) {
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// horn: two detuned square oscillators with a small upward glide
function synthHorn(ac, t0, base, dur) {
  const g = env(ac, t0, 0.18, 0.03, dur);
  for (const detune of [0, 12]) {
    const o = ac.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(base * 0.92, t0);
    o.frequency.linearRampToValueAtTime(base, t0 + 0.12);
    o.detune.value = detune;
    o.connect(g);
    o.start(t0);
    o.stop(t0 + dur);
  }
}

// crash: noise burst through lowpass sweeping down
function synthCrash(ac, t0) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 1.1);
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(3200, t0);
  f.frequency.exponentialRampToValueAtTime(120, t0 + 1.0);
  const g = env(ac, t0, 0.5, 0.005, 1.1);
  src.connect(f).connect(g);
  src.start(t0);
  src.stop(t0 + 1.15);
}

// pickup: two rising sine blips
function synthPickup(ac, t0) {
  for (let i = 0; i < 2; i++) {
    const t = t0 + i * 0.11;
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(660 + i * 220, t);
    o.frequency.exponentialRampToValueAtTime(1100 + i * 330, t + 0.09);
    const g = env(ac, t, 0.22, 0.005, 0.12);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.13);
  }
}

// click: ~5ms filtered noise tick
function synthClick(ac, t0) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.01);
  const f = ac.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 2500;
  const g = env(ac, t0, 0.25, 0.001, 0.03);
  src.connect(f).connect(g);
  src.start(t0);
  src.stop(t0 + 0.03);
}

// alarm: alternating two-tone
function synthAlarm(ac, t0) {
  for (let i = 0; i < 4; i++) {
    const t = t0 + i * 0.16;
    const o = ac.createOscillator();
    o.type = "square";
    o.frequency.value = i % 2 ? 620 : 880;
    const g = env(ac, t, 0.12, 0.01, 0.14);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.15);
  }
}

// countdown: short single beep (called per tick)
function synthCountdown(ac, t0) {
  const o = ac.createOscillator();
  o.type = "sine";
  o.frequency.value = 880;
  const g = env(ac, t0, 0.2, 0.005, 0.18);
  o.connect(g);
  o.start(t0);
  o.stop(t0 + 0.2);
}

// win: quick major arpeggio
function synthWin(ac, t0) {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, i) => {
    const t = t0 + i * 0.13;
    const o = ac.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const g = env(ac, t, 0.2, 0.01, 0.3);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.32);
  });
}

// bell: sine with fast decay + harmonics
function synthBell(ac, t0) {
  const partials = [[1, 0.22], [2.76, 0.09], [5.4, 0.04]];
  for (const [mult, amp] of partials) {
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = 740 * mult;
    const g = env(ac, t0, amp, 0.003, 0.7);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + 0.72);
  }
}

// sheep: wobbly sawtooth "baa" via LFO on pitch
function synthSheep(ac, t0) {
  const o = ac.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(260, t0);
  o.frequency.linearRampToValueAtTime(190, t0 + 0.5);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 9;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 24;
  lfo.connect(lfoGain).connect(o.frequency);
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 1200;
  const g = env(ac, t0, 0.16, 0.04, 0.55);
  o.connect(f).connect(g);
  o.start(t0);
  lfo.start(t0);
  o.stop(t0 + 0.58);
  lfo.stop(t0 + 0.58);
}

// brake: filtered noise sweep down
function synthBrake(ac, t0) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.9);
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 4;
  f.frequency.setValueAtTime(3000, t0);
  f.frequency.exponentialRampToValueAtTime(300, t0 + 0.85);
  const g = env(ac, t0, 0.18, 0.02, 0.9);
  src.connect(f).connect(g);
  src.start(t0);
  src.stop(t0 + 0.92);
}

// carHorn: dual-tone burst
function synthCarHorn(ac, t0) {
  for (const freq of [440, 554]) {
    const o = ac.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const g = env(ac, t0, 0.1, 0.01, 0.35);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + 0.37);
  }
}

// ---------------------------------------------------------------------------
// Music — shuffled playlist, single Audio element
// ---------------------------------------------------------------------------

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function applyMusicVolume() {
  if (musicEl) {
    musicEl.volume = muted ? 0 : Math.max(0, Math.min(1, musicVolume * duckFactor));
  }
}

function startMusic() {
  if (musicDead || !armed) return;
  if (!playlist.length) {
    playlist = shuffle(ASSETS.MUSIC || []);
    playlistIdx = 0;
    if (!playlist.length) { musicDead = true; return; }
  }
  if (!musicEl) {
    musicEl = new Audio();
    musicEl.preload = "auto";
    musicEl.crossOrigin = "anonymous";
    musicEl.addEventListener("ended", () => nextTrack(0));
    musicEl.addEventListener("error", () => nextTrack(1));
  }
  playCurrentTrack(0);
}

function playCurrentTrack(failCount) {
  if (musicDead || !musicWanted) return;
  musicEl.src = playlist[playlistIdx % playlist.length];
  applyMusicVolume();
  const p = musicEl.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => nextTrack(failCount + 1));
  }
}

function nextTrack(failCount) {
  if (!playlist.length || failCount >= playlist.length + 1) {
    musicDead = true; // every URL failed => silence, no synth music
    return;
  }
  playlistIdx = (playlistIdx + 1) % playlist.length;
  if (playlistIdx === 0) playlist = shuffle(playlist); // reshuffle each loop
  playCurrentTrack(failCount);
}

export function music(cmd, value) {
  switch (cmd) {
    case "play":
      musicWanted = true;
      if (armed) startMusic();
      break;
    case "pause":
      musicWanted = false;
      if (musicEl) { try { musicEl.pause(); } catch (_) {} }
      break;
    case "skip":
      if (musicEl && musicWanted && !musicDead) nextTrack(0);
      break;
    case "volume":
      if (typeof value === "number") {
        musicVolume = Math.max(0, Math.min(1, value));
        applyMusicVolume();
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Ducking + mute
// ---------------------------------------------------------------------------

export function duck(seconds = 1.5) {
  if (duckTimer) cancelAnimationFrame(duckTimer);
  duckFactor = 0.3;
  applyMusicVolume();
  const holdMs = Math.max(0, seconds) * 1000;
  const rampMs = 600;
  const start = performance.now();
  const step = (now) => {
    const t = now - start;
    if (t < holdMs) {
      duckFactor = 0.3;
    } else if (t < holdMs + rampMs) {
      duckFactor = 0.3 + 0.7 * ((t - holdMs) / rampMs);
    } else {
      duckFactor = 1;
      applyMusicVolume();
      duckTimer = 0;
      return;
    }
    applyMusicVolume();
    duckTimer = requestAnimationFrame(step);
  };
  duckTimer = requestAnimationFrame(step);
}

export function setMuted(m) {
  muted = !!m;
  applyMusicVolume();
  if (muted) {
    pendingSfx.length = 0;
  } else if (musicWanted && armed && musicEl && musicEl.paused && !musicDead) {
    const p = musicEl.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }
}
