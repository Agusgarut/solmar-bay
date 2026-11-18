// Cheap pooled particles: dust puffs, exhaust smoke, muzzle sparks, crash
// debris and water splashes. One Points cloud per effect kind, recycled in
// place, so effects never allocate during play.

import * as THREE from 'three';

const MAX_PARTICLES = 320;

// Soft round sprite for the points: without an alpha map the points render
// as hard white squares, and a dust trail reads as a row of boxes.
function makeSoftDotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createEffects(scene) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 1.1,
    map: makeSoftDotTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  // Soft dust-trail sprites: billowing clouds behind a fast car, like the
  // new reference's dust — real sprites that grow and fade, never hard
  // squares or boxes. Each sprite has its own material so it can fade
  // independently.
  const DUST_SPRITES = 28;
  const dustTex = makeSoftDotTexture();
  const dustPool = [];
  for (let i = 0; i < DUST_SPRITES; i += 1) {
    const mat = new THREE.SpriteMaterial({ map: dustTex, color: 0xe8dcc8, transparent: true, opacity: 0, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    sprite.position.set(0, -100, 0);
    scene.add(sprite);
    dustPool.push({ sprite, life: 0, maxLife: 1, startScale: 1, growTo: 4, vx: 0, vy: 0, vz: 0 });
  }
  let dustCursor = 0;
  function spawnDust(x, y, z, vx, vy, vz, strength) {
    const d = dustPool[dustCursor];
    dustCursor = (dustCursor + 1) % DUST_SPRITES;
    d.life = 0.9 + Math.random() * 0.4;
    d.maxLife = d.life;
    d.startScale = 2.5 + strength;
    d.growTo = 5 + strength * 2.5 + Math.random();
    d.vx = vx + (Math.random() - 0.5) * 1.5;
    d.vy = vy + Math.random() * 0.6;
    d.vz = vz + (Math.random() - 0.5) * 1.5;
    d.sprite.position.set(x + (Math.random() - 0.5) * 1.6, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 1.6);
    d.sprite.visible = true;
  }

  // Ring buffer: `cursor` walks the pool, so the oldest particle is always
  // the next one recycled — no search, no allocation.
  const pool = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    pool.push({ alive: false, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 });
  }
  let cursor = 0;

  function spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    const index = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    const p = pool[index];
    p.alive = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.maxLife = life;
    colors[index * 3] = r;
    colors[index * 3 + 1] = g;
    colors[index * 3 + 2] = b;
  }

  // A burst of `count` particles from one point, each with a random
  // velocity in a disc of `spread`, a random upward kick up to `up`, and a
  // lifetime jittered around `life`.
  function burst(x, y, z, count, spread, up, life, r, g, b) {
    for (let i = 0; i < count; i += 1) {
      spawn(
        x, y, z,
        (Math.random() - 0.5) * spread,
        Math.random() * up,
        (Math.random() - 0.5) * spread,
        life * (0.6 + Math.random() * 0.7),
        r, g, b,
      );
    }
  }

  return {
    dust(x, y, z) {
      burst(x, y, z, 2, 1.2, 0.8, 0.5, 0.55, 0.5, 0.42);
    },
    smoke(x, y, z) {
      burst(x, y, z, 4, 0.8, 1.6, 1.1, 0.25, 0.25, 0.28);
    },
    sparks(x, y, z) {
      burst(x, y, z, 8, 6, 3, 0.35, 1.0, 0.8, 0.3);
    },
    blood(x, y, z) {
      burst(x, y, z, 6, 2, 1.5, 0.5, 0.7, 0.08, 0.08);
    },
    // Bright muzzle flash at the gun: short-lived, hot yellow-white.
    muzzle(x, y, z) {
      burst(x, y, z, 10, 2.5, 1.2, 0.12, 1.0, 0.85, 0.4);
    },
    // Dark tyre smoke from a handbrake skid: slow, heavy, hangs low.
    skidSmoke(x, y, z) {
      burst(x, y, z, 5, 1.4, 0.5, 0.9, 0.16, 0.16, 0.18);
    },
    // White spray where something hits the water — beach chases.
    splash(x, y, z) {
      burst(x, y, z, 7, 2.2, 2.4, 0.6, 0.85, 0.95, 1.0);
    },
    // Billowing dust trail behind a fast car: three soft sprites per call,
    // fanned across the rear axle (hx, hz is the axle's lateral unit
    // vector), drifting back with the car's motion, growing as they fade.
    dustTrail(x, y, z, vx, vz, strength, hx, hz) {
      const lx = hx || 0;
      const lz = hz || 0;
      spawnDust(x - lx * 0.9, y, z - lz * 0.9, vx, 0.2, vz, strength);
      spawnDust(x, y, z, vx, 0.2, vz, strength);
      spawnDust(x + lx * 0.9, y, z + lz * 0.9, vx, 0.2, vz, strength);
    },
    update(dt) {
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        const p = pool[i];
        if (!p.alive) {
          positions[i * 3 + 1] = -100;
          continue;
        }
        p.life -= dt;
        if (p.life <= 0) {
          p.alive = false;
          positions[i * 3 + 1] = -100;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 1.2 * dt;
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      // Dust sprites: grow as they age, fade out, drift with their
      // velocity and settle — a cloud, not a puff that pops out.
      for (const d of dustPool) {
        if (d.life <= 0) continue;
        d.life -= dt;
        if (d.life <= 0) {
          d.sprite.visible = false;
          d.sprite.material.opacity = 0;
          continue;
        }
        const age = 1 - d.life / d.maxLife;
        const s = d.startScale + (d.growTo - d.startScale) * age;
        d.sprite.scale.set(s, s, 1);
        d.sprite.material.opacity = 0.65 * (1 - age) * Math.min(1, age * 6 + 0.3);
        d.sprite.position.x += d.vx * dt;
        d.sprite.position.y += d.vy * dt;
        d.sprite.position.z += d.vz * dt;
        d.vy *= (1 - dt * 1.5);
      }
    },
  };
}
