// main.js — display boot: net + scene + camera + effects + audio + hud, room create/reuse,
// connect screen with QR, then hand off to game orchestrator (Grand Conductors v1)

import { initNet, createRoom } from "../net.js";
import { setLang, getLang } from "../i18n.js";
import { initScene } from "./scene.js";
import { initCamera } from "./camera.js";
import { initEffects } from "./effects.js";
import { initAudio } from "./audio.js";
import * as hud from "./hud.js";
import { startDisplay } from "./game.js";

async function boot() {
  initNet("display");
  initAudio();

  const canvasParent = document.getElementById("scene-canvas") || document.body;
  const sc = initScene(canvasParent);
  const cam = initCamera(sc);
  const fx = initEffects(sc.scene);

  const hudRoot = document.getElementById("hud-root") || document.body;
  hud.initHud(hudRoot);

  const params = new URLSearchParams(location.search);
  let code = params.get("room");
  if (!code) {
    const r = await createRoom();
    code = r.code;
  }
  code = (code || "").toUpperCase();

  const splash = document.getElementById("boot-splash");
  if (splash) splash.remove();

  const joinUrl = location.origin + location.pathname + "?role=controller&room=" + code;
  hud.setPhase("connect");
  hud.renderConnect(code, joinUrl);

  window.addEventListener("resize", () => sc.resize());

  startDisplay({ code, sc, cam, fx });
}

boot().catch((e) => {
  console.error("display boot failed", e);
  const splash = document.getElementById("boot-splash");
  if (splash) splash.textContent = "Boot error: " + (e && e.message ? e.message : e);
});
