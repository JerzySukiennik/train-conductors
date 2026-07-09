# 🚂 Grand Conductors

A Jackbox-style co-op party game. The **TV / laptop** is the shared game screen; **phones are the controllers**. 1–3 players run parallel low-poly trains across a bright island, toggling shared track switches, honking at sheep, and delivering color-matched passengers before the timer runs out — without crashing into each other or the freight trains.

Built with vanilla HTML/CSS/JS (ES modules, no build step), three.js for the 3D world, Kenney CC0 models, and Firebase Realtime Database for phone↔TV sync. UI in Liquid Glass style. PL/EN.

## Play

1. Open the **TV screen** on a laptop/big screen: it shows a big QR code and a 4-letter room code.
2. The **first phone** to scan the QR (or enter the code) becomes the **host** (station master).
3. Everyone else joins with the same code. Pick a nickname, choose one of 6 conductor avatars, hit **Ready**.
4. The host sets difficulty, number of players (1–3), number of levels (1–5) and language, then presses **Start**.
5. Hold your phone **landscape**: left = throttle, center = shared switch letters (A/B/C…), right = horn.
   Cooperate out loud — anyone can flip any switch, so call your moves!

Live: https://jerzysukiennik.github.io/train-conductors/

## Structure

- `v1/index.html` — single entry point, role router (`?role=display|controller&room=CODE`)
- `v1/css/` — `glass.css` (Liquid Glass system), `tv.css`, `pad.css`
- `v1/js/display/` — TV: scene, track, levels, trains, game rules, hud, camera, audio, effects
- `v1/js/controller/` — phone: join, lobby (3D avatar picker), pad, host panel
- `v1/js/shared/avatars.js` — 6 procedural low-poly conductor characters
- `v1/assets/models/` — Kenney CC0 trains / nature / structures (self-hosted)

## Credits

- 3D models: [Kenney](https://kenney.nl) (CC0)
- Sound & music: [Mixkit](https://mixkit.co) (Free License)
