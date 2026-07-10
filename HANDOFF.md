# HANDOFF — Grand Conductors (Train-Conductors)

Ten plik pozwala dowolnemu Claude'owi wejść w projekt **na zimno** i kontynuować. Aktualizowany po każdym ukończonym zadaniu (zasada Jurka, 2026-07-10). Ostatnia aktualizacja: **2026-07-10, po v1.3**.

## 1. Co to jest

Impreza typu **Jackbox** w klimacie **"Conduct DELUXE!"** (low-poly kolejka). **TV/laptop = ekran gry** (three.js 3D, jedyne źródło prawdy), **telefony = kontrolery** (poziomo/landscape) przez QR. 1–3 graczy współpracuje: każdy prowadzi **swój** pociąg (przepustnica + klakson), **zwrotnice są wspólne** (każdy może kliknąć każdą, litery A–H), wożą pasażerów dopasowanych kolorem, unikają zderzeń (pociąg-pociąg = katastrofa = restart poziomu). Cel poziomu: dowieźć N pasażerów przed czasem. PL/EN (host ustawia język).

Pełna specyfikacja i WSZYSTKIE decyzje projektowe Jurka: **`Niepotrzebne/SPEC.md`**. Zawsze przeczytaj przed większą zmianą.

## 2. Live / infrastruktura

- **Live:** https://jerzysukiennik.github.io/train-conductors/ (root `index.html` przekierowuje na aktualny `vX.Y/` — teraz **v1.3/**, z zachowaniem query params).
- **Repo:** https://github.com/JerzySukiennik/train-conductors — publiczne, GitHub Pages z `main`/root. Konto GitHub: **JerzySukiennik**.
- **Firebase:** projekt `train-conductors`, **RTDB europe-west1**: `https://train-conductors-default-rtdb.europe-west1.firebasedatabase.app`. Reguły: otwarty read/write **tylko** pod `rooms/*`, reszta zablokowana. Konto: **gzowotesla@gmail.com** (uniwersalne konto Jurka do wszystkiego). Config web SDK jest PUBLICZNY (nie sekret) i siedzi w `v1.X/js/config.js`.
- **Stack:** czysty HTML/CSS/JS, **ES modules z CDN, ZERO builda**. three@0.160.0 (+ `three/addons/`), firebase@10.12.2 (modular), qrcodejs. Fonty Google: **Sniglet** (display/nagłówki) + **DynaPuff** (body) — oba mają polskie znaki.
- **Cel wydajności:** MacBook Pro 16" 2019 (Intel i9 + Radeon 5500M) @ 60fps na TV; iPhone XR Safari na padach.

## 3. Wersjonowanie (TWARDA ZASADA)

- **Każda zmiana = NOWY folder `vX.Y/`.** Skopiuj aktualny folder → nowy, edytuj TAM, zbumpuj `VERSION` w `config.js`, zaktualizuj redirect w **root `index.html`** (`location.replace("vX.Y/"...)` + `<a href>`).
- **Poprzednie foldery są IMMUTABLE** — nigdy nie edytuj `v1/`, `v1.1/` itd. po utworzeniu.
- **Deploy = commit + push na `main`** (Pages sam się przebuduje, ~30-60s). **Deploy tylko na wyraźną komendę Jurka.**
- Historia: `v1` (initial, mapa się nie renderowała), `v1.1` (7 fixów: fonty PL, awatary lobby, join UI, island y=0), `v1.2` (strzałki zwrotnic, kamera fit, **3D podesty lobby**, canvas 2× fix), `v1.3` (**Liquid Glass pass**: reactive sheen + depth blur + edge-light + slot-tint).

## 4. Jak uruchomić i testować lokalnie

**Serwer podglądu:** `python3 -m http.server 8744` w katalogu `Train-Conductors` (jest konfig w `Projects/.claude/launch.json` jako `train-conductors`, port 8744). Potem:
- TV: `http://localhost:8744/v1.3/index.html?role=display` (utworzy pokój, pokaże kod)
- Pad: `http://localhost:8744/v1.3/index.html?role=controller&room=KOD`

**Wstrzykiwanie graczy/akcji przez RTDB REST (curl)** — do testów bez telefonu:
```bash
DB="https://train-conductors-default-rtdb.europe-west1.firebasedatabase.app"; ROOM="TEST"
# lobby z 2 graczami (avatar 0..5, order = slot/kolor 0..2)
curl -s -X PUT "$DB/rooms/$ROOM/meta.json" -d '{"phase":"lobby","hostId":"p_a","createdAt":1,"settings":{"difficulty":"normal","playerCount":3,"levels":3,"lang":"pl"}}'
curl -s -X PUT "$DB/rooms/$ROOM/players.json" -d '{"p_a":{"name":"Jurek","avatar":0,"ready":true,"connected":true,"order":0,"joinedAt":1},"p_b":{"name":"Zosia","avatar":3,"ready":true,"connected":true,"order":1,"joinedAt":2}}'
# start gry (host)
curl -s -X POST "$DB/rooms/$ROOM/commands.json" -d '{"type":"start","pid":"p_a","ts":1}'
# posprzątaj
curl -s -X DELETE "$DB/rooms/$ROOM.json"
```

