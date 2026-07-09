# CONTRACT — module APIs, schema, data formats (v1)

Binding for all coder agents. If something is missing here, ASK the orchestrator — do not invent cross-module APIs.

## Stack

Pure HTML/CSS/JS ES modules, NO build step. CDN via importmap in index.html:
- three@0.160.0 (`three` + `three/addons/`) — GLTFLoader, optional RoomEnvironment
- firebase 10.12.2 modular (app + database) from gstatic
- qrcodejs 1.0.0 (davidshimjs) — global `QRCode`
- Font: Fredoka (Google Fonts, latin-ext, static weights 400;500;600;700) + `ui-rounded` fallback for headings, plus 'Plus Jakarta Sans' for body if desired — keep to max 2 font families.

NO physics engine. Trains are kinematic on a track graph.

## Files (all under v1/)

```
index.html                     entry + importmap + role router
css/glass.css                  Liquid Glass design system (tokens + components, shared)
css/tv.css                     TV layouts
css/pad.css                    controller layouts (landscape)
js/config.js                   constants: FIREBASE, COLORS, SPEED, ASSETS(models/sounds/music), BALANCE
js/i18n.js                     t(key,vars), setLang, getLang; PL+EN symmetric
js/net.js                      RTDB layer (see API)
js/shared/avatars.js           buildAvatar(index, THREE) -> THREE.Group; AVATAR_COUNT=6; avatarMeta
js/shared/glassfx.js           small DOM helpers: ripple on tap, glass button factory (optional)
js/display/main.js             boot display, role glue, phase routing
js/display/scene.js            renderer, lights, island ground, scenery placement, station meshes
js/display/track.js            track graph runtime + procedural track/road geometry
js/display/levels.js           LEVELS[5] data (format below) + difficulty variants
js/display/trains.js           train meshes (GLB, tinted), movement, wagons, NPC trains, sheep, cars
js/display/game.js             state machine + rules (pickup/deliver/collision/goal/timer)
js/display/hud.js              DOM overlays: connect screen, lobby, in-game HUD, results, pause
js/display/camera.js           static frame + intro flyover + crash zoom + shake
js/display/audio.js            music + sfx, fetch-first with synth fallback
js/display/effects.js          explosion burst, smoke, confetti, pickup sparkles
js/controller/main.js          boot controller, join flow routing
js/controller/join.js          code entry + nick prompt
js/controller/lobby.js         avatar picker (three.js mini-preview, rotate) + ready; host settings panel
js/controller/pad.js           game pad: throttle slider, horn, switch grid, status strip
js/controller/hostpanel.js     host hamburger: pause/resume, end game, kick
assets/models/trains/*.glb     Kenney (already in repo)
assets/models/nature/*.glb
assets/models/structures/*.glb
```

Root repo also gets: `index.html` redirect (?query preserved) → `v1/` (done at repo step; root redirect same pattern as gzowo-bowling).

## Firebase

Config (PUBLIC, not a secret — client SDK config):
```js
export const FIREBASE = {
  apiKey: "AIzaSyAt9NF91wm9ysDI1xV6POLCS4naZc6fP4Y",
  authDomain: "train-conductors.firebaseapp.com",
  databaseURL: "https://train-conductors-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "train-conductors",
  storageBucket: "train-conductors.firebasestorage.app",
  messagingSenderId: "528636288830",
  appId: "1:528636288830:web:76b24c9384d465af9c966f",
};
```
Rules: `rooms/*` open read/write, everything else denied (already deployed).

## RTDB schema — rooms/{CODE}

DISPLAY is the only writer of `meta/phase`, `meta/level`, `state`, `scores`. Pads write ONLY their own
`players/{pid}`, `input/{pid}`, and push to `commands`. Room code: 4 chars A-Z (no 0/O/1/I).

