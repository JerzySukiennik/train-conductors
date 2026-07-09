// effects.js — Grand Conductors TV visual effects toolkit (three.js).
// Cartoon explosion starbursts, smoke puffs, pickup sparkles, confetti,
// ring pulses. All effects live in one group, advanced via fx.update(dt),
// auto-disposed on end. No shadows, additive where it pops.

import * as THREE from "three";

const _v1 = new THREE.Vector3();
const GRAVITY = -14;

// ---------------------------------------------------------------------------
// Shared geometry/material helpers
// ---------------------------------------------------------------------------

function makeStarGeometry(points, rOuter, rInner) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = (i % 2 === 0 ? rOuter : rInner) * (0.8 + Math.random() * 0.4);
    const a = (i / (points * 2)) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function makeTextSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  g.font = "bold 44px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 8;
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.strokeText(text, 64, 34);
  g.fillStyle = color;
  g.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.8, 1);
  return sprite;
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
  });
}

// ---------------------------------------------------------------------------
// Effect base — each effect is { group, life, ttl, parts, update(dt) }
// ---------------------------------------------------------------------------

export function initEffects(scene) {
  const root = new THREE.Group();
  root.name = "fx-root";
  scene.add(root);

  const live = [];

  function spawn(effect) {
    root.add(effect.group);
    live.push(effect);
    return effect;
  }

  function kill(effect) {
    root.remove(effect.group);
    disposeObject(effect.group);
  }

  const fx = {
    root,

    // ------------------------------------------------------------------ boom
    explosion(pos) {
      const group = new THREE.Group();
      group.position.copy(pos);

      // white flash plane
      const flash = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 6),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      flash.rotation.x = -Math.PI / 2;
      flash.position.y = 0.15;
      group.add(flash);

      // 2-3 star-shaped burst polygons
      const stars = [];
      const starCount = 2 + Math.floor(Math.random() * 2);
      const starColors = [0xffe13a, 0xff8c1a, 0xffd23a];
      for (let i = 0; i < starCount; i++) {
        const geo = makeStarGeometry(
          6 + Math.floor(Math.random() * 3),
          1.6 - i * 0.3,
          0.7 - i * 0.12
        );
        const mat = new THREE.MeshBasicMaterial({
          color: starColors[i % starColors.length],
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.set(
          Math.random() * 0.6 - 0.3,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );
        mesh.position.y = 0.5 + i * 0.15;
        mesh.userData.spin = (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2);
        group.add(mesh);
        stars.push(mesh);
      }

      // debris chunks with gravity arcs
      const debris = [];
      const debrisGeo = new THREE.IcosahedronGeometry(0.16, 0);
      const debrisMat = new THREE.MeshBasicMaterial({ color: 0x777777 });
      const n = 8 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(
          i === 0 ? debrisGeo : debrisGeo.clone(),
          i === 0 ? debrisMat : debrisMat.clone()
        );
        const s = 0.6 + Math.random() * 1.2;
        m.scale.setScalar(s);
        m.position.set(0, 0.4, 0);
        m.userData.vel = new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          4 + Math.random() * 6,
          (Math.random() - 0.5) * 8
        );
        m.userData.spin = new THREE.Vector3(
          Math.random() * 8 - 4,
          Math.random() * 8 - 4,
          Math.random() * 8 - 4
        );
        group.add(m);
        debris.push(m);
      }

      return spawn({
        group,
        life: 0,
        ttl: 1.5,
        update(dt) {
          this.life += dt;
          const t = this.life;
          // flash: instant, gone in 0.12s
          if (flash.material.opacity > 0) {
            flash.material.opacity = Math.max(0, 0.9 - t * 8);
            flash.scale.setScalar(1 + t * 10);
          }
          // stars: scale up + spin + fade over ~0.9s
          const st = Math.min(1, t / 0.9);
          for (const s of stars) {
            s.scale.setScalar(0.3 + st * 3.2);
            s.rotation.z += s.userData.spin * dt;
            s.material.opacity = 0.95 * (1 - st * st);
            s.visible = st < 1;
          }
          // debris: gravity arcs
          for (const d of debris) {
            d.userData.vel.y += GRAVITY * dt;
            _v1.copy(d.userData.vel).multiplyScalar(dt);
            d.position.add(_v1);
            d.rotation.x += d.userData.spin.x * dt;
            d.rotation.y += d.userData.spin.y * dt;
            if (d.position.y < -1) d.visible = false;
          }
          return this.life < this.ttl;
        },
      });
    },

    // ----------------------------------------------------------- smoke puffs
    smokePuffs(pos, n = 6) {
      const group = new THREE.Group();
      group.position.copy(pos);
      const puffs = [];
      const baseGeo = new THREE.DodecahedronGeometry(0.35, 0);
      for (let i = 0; i < n; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0, 0, 0.55 + Math.random() * 0.2),
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        });
        const m = new THREE.Mesh(i === 0 ? baseGeo : baseGeo.clone(), mat);
        m.position.set(
          (Math.random() - 0.5) * 1.2,
          Math.random() * 0.5,
          (Math.random() - 0.5) * 1.2
        );
        m.scale.setScalar(0.5 + Math.random() * 0.7);
        m.userData.rise = 0.8 + Math.random() * 1.2;
        m.userData.grow = 0.8 + Math.random() * 0.8;
        m.userData.delay = Math.random() * 0.25;
        group.add(m);
        puffs.push(m);
      }
      return spawn({
        group,
        life: 0,
        ttl: 1.8,
        update(dt) {
          this.life += dt;
          for (const p of puffs) {
            const t = Math.max(0, this.life - p.userData.delay);
            if (t <= 0) continue;
            p.position.y += p.userData.rise * dt;
            p.scale.addScalar(p.userData.grow * dt);
            p.rotation.y += dt * 0.6;
            p.material.opacity = Math.max(0, 0.8 * (1 - t / 1.5));
          }
          return this.life < this.ttl;
        },
      });
    },

    // -------------------------------------------------------- pickup sparkle
    pickupSparkle(pos, color = 0xffffff) {
      const group = new THREE.Group();
      group.position.copy(pos);
      const sparks = [];
      const geo = new THREE.TetrahedronGeometry(0.12, 0);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(i === 0 ? geo : geo.clone(), i === 0 ? mat : mat.clone());
        const a = (i / 6) * Math.PI * 2;
        m.userData.vel = new THREE.Vector3(
          Math.cos(a) * (1.5 + Math.random()),
          2 + Math.random() * 1.5,
          Math.sin(a) * (1.5 + Math.random())
        );
        group.add(m);
        sparks.push(m);
      }
      const label = makeTextSprite(
        "+1",
        "#" + new THREE.Color(color).getHexString()
      );
      label.position.y = 0.6;
      group.add(label);

      return spawn({
        group,
        life: 0,
        ttl: 1.0,
        update(dt) {
          this.life += dt;
          const t = this.life;
          for (const s of sparks) {
            s.userData.vel.y += GRAVITY * 0.5 * dt;
            _v1.copy(s.userData.vel).multiplyScalar(dt);
            s.position.add(_v1);
            s.rotation.x += 6 * dt;
            s.rotation.y += 5 * dt;
            s.material.opacity = Math.max(0, 1 - t * 1.4);
          }
          label.position.y += 1.4 * dt;
          label.material.opacity = Math.max(0, 1 - t * 1.2);
          return this.life < this.ttl;
        },
      });
    },

    // -------------------------------------------------------------- confetti
    confetti(center, n = 80) {
      const group = new THREE.Group();
      group.position.copy(center);
      const colors = [0xff4d4d, 0x4d8bff, 0xffe13a, 0x4dff88, 0xff4df0, 0xffffff];
      const pieces = [];
      const geo = new THREE.PlaneGeometry(0.16, 0.24);
      for (let i = 0; i < n; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: colors[i % colors.length],
          transparent: true,
          opacity: 1,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const m = new THREE.Mesh(i === 0 ? geo : geo.clone(), mat);
        m.position.set(
          (Math.random() - 0.5) * 8,
          3 + Math.random() * 5,
          (Math.random() - 0.5) * 8
        );
        m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        m.userData.fall = 1.6 + Math.random() * 1.6;
        m.userData.drift = (Math.random() - 0.5) * 1.2;
        m.userData.flutter = 2 + Math.random() * 5;
        m.userData.phase = Math.random() * Math.PI * 2;
        group.add(m);
        pieces.push(m);
      }
      return spawn({
        group,
        life: 0,
        ttl: 2.5,
        update(dt) {
          this.life += dt;
          const t = this.life;
          for (const p of pieces) {
            p.position.y -= p.userData.fall * dt;
            p.position.x +=
              (p.userData.drift + Math.sin(t * p.userData.flutter + p.userData.phase)) *
              dt;
            p.rotation.x += p.userData.flutter * dt;
            p.rotation.z += p.userData.flutter * 0.6 * dt;
            if (t > 2.0) p.material.opacity = Math.max(0, 1 - (t - 2.0) * 2);
          }
          return this.life < this.ttl;
        },
      });
    },

    // ------------------------------------------------------------ ring pulse
    ringPulse(pos, color = 0xffe13a) {
      const group = new THREE.Group();
      group.position.copy(pos);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1.0, 32),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      group.add(ring);
      return spawn({
        group,
        life: 0,
        ttl: 0.7,
        update(dt) {
          this.life += dt;
          const t = this.life / this.ttl;
          ring.scale.setScalar(1 + t * 3.5);
          ring.material.opacity = 0.9 * (1 - t);
          return this.life < this.ttl;
        },
      });
    },

    // ----------------------------------------------------------- update loop
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i];
        if (!e.update(dt)) {
          kill(e);
          live[i] = live[live.length - 1];
          live.pop();
        }
      }
    },

    // ------------------------------------------------------------ teardown
    dispose() {
      for (const e of live) kill(e);
      live.length = 0;
      scene.remove(root);
    },
  };

  return fx;
}
