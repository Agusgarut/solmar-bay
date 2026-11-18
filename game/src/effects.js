// Cheap pooled particles: dust puffs, exhaust smoke, muzzle sparks and
// crash debris. One Points cloud per effect kind, recycled in place, so
// effects never allocate during play.

import * as THREE from 'three';

const MAX_PARTICLES = 320;

export function createEffects(scene) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.7,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  const pool = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    pool.push({ alive: false, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 });
  }
  let cursor = 0;

  function spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX_PARTICLES;
    p.alive = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.maxLife = life;
    const index = pool.indexOf(p);
    colors[index * 3] = r;
    colors[index * 3 + 1] = g;
    colors[index * 3 + 2] = b;
  }

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
    },
  };
}