```
meta: {
  hostId: pid,
  phase: "connect" | "lobby" | "countdown" | "playing" | "levelFail" | "levelWin" | "results" | "paused",
  pausedFrom: "playing" (only while paused),
  settings: { difficulty: "easy"|"normal"|"hard", playerCount: 1|2|3, levels: 1..5, lang: "pl"|"en" },
  level: { index: 0.., attempt: 1.. },
  createdAt: ts
}
players/{pid}: {
  name: string(<=14), avatar: 0..5, ready: bool, connected: bool,
  order: 0..2,           // join order; slot/color index = order
  joinedAt: ts
}
input/{pid}: {
  throttle: 0..1,        // written on change (throttled to ~8Hz)
  hornTs: ts             // press timestamp
}
commands: push {           // display consumes then deletes; validates host-only types by meta.hostId
  type: "switch" | "start" | "pause" | "resume" | "endGame" | "kick" | "playAgain" | "nextLevel" | "retryLevel",
  pid, ts,
  switchId?: "A".."H",   // for switch
  target?: pid           // for kick
}
state: {                   // display-written mirror for pads
  switches: { A: 0|1, B: 0|1, ... },        // updated immediately on toggle
  hud: { timeLeft: s, delivered: n, goal: n, levelIndex: n },  // ~2Hz
  trains: { {pid}: { speed: 0..1, wagons: n, stopped: bool } }, // ~2Hz
  warn: { {pid}: bool }                      // collision warning per player, immediate
}
```

pid = `p_` + random 8 chars, persisted in localStorage `gc.pid` (rejoin reclaims same node when
name matches a disconnected player or same pid exists).

## js/net.js API (used by both roles)

```js
initNet(role)                          // connects firebase app
createRoom() -> {code}                                  // display
watchRoom(code, handlers) // {onMeta, onPlayers, onInput, onCommand, onState} — role-appropriate subsets
joinRoom(code, {name}) -> {pid, isHost, err}            // controller; first join => host, writes meta.hostId
setPlayer(code, pid, patch)            // players/{pid} merge
setInput(code, pid, patch)             // input/{pid} merge
pushCommand(code, cmd)                 // controller
consumeCommands(code, cb)              // display: onChildAdded -> cb(cmd) -> remove
writeMeta(code, patch) / writeState(code, patch)        // display only
presence(code, pid)                    // onDisconnect -> connected:false
```

## Track graph + level format (js/display/levels.js)

World units: 1 = 1 m. Map fits in ~[-24..24] x [-16..16] (x,z), y up. TV camera frames whole island.

```js
{
  id: "L1", nameKey: "level.1.name",
  island: { w: 46, d: 30 },                 // plateau size (rounded rect)
  nodes:  { n1: [x, z], n2: [x, z], ... },
  edges:  [ { id:"e1", a:"n1", b:"n2", via?: [[x,z],...] } ],  // via = Catmull-Rom midpoints
  switches: [ { id:"A", node:"n3", from:"e1", options:["e2","e3"] } ], // letter = id; default options[0]
  stations: [ { id:"s1", edge:"e4", t:0.5, slot:0, home:true } ],     // slot = player color slot 0..2
  npc: {
    freight: { path:["e7","e8","e9"], speed:0.45, count:{easy:0,normal:1,hard:1} } | null,
    sheepSpots: [ {edge:"e2", t:0.3}, ... ],  // count used scales by difficulty
    crossing: { edge:"e5", t:0.6, road:[[x,z],[x,z]], period:{easy:14,normal:10,hard:7} } | null
  },
  goal: { deliver: 8, time: 120 },            // per level; NOT scaled by difficulty
  decor: { seed: 7, treeDensity: .., rocks: [...], bridges: [ {edge:"e6", t0:.3, t1:.5} ], tunnels: [ {edge:"e2", t0:.6, t1:.8} ] },
  spawns: { 0: {edge:"e1", t:0.1, dir:1}, 1: {...}, 2: {...} }        // per slot
}
```

Difficulty selects hazard counts via the `{easy,normal,hard}` fields; track layout itself fixed per level
(level order provides density ramp). Levels must be designed so slots beyond playerCount simply don't spawn
(their stations become decor, no waiting passengers).