**GOTCHY podglądu (ważne, oszczędzają godziny):**
1. **Karta w tle DŁAWI rAF ORAZ animacje CSS/@property.** Gra, flyover, odliczanie, reactive sheen — wszystko idzie w slow-motion / zamarza gdy karta nie jest sfokusowana. To **artefakt preview, nie bug** — na realnym (sfokusowanym) TV/telefonie działa płynnie. `preview_screenshot` na chwilę budzi kartę. Do testu logiki 3D: pompuj moduły przez `preview_eval`.
2. **Canvas 2×:** `renderer.setSize(w,h,false)` nie ustawia stylu → canvas wyświetla się w rozmiarze bufora (2×). Ratuje to reguła `#scene-canvas canvas { width/height:100% !important }` w `tv.css`. Jeśli render pokazuje tylko lewy-górny róg → sprawdź czy `canvas.clientWidth == viewport`.
3. **Cache przy edycji IN-PLACE:** przeglądarka cache'uje CSS **i moduły JS** edytowane po pierwszym załadowaniu danego folderu. Weryfikuj świeży kod przez `import("/vX.Y/js/...js?bust="+Date.now())` albo po prostu w nowym folderze wersji (nowe URL-e = zawsze świeże).
4. **Screenshoty 3D bywają zamrożone** — do pomiarów geometrii/stanu używaj `preview_eval` (raycast, projekcje, computed styles) zamiast oka.

## 5. Architektura (pliki w `v1.3/`)

```
index.html            entry + importmap (three/firebase/qrcode) + router ?role&room
css/glass.css         Liquid Glass: tokeny, .glass-panel/.glass-btn/.glass-chip/.glass-slider/
                      .glass-arrow/.glass-key/.glass-modal/.glass-badge/.ambient-bg, @property --gx/--gy sheen
css/tv.css            ekrany TV (connect/lobby/HUD/result/pause) — #scene-canvas fix tutaj
css/pad.css           kontroler landscape (join/lobby/pad/hostpanel), slot-tint
js/config.js          FIREBASE, COLORS(sloty red/blue/yellow), ASSETS{MODELS,SOUNDS,MUSIC}, BALANCE, VERSION
js/i18n.js            t(key,vars)/setLang/getLang; PL+EN symetryczne (94 klucze)
js/net.js             RTDB: createRoom, joinRoom, watchRoom, setPlayer/setInput, pushCommand,
                      consumeCommands, writeMeta/writeState, presence, kickPlayer
js/shared/avatars.js  buildAvatar(i,THREE) — 6 postaci 3D (Classic/Steamer/Signalman/Granny/Tinbot/Cat);
                      buildPodiumAvatar; paintAvatarPortrait(canvas,i) 2D
js/shared/glassfx.js  initGlassSheen — reactive --gx/--gy z pointer(TV)/tilt(pad)
js/display/main.js    boot TV: net+scene+camera+effects+audio+hud+glass, createRoom, connect, → game
js/display/scene.js   świat 3D: renderer/światła/niebo/morze, płaska wyspa (y=0!), buildTrackMesh,
                      scenery instanced (Kenney), stacje proceduralne, znaki zwrotnic + strzałki,
                      crossing, mosty/tunele, buildLobbyPodiums, loadGLB(path,timeout)→null fallback
js/display/track.js   graf toru: buildTrackRuntime (sampler/nextEdge/switchStates), buildTrackMesh, graphSelfTest
js/display/levels.js  LEVELS[5] + BALANCE_TUNED + smoothLevel (fillet zakrętów) + getLevel(i)
js/display/trains.js  initTrains → pociągi gracza (GLB tinted) + wagony + NPC freight + owce + auta +
                      pasażerowie; update(dt)→events (crash/atStation/sheepHit/carCrash/warn/crossingState)
js/display/game.js    ORKIESTRATOR: maszyna faz, reguły pickup/deliver/crash/goal/timer, input→throttle,
                      komendy (switch/start/pause/resume/end/kick/retry/next/playAgain), autopilot,
                      state mirror (2Hz), syncLobby (3D podesty), pętla rAF, onResize
js/display/hud.js     DOM TV: connect, lobby (settings mirror, nazwy), HUD bar, countdown, result, pause, toast
js/display/camera.js  frameLevel (fit całej wyspy przez rzut 8 rogów), frameLobby (character-select),
                      flyover, crashZoom, shake, update, + export onResize-owy reframe
js/display/audio.js   sfx(name)+music() z Mixkit URL, synth fallback przy błędzie
js/display/effects.js initEffects → explosion/smokePuffs/pickupSparkle/confetti/ringPulse
js/controller/main.js boot pad: routing faz, orientation blocker, wake lock, click, vibrate, glass
js/controller/join.js kod pokoju → nick → joinRoom
js/controller/lobby.js picker awatara 3D (mini three) + ready; host: settings + start
js/controller/pad.js  gra: throttle slider, siatka zwrotnic (litery), klakson, pasek statusu, warn vignette
js/controller/hostpanel.js  hamburger: pauza/wznów, zakończ, kick
assets/models/         Kenney CC0 GLB: trains/ nature/ structures/
Niepotrzebne/          SPEC.md (specyfikacja+decyzje), CONTRACT.md (API modułów+schema RTDB+format poziomów+ADDENDUM),
                       UIBRIEF.md (kontrakt DOM per ekran) — CZYTAJ przed zmianami
```

