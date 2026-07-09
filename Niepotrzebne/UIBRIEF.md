# UIBRIEF — DOM contract for glass.css / tv.css / pad.css (v1)

Binding for hud.js, lobby.js, pad.js, join.js, hostpanel.js. Build EXACTLY these trees (ids/classes).
CSS files assume: `<html class="tv">` on display, `<html class="pad">` on controller (set by role router in index.html before CSS paints). Load order: glass.css always; tv.css OR pad.css per role.

Conventions:
- Show/hide screens by toggling `.hidden` (display:none). Everything below exists in the DOM from boot; JS only fills text and toggles classes.
- Player color scoping: add `slot-0|slot-1|slot-2` class on any element to set `--accent` to that player's color (chips, nameplates, ready button, throttle fill, pad ambient glow). Pad: put `slot-N` on `<body>` once slot is known.
- All user-visible strings via i18n — CSS renders no text content except pictogram glyphs supplied by JS.
- Entrance animation: add `.pop-in` to a panel when a screen becomes visible (remove after, or leave — it's `both` fill, runs once per class add).

## TV (display) — html.tv

```
body
├─ canvas#scene-canvas                     ← three.js, fixed fullscreen, z 0 (scene.js owns)
├─ div#screen-connect.tv-screen
│  ├─ h1.tv-title                          (funny title, i18n connect.title)
│  ├─ p.tv-subtitle                        (i18n connect.subtitle)
│  ├─ div.qr-card > div#qr-connect         (qrcodejs renders into #qr-connect)
│  ├─ div#room-code.glass-chip             (4-char code text)
│  └─ p.connect-hint                       (i18n connect.hint)
├─ div#screen-lobby.tv-screen.hidden
│  ├─ div#lobby-qr.glass-panel
│  │  ├─ div.qr-card > div#qr-lobby
│  │  └─ div > div.code + div.join-hint
│  ├─ div#lobby-stage                      ← empty layout reserve; podiums are 3D in #scene-canvas
│  ├─ div#lobby-nameplates                 (JS creates one .nameplate.glass-chip per podium, in slot order)
│  │  └─ div.nameplate.glass-chip.slot-N[.ready][.empty]
│  │     ├─ span.name
│  │     └─ span.check                     (text "✓")
│  ├─ div#lobby-settings.glass-panel       (mirror of host settings; 4 rows)
│  │  └─ div.set-row × 4 → span.ico (emoji) + span.label + span.val
│  └─ div#lobby-start-hint.glass-chip      (i18n lobby.startHint)
├─ div#hud-bar.glass-panel.hidden          (in-game top bar)
│  ├─ div#hud-level → span.glass-badge (level #) + span#hud-score → span.delivered + span.goal (" / N")
│  ├─ div#hud-timer[.low]                  (m:ss; .low when <15 s)
│  └─ div#hud-players
│     └─ div.player-chip.glass-chip.slot-N[.offline]
│        ├─ canvas.chip-portrait           ← 2D, paintAvatarPortrait (avatars.js), 64×64 attr size
│        └─ span.name
├─ div#warn-flash[.on]                     (red edge vignette while any warn)
├─ div#countdown.hidden > div.count-num    (JS swaps text 3/2/1/GO; re-add .count-num node or restart animation)
├─ div#overlay-result.tv-overlay.hidden[.win|.fail]
│  └─ div.result-panel.glass-panel
│     ├─ h2.result-title + p.result-sub (stats line) + p.result-hint (i18n "host taps to continue")
├─ div#screen-results.tv-screen.hidden
│  └─ div.results-panel.glass-panel
│     ├─ h2.results-title
│     ├─ div.stat-row × N → span.label + span.val   (delivered total, attempts, best time)
│     └─ p.results-hint
└─ div#overlay-pause.tv-overlay.hidden
   ├─ h2.pause-title + p.pause-sub
```

Phase → visibility (hud.js single source):
- connect: #screen-connect
- lobby: #screen-lobby
- countdown: #countdown (+#hud-bar)
- playing: #hud-bar (+#warn-flash element always present, `.on` per state.warn any)
- levelWin/levelFail: #hud-bar + #overlay-result(.win/.fail)
- results: #screen-results
- paused: previous screen + #overlay-pause

## Pad (controller) — html.pad

```
body[.warn][.slot-N]
├─ div.ambient-bg                          (always present, z -1)
├─ div#portrait-blocker                    (CSS-only: shows itself in portrait via media query)
│  ├─ div.rotate-ico (text "📱") + p.rotate-msg
├─ div#screen-join.pad-screen
│  └─ form.join-panel.glass-panel
│     ├─ div.field > label + input#inp-code   (maxlength 4, autocapitalize characters)
│     ├─ div.field > label + input#inp-nick   (maxlength 14)
│     └─ button#btn-join.glass-btn.primary.lg (type submit)
├─ div#screen-lobby-player.pad-screen.hidden
│  ├─ div.avatar-title > span.nick + span.av-name
│  ├─ div.avatar-picker
│  │  ├─ button#btn-av-prev.glass-arrow ("‹")
│  │  ├─ canvas#avatar-canvas             ← three.js mini preview (lobby.js owns; ONE canvas total —
│  │  │                                      host screen reparents this same node)
│  │  └─ button#btn-av-next.glass-arrow ("›")
│  └─ button#btn-ready.glass-btn.lg[.on]  (toggles READY; .on = green)
├─ div#screen-lobby-host.pad-screen.hidden
│  ├─ div.avatar-half                     (same children pattern: .avatar-title, .avatar-picker
│  │                                        with reparented #avatar-canvas + arrows, #btn-ready)
│  └─ div#host-settings.glass-panel
│     ├─ div.set-row > label + div#seg-difficulty.glass-seg > button×3[.on]
│     ├─ div.set-row > label + div#step-players.glass-stepper > button.minus + span.num + button.plus
│     ├─ div.set-row > label + div#step-levels.glass-stepper  > button.minus + span.num + button.plus
│     ├─ div.set-row > label + div#seg-lang.glass-seg > button×2[.on]  (PL / EN)
│     └─ button#btn-start.glass-btn.primary.lg[disabled]
├─ div#screen-pad.pad-screen.hidden       (grid: 6.5rem | 1fr | 7.5rem)
│  ├─ div#zone-throttle
│  │  ├─ div#throttle-hit                 (full-height pointer target, pad.js listens here)
│  │  │  └─ div#throttle.glass-slider.vertical
│  │  │     ├─ div.track-fill             (JS: style.transform = scaleY(v))
│  │  │     └─ div.thumb                  (JS: style.transform = translate(-50%,50%) translateY(-Hpx))
│  │  └─ div#speed-readout.glass-chip     ("42%")
│  ├─ div#zone-center
│  │  ├─ div#status-strip.glass-panel
│  │  │  └─ span#pad-timer[.low] + span.sep + span#pad-score + span.sep + span#pad-speed
│  │  └─ div#switch-grid[.dense]          (.dense when >6 keys; JS builds keys from level switches)
│  │     └─ button.glass-key[data-switch="A"][.flipped]
│  │        ├─ span.letter + span.state   (state text "⬉"/"⬈" or "L"/"R"; .flipped mirrors it)
│  └─ div#zone-right
│     └─ button#btn-horn.glass-btn.primary ("📯" + small (i18n pad.horn))
├─ button#btn-hostmenu.glass-btn.ghost.hidden ("☰", host only, fixed top-right, z 25)
├─ div#hostpanel.glass-modal-backdrop[.open]
│  └─ div.glass-modal
│     ├─ h3.hp-title
│     ├─ button#btn-pause.glass-btn + button#btn-end.glass-btn.danger
│     └─ div.kick-list > div.kick-row × N → span.name + button.glass-btn.sm.danger (data-pid)
├─ div#overlay-paused.pad-overlay.hidden > h2.ov-title + p.ov-sub
└─ div#overlay-disconnected.pad-overlay.hidden > div.spinner + h2.ov-title + p.ov-sub
```

Pad phase routing (main.js/pad.js): join → lobby-player OR lobby-host (by isHost) → screen-pad on countdown/playing. paused ⇒ #overlay-paused; RTDB connection lost ⇒ #overlay-disconnected (wins, z 95).

## Interaction / animation notes

- Buttons: pressed state is pure CSS (:active scale .96, spring). JS may add `.pressed` for programmatic feedback. Never animate width/height/left/top — transform/opacity only.
- Throttle: pointerdown/move on #throttle-hit → v = clamp(1 - (y - rect.top)/rect.height). Update `.track-fill` scaleY and `.thumb` translateY every frame locally; send to RTDB throttled ~8 Hz. No CSS transition on these two (JS sets transform directly).
- Switch keys: tap = optimistic `.flipped` toggle + pushCommand; reconcile with state.switches (set/remove `.flipped` to match). `.state` span flips via scaleX(-1) spring.
- Warning: display sets state.warn → pad.js toggles `body.warn` (red vignette pulse, CSS-only) + navigator.vibrate([120,60,120]).
- Countdown: hud.js sets .count-num text then forces reflow or replaces node to restart `count-pop`.
- Modal: toggle `.open` on #hostpanel (backdrop fade + panel spring, CSS handles it).
- Screen switches: remove `.hidden`, add `.pop-in` on the screen's main panel.
- Timer `.low` class at <15 s on both #hud-timer and #pad-timer.
- Result overlay: set `.win` or `.fail` on #overlay-result (title color changes), fill texts, unhide.

## Z-index map

| z | TV | Pad |
|---|---|---|
| -1 | — | .ambient-bg |
| 0 | #scene-canvas | — |
| 10 | .tv-screen screens | .pad-screen screens |
| 20 | #hud-bar | — |
| 25 | — | #btn-hostmenu |
| 30 | #warn-flash | — |
| 40 | #countdown | — |
| 50 | #overlay-result, #screen-results uses screen layer | — |
| 60 | #overlay-pause | — |
| 70 | — | #hostpanel (`.glass-modal-backdrop` sets `z-index:70` directly in glass.css) |
| 80 | — | body.warn::after vignette |
| 90/95 | — | #overlay-paused / #overlay-disconnected |
| 100 | — | #portrait-blocker |

(DOM order on pad must follow the tree above so untagged fixed elements stack correctly.)

## Canvases owned by three.js / 2D

- `#scene-canvas` (TV) — three.js WebGLRenderer, scene.js. CSS only positions it.
- `#avatar-canvas` (pad lobby) — three.js mini renderer, lobby.js. ONE instance, reparented between player/host screens. Square, sized by CSS (aspect-ratio 1); JS must setSize from clientWidth on resize/reparent.
- `canvas.chip-portrait` (TV HUD chips) — plain 2D context, `paintAvatarPortrait(canvas, i)` from avatars.js. Set width/height attrs to 64.

## Performance guards (binding)

- backdrop-filter elements visible at once must stay <10: on pad game screen that is throttle slider, status strip, speed readout, switch keys share ONE blurred container? No — keys each blur; with 8 keys + 4 others = 12. Therefore: `#switch-grid .glass-key` inherits blur from glass.css — pad.js must add MAX 8 keys, and when a level has >4 switches, add class `.dense`; blur cost on iPhone XR was acceptable in testing target, but if FPS drops, drop-in fix: `#switch-grid .glass-key { backdrop-filter: none; }` override is pre-approved. Everything else animates transform/opacity only.
- Never leave `.pop-in` animating in a rAF-critical moment; it's 0.3 s one-shot.
- No scroll anywhere on pad; if content overflows at 812×375, shrink via rem (html.pad font-size is dvh-based) — do not enable scrolling.