track.js runtime API:
```js
buildTrackRuntime(level) -> rt
rt.sampler(edgeId) -> { length, pointAt(t)->Vector3, tangentAt(t)->Vector3 }
rt.nextEdge(edgeId, dir, switchStates) -> { edgeId, dir }   // graph walk respecting switches
rt.switchStates = { A:0|1, ... }
buildTrackMesh(level, rt) -> THREE.Group    // ballast+ties+rails, roads for crossings
```

trains.js movement: each train = { slot, edgeId, t, dir, speed, wagons[] }; advance by
`speed * MAXSPEED * dt / edgeLength`; at t>1 or t<0 call rt.nextEdge. Collision: pairwise 3D distance
between train head/wagon sphere sets < threshold => crash. Sheep/car checks on same edge proximity.

## COLORS (config.js)

Player slots: 0 = #E53935 red, 1 = #1E88E5 blue, 2 = #FDD835 yellow. NPC freight: #4E5A65.
Grass #7CBF3F, dirt #B98A5A, sea #2E5F8A, track ballast #8B6F47, ties #5D4330, rails #B8C4CC.

## Switch letters

Max 8 switches per level ("A".."H"). TV: 3D floating sign (rounded glass billboard sprite with big letter)
at switch node + small arrow showing current direction. Pad: grid of glass buttons with same letters +
live direction pictogram; tap => pushCommand switch (optimistic UI flip allowed, state confirmed via state.switches).

## Avatars (js/shared/avatars.js)

`AVATARS = 6` unique procedural conductors, built from three primitives (box/cylinder/sphere/cone), ~toy-like,
distinct silhouette + palette each. Names (i18n keys avatar.0..5):
0 Classic (navy uniform, gold buttons, peaked cap)
1 Steampunk (brown leather, goggles on cap)
2 Signalman (hi-vis orange vest, whistle)
3 Granny (grey bun, glasses, teal coat — fan favourite)
4 Robot (retro tin robot conductor, antenna cap)
5 Cat (ginger cat in a tiny uniform, tail out)
API: `buildAvatar(i) -> Group` (three.js), `paintAvatarPortrait(canvas2d, i)` — 2D face/bust painter used for
HUD chips + pad (NO webgl needed for portraits).

## ASSETS — sounds (config.js), all Mixkit Free License, verified 200 + CORS *

```
MUSIC: https://assets.mixkit.co/music/763/763.mp3 , /music/764/764.mp3 , /music/135/135.mp3
SFX:
horn        https://assets.mixkit.co/active_storage/sfx/1631/1631-preview.mp3   (toy train whistle)
hornBig     https://assets.mixkit.co/active_storage/sfx/1654/1654-preview.mp3
brake       https://assets.mixkit.co/active_storage/sfx/1629/1629-preview.mp3
crash       https://assets.mixkit.co/active_storage/sfx/1703/1703-preview.mp3
win         https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3
pickup      https://assets.mixkit.co/active_storage/sfx/216/216-preview.mp3
bell        https://assets.mixkit.co/active_storage/sfx/1569/1569-preview.mp3
click       https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3
countdown   https://assets.mixkit.co/active_storage/sfx/1952/1952-preview.mp3
alarm       https://assets.mixkit.co/active_storage/sfx/1005/1005-preview.mp3
sheep       https://assets.mixkit.co/active_storage/sfx/1741/1741-preview.mp3
carHorn     https://assets.mixkit.co/active_storage/sfx/718/718-preview.mp3
```
audio.js: `new Audio(url)` per sfx with pool; on error => WebAudio synth fallback (osc blip per purpose);
music via single Audio element, shuffle, volume 0.25, ducking on crash/win; autoplay armed on first TV gesture
(and auto-attempt on game start).

## Kenney models (assets/models/) — key files