## 6. RTDB schema — `rooms/{KOD}` (skrót; pełne w CONTRACT.md)

- `meta`: `{ hostId, phase, settings{difficulty,playerCount,levels,lang}, level{index,attempt}, createdAt }`
  - phase: `connect → lobby → countdown → playing → levelWin|levelFail → results` (+ `paused`)
- `players/{pid}`: `{ name, avatar 0..5, ready, connected, order 0..2, joinedAt }`
- `input/{pid}`: `{ throttle 0..1, hornTs }`
- `commands` (push, display konsumuje+kasuje): `{ type, pid, switchId?, target? }`
- `state` (display pisze, pady czytają): `{ switches{A..}, hud{timeLeft,delivered,goal,levelIndex}, trains{pid:{speed,wagons,stopped}}, warn{pid:bool} }`
- **Display jest jedynym pisarzem** `meta.phase/level`, `state`. Pady piszą tylko swoje `players/{pid}`, `input/{pid}`, `commands` (wyjątek: host pad pisze `meta/settings`).
- pid = `p_`+8 znaków, w `localStorage gc.pid` (rejoin odzyskuje slot).

## 7. Stan — co działa

Pełny przepływ end-to-end zaimplementowany i wdrożony (v1.3): connect (duże QR) → lobby (**3D podesty z żywymi modelami awatarów**, ustawienia hosta, ready) → start → flyover + odliczanie → gra (prowadzenie, zwrotnice, pasażerowie, owce/NPC, kolizje) → wynik poziomu → następny/retry → wyniki końcowe. Świat renderuje się w stylu trailera (płaska zielona wyspa, tor z podkładami, stacje, pociągi, drzewa/skały, znaki zwrotnic A–H, morze). Liquid Glass UI z reactive sheen. i18n PL/EN symetryczne.

## 8. Do sprawdzenia / TODO (wymaga playtestu na REALNYM sprzęcie — preview dławi)

- **Pełny mecz na laptopie + 2-3 telefonach** — potwierdzić tempo, pickup/deliver pasażerów, kolizje, timing zwrotnic, autopilot przy rozłączeniu.
- **Strzałki zwrotnic** — kierunek naprawiony matematycznie (v1.2), potwierdzić wizualnie w grze.
- **Dźwięki** (Mixkit URL-e) + **muzyka lo-fi** — czy grają, czy fallback syntezowany działa.
- **Balans** poziomów/goali/trudności — Jurek dostroi po playteście.
- Fizyki/scatteru pinów NIE dało się potwierdzić offline (throttling) — tylko przez granie.

## 9. Jak pracować (preferencje Jurka — pełne w vaultcie `~/Downloads/Claude/ClaudeMemory/`)

- **Subagenci = Sonnet** jako default (Fable/Opus w wielu subagentach naraz = natychmiastowy limit sesji — sprawdzone boleśnie w tym projekcie). Topowy model tylko punktowo dla jednej najtrudniejszej roli.
- **Workflow agentowy** (Planner→Coder→Reviewer, prawdziwe subagenty) przy realnym kodzie; solo tylko przy trywialnych/sekwencyjnych rzeczach albo gdy subagenty padną na limicie.
- **Deploy tylko na komendę Jurka.** Sekrety do `.env` (tu config Firebase jest publiczny, więc OK w repo).
- **UI = Liquid Glass** zawsze (`/glassmorphism`).
- **Ten HANDOFF: aktualizuj po każdym ukończonym zadaniu.**
- Rozmowa po polsku, kod/komentarze/commity po angielsku.
