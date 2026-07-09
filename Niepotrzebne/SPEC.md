# Grand Conductors — Game Spec (v1)

Jackbox-style co-op party game. TV (laptop/browser on big screen) = game display, phones = controllers.
1-3 players together run parallel trains on a shared low-poly island map (Conduct DELUXE! visual style),
delivering color-matched passengers while avoiding collisions. All switches are SHARED (anyone can toggle any).

## Locked decisions (from Jurek Q&A, 2026-07-09)

1. **Mechanic**: parallel trains — each player owns ONE train (their color = identity).
2. **Switches**: shared resource — ANY player can toggle ANY switch. Switches labeled with big letters (A, B, C...) on TV; controller shows a grid of large letter buttons 1:1.
3. **Player train control**: throttle/brake slider (0..1 speed control) + horn button, per player.
4. **NPC hazards**: yes — sheep wandering onto tracks (horn scares them off), freight trains on fixed routes, level crossings with cars. Present regardless of player count.
5. **Collision**: ANY train-train collision (player-player or player-NPC) = big explosion + level failed for the WHOLE team → restart level.
6. **Passengers**: color-matched. Passengers wait at stations with the color of the player who must pick them up; delivered to any OTHER station (drop at next station visit). Train visually grows: each pickup adds a wagon (cap ~5 wagons).
7. **Win/lose**: level goal = deliver N passengers (team total) before time limit. Timeout = fail → restart. Collision = fail → restart.
8. **Difficulty** (host setting: easy/normal/hard) scales ONLY: track network density (more switches/crossings — achieved by choosing which levels/variants) and NPC hazard frequency. NOT train speed, NOT time limit.
9. **Levels**: 5 hand-designed levels, increasing complexity. Host picks how many to play (1-5); play proceeds level 1..N sequentially.
10. **Biome**: single — green meadow island (grass top, dirt/rock sides, floating plateau look from the trailer), pine/oak trees, grey angular rocks, stone bridges, tunnels through rock, fences, flowers.
11. **Players**: hard limit 1-3.
12. **Avatars**: 6 fully unique procedural low-poly conductor characters. Uniqueness enforced (taken avatars skipped/blocked). Avatar shown in lobby on podiums AND next to nick in the in-game HUD.
13. **Camera (TV)**: static full-map view during play (entire track network always visible). Dynamic camera ONLY for events: level intro flyover (trains still standing) and crash zoom-in.
14. **Disconnect**: player's train continues on autopilot (keeps last throttle or a safe default ~0.5; switches keep working for everyone else). Player can rejoin with the same room code and reclaim their train (by name match or free slot).
15. **End screen**: after all chosen levels — summary stats (total passengers delivered, attempts/restarts, best level time) + "Play again" / "Back to menu".
16. **Sounds**: all fetched from the internet (Mixkit verified URLs, see CONTRACT ASSETS); WebAudio-synthesized fallbacks on error. Quiet lo-fi background music, SFX, UI clicks.
17. **Vibration**: navigator.vibrate on critical moments (own train collision warning, pickup, crash) — silent no-op where unsupported (iOS Safari).
18. **UI**: Liquid Glass design (frosted translucent panels, blur, luminous borders) across TV and controller.
19. **i18n**: pl + en, host sets game language in lobby (TV + all pads follow host setting in v1).
20. **Firebase account**: gzowotesla@gmail.com — project `train-conductors`, RTDB europe-west1.

## Flow

1. **Connect screen (TV)**: big QR + room code below + big funny title ("Grand Conductors — All aboard!" / PL "Wielcy Konduktorzy — Wsiadać!"). First phone to join becomes HOST.
2. **Lobby (TV)**: smaller QR + code moves to top-right corner. Center: podiums (count = host's player-count setting), default blue low-poly conductors appear as players join; players pick 1 of 6 avatars (rotate preview on phone, left/right glass arrows) + ready button. Host additionally sets: difficulty, player count (1-3), number of levels (1-5), language. All host settings mirrored live on TV.
3. **Controller join flow**: scan QR / enter code → nick prompt FIRST → host: lobby settings + avatar; player: avatar picker. Controller UI is LANDSCAPE, no scrolling.
4. **Game start**: all ready → host's start button lights up → phones switch to game pad (host pad additionally has menu: pause, end game, kick player). TV: level intro flyover → countdown 3-2-1 → play.
5. **Play**: trains run, players pick throttle/horn/switches; deliver passengers until goal or fail (collision/timeout) → level result overlay → next level / retry.
6. **After last level**: results screen with stats; host can restart from lobby ("Play again") which returns to lobby keeping players.

## Gameplay details

- Trains start parked at their home station; throttle 0. Max speed tuned so crossing whole map takes ~20-30 s.
- A train arriving at a station auto-stops? NO — pickup/dropoff happens on pass-through at low speed OR stop: if train speed <= pickup threshold within station zone, waiting matching passengers board (one per 0.4 s, SFX ding, wagon appended). Delivered on entering zone of any other station: matching passengers disembark automatically (score +1 each).
- Wagon cap 5; passengers wait if train full.
- Sheep: spawn on random track spots, block track; if a train gets close and player honks — sheep flees (funny baa). Hitting a sheep = NOT a crash: train emergency-stops for 3 s (time penalty) and sheep respawns elsewhere. (Keeps crash = trains only, keeps it party-friendly.)
- Freight NPC train: fixed loop on its own route crossing player routes; collision with it IS a crash. Its route shown in dark grey.
- Level crossing: cars queue and cross periodically at road/track intersections; hitting a car = crash. Warning lights blink when car is crossing.
- Collision warning: display computes time-to-conflict on shared segments; warns owning players (pad flash + vibrate + TV alert icon over trains).
- Switch letters on TV rendered as floating 3D letter signs at each switch, colored neutral (shared). Pad buttons show current direction state (mini pictogram: left/right fork), update live.
- Score/HUD (TV): top bar — delivered/goal, timer, level number; player chips with avatar portrait + nick.
- Pause: host only; full-screen glass overlay on TV + pads frozen.

## Visual targets (from trailer frames)

- Island plateau: bright green top (#7CBF3F-ish), tan dirt sides, dark navy "sea" background OR soft gradient; slightly rounded island edges.
- Tracks: brown ballast strip + dark ties + steel rails, smooth curves.
- Trains: chunky low-poly, saturated player colors (red/blue/yellow), white roof accents; NPC freight = dark grey/brown with coal cars.
- Stations: small house with color-matched roof + platform + flag; passengers = tiny minifig capsules in player colors, queue on platform.
- Explosion: big yellow polygonal starburst flash + smoke puffs + camera shake (match trailer's cartoon boom).
- Trees: Kenney pines/oaks; rocks: grey angular; bridges: stone arches over water inlets; tunnels: through rock ridges (train hidden inside).
- Lighting: bright sun, soft shadows, high saturation, NO fog of war; toon-ish look with MeshStandardMaterial + strong ambient.

## Performance target

MacBook Pro 16" 2019 (Intel i9 + Radeon 5500M) at 60 fps on TV scene; iPhone XR Safari for pads.
Instanced scenery, merged static geometry, shadow map <= 2048, pixelRatio capped at 2 (TV) / 2 (pad preview).