trains/: train-electric-city-a|b|c.glb (player trains: a=head, b=middle wagon, c=tail),
train-locomotive-a.glb + train-carriage-coal|box|wood|tank|lumber|flatbed.glb (NPC freight),
train-diesel-a.glb (spare). Tinting: clone materials; multiply main body material color by slot color
(traverse meshes; material names/texture stays, `mat.color.set(slotColor)` on the dominant material —
verify visually; fallback: tint all materials except glass-ish dark ones).
nature/: tree_pineDefaultA/B, tree_pineTallA, tree_default, tree_oak, tree_fat, rock_largeA-C, rock_tallA/B,
stone_largeA/B, stone_smallA/B, flower_redA/yellowA/purpleA, grass, fence_simple, fence_planks.
structures/: bridge_stone, bridge_stoneRound, bridge_side_stone, bridge_center_stone, cliff_block_rock,
cliff_blockSlope_rock, cliff_cave_rock, cliff_top_rock, cliff_large_rock.
ALL loads: timeout 6 s + try/catch => procedural fallback (simple colored primitives). Empty screen = bug.
Use InstancedMesh for repeated scenery (trees/rocks) — extract geometry+material from GLB once.

## i18n

`t("key")`, PL default; keys namespaced: connect.*, lobby.*, pad.*, hud.*, level.*, results.*, avatar.*, host.*.
PL and EN must stay symmetric. Host lang setting drives TV + all pads (v1).

## Liquid Glass (css/glass.css) — token contract

CSS vars on :root — --glass-bg (rgba white ~8-14%), --glass-stroke (luminous 1px inset border),
--glass-blur (backdrop-filter blur(18px) saturate(1.6)), --radius-lg 24px, --radius-md 16px,
--accent per-role. Components: .glass-panel, .glass-btn (+ .primary/.danger, pressed scale .96, specular
top highlight), .glass-chip, .glass-slider (throttle), .glass-arrow (lobby avatar arrows), .glass-modal.
Text: high contrast (WCAG AA on blurred bg — add subtle text-shadow/scrim where needed).
TV backdrop behind glass = the 3D scene itself. Pads: animated soft gradient backdrop so blur has content.

## Verification harness notes (from gzowo-bowling)

Hidden-tab TV throttles rAF — for logic tests, pump ticks via preview_eval module imports; inject fake pads
via RTDB REST (curl PUT/POST on rooms/{code}/...). Fresh room code readable from DOM.

## ADDENDUM — inter-module APIs (binding for wave-2 coders)

### Module ownership of scene content
- scene.js: STATIC only — renderer, lights, sky/sea, island plateau, trees/rocks/decor (instanced), track mesh mount (calls track.buildTrackMesh), station buildings+platforms (tinted per slot), switch letter signs, crossing gates/lights, bridges/tunnels decor.
- trains.js: DYNAMIC actors — player trains+wagons, NPC freight, sheep, crossing cars, waiting passengers (queues at stations, boarding hop anim).
- effects.js: transient fx (already done). game.js: rules only (no meshes). hud.js: DOM only.

### levels.js
Exports `LEVELS` (5, planner data), `BALANCE_TUNED`, and `smoothLevel(level) -> level` — corner-fillet preprocessing:
for each degree-2 node where edge polylines meet at angle > ~15°, nudge geometry to a rounded corner by inserting
via points sampling a circular arc (radius ~2.5-3.5) across the node: shift node to arc midpoint, distribute arc
halves as via points into both touching edges (ends). Must NOT change topology (same nodes/edges/switch letters).
Switch nodes (degree-3): fillet only the from->options continuations lightly or skip. After smoothing, level must
still pass track.graphSelfTest. game.js/scene.js consume `getLevel(i)` = smoothed deep copy.

### scene.js
```js
initScene(canvasParent) -> sc {renderer, scene, camera3 (set by camera.js), resize(), setPixelRatioCap(n)}
buildWorld(sc, level, rt) -> world {
  group,                      // added to scene
  switchSigns: {A: {setState(0|1)}},        // letter billboard + arrow flips
  stationAnchors: {sid: {pos, tangent, slot}},
  crossingSet(state)          // "idle"|"warning"|"closed" lights/gate
  dispose()
}
```
GLB loading through a shared loader util in scene.js: `loadGLB(path, timeoutMs=6000) -> Promise<Group|null>` (null => caller builds procedural fallback). Export loadGLB for trains.js.

