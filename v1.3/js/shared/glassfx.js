// glassfx.js — reactive Liquid Glass sheen: sets --gx/--gy on :root from pointer (TV) or device tilt (pad).
// Smoothing is done by a GPU-composited CSS transition on the registered @property (see glass.css), so it
// stays fluid even when rAF is throttled (backgrounded tab) (Grand Conductors v1)

export function initGlassSheen() {
  const root = document.documentElement;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function set(x, y) {
    root.style.setProperty("--gx", clamp(x, -10, 110).toFixed(1) + "%");
    root.style.setProperty("--gy", clamp(y, -10, 110).toFixed(1) + "%");
  }

  window.addEventListener(
    "pointermove",
    (e) => set((e.clientX / Math.max(1, window.innerWidth)) * 100, (e.clientY / Math.max(1, window.innerHeight)) * 100),
    { passive: true }
  );
  window.addEventListener(
    "deviceorientation",
    (e) => {
      if (e.gamma == null && e.beta == null) return;
      set(50 + clamp((e.gamma || 0) / 45, -1, 1) * 50, clamp(((e.beta || 0) - 20) / 55, 0, 1) * 100);
    },
    { passive: true }
  );
}