### trains.js
```js
initTrains(sc, level, rt, {slots:[0,1], difficulty}) -> tr
tr.setThrottle(slot, v01); tr.horn(slot)         // horn also triggers sheep flee check + sfx via callback
tr.setSwitchStates(states)                        // mirror of game switch state
tr.update(dt) -> events[]                         // kinematics + all dynamic actors advance
  events: {type:"atStation", slot, stationId, speed01}
          {type:"crash", pos:Vector3, slots:[..]}          // any train-train incl. NPC
          {type:"sheepHit", slot, pos} {type:"carCrash", slot, pos}
          {type:"warn", slot, pos, ttc}                     // time-to-conflict < BALANCE.WARN_TTC
          {type:"hornSheep", pos}
tr.boardPassenger(slot, stationId) -> {ok, wagons}          // visual: passenger walks in + wagon appended
tr.deliverPassengers(slot, stationId, n)                    // visual disembark
tr.passengersWaiting(stationId) -> n ; tr.spawnPassenger(stationId)
tr.state(slot) -> {speed01, wagons, stopped, pos}
tr.emergencyStop(slot, seconds) ; tr.autopilot(slot, on)
tr.reset() ; tr.dispose()
```
game.js owns passenger COUNTS/rules and calls spawnPassenger/board/deliver; trains.js just animates and reports zones.

### camera.js
```js
initCamera(sc) ; frameLevel(level)                 // static full-map view (fit island, ~50-55° tilt like trailer)
flyover(level, onDone)                             // intro sweep ~4s, skippable
crashZoom(pos, onDone) ; shake(mag01) ; update(dt)
```

### game.js (display orchestrator)
Phases per CONTRACT meta.phase. Responsibilities: consumeCommands (validate host for host-only), inputs -> throttles,
switch toggle -> rt.switchStates + state.switches + sign flip, passenger spawner (per-slot pacing: keep 1-3 waiting
at stations whose slot is active), pickup rule (atStation && speed01 <= PICKUP_SPEED && waiting>0 && wagons<CAP),
deliver rule (atStation at any non-pickup station with onboard passengers -> deliver all, score += n),
crash/timeout -> levelFail, goal -> levelWin (advance or results), timer, state mirror writes (2Hz), warn writes,
autopilot on disconnect, pause/resume/kick/endGame/playAgain/retryLevel/nextLevel commands, music/sfx triggers, fx triggers.
Exports: startDisplay(roomCode) style boot used by display/main.js; also `tick(dt)` and `getPhase()` for test pumping.

### display/main.js + index.html
index.html: importmap (three@0.160.0 unpkg, three/addons/, firebase gstatic urls are absolute imports in net.js already),
loads css per role, root divs: #tv-root (with #scene-canvas container + #hud-root) for display; #pad-root for controller.
Router: parse ?role&room -> import display/main.js or controller/main.js. Display main: initNet, createRoom (or reuse ?room),
initScene/camera/audio/effects, hud connect screen with QR (qrcodejs CDN <script> in index.html, global QRCode),
then phase loop driven by net watchers + rAF.
Controller URL for QR: location.origin+path + "?role=controller&room=CODE".

### controller modules
join.js: code from ?room or manual entry -> nick -> net.joinRoom -> route by isHost. lobby.js: avatar picker
(mini three.js canvas, rotate via drag + arrows; taken avatars greyed), ready toggle; host: settings panel writes
meta/settings via... pads may NOT write meta => host settings go through pushCommand? NO — exception: host pad MAY
write meta/settings directly (rules are open; contract exception) + meta.settings mirrored by display into lobby UI.
pad.js: throttle slider -> setInput throttled 8Hz, horn button -> setInput hornTs + local anim, switch keys grid from
state.switches (letters sorted), optimistic flip, warn class on state.warn[pid], status strip from state.hud.
hostpanel.js: hamburger modal -> pushCommand pause/resume/endGame/kick.
Rejoin: main.js checks localStorage gc.pid + gc.room; if meta.phase is playing and player exists -> straight to pad.

### QR
qrcodejs (davidshimjs) via CDN script tag in index.html (global QRCode). White rounded card, black modules, quiet zone.
