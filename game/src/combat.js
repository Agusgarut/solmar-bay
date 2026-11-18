// Combat: fists and the pistol, plus the armed enemies missions throw at
// the player. Shots are hitscan with a tracer line; enemies walk toward the
// player and shoot back with visible inaccuracy.

import * as THREE from 'three';
import { clamp, distance2D } from './config.js';
import { createPlayerCharacter, applyDamage } from './player.js';

export function createCombat(scene, rng) {
  const enemies = [];
  const tracers = [];

  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });

  function addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, tracerMat);
    scene.add(line);
    tracers.push({ line, life: 0.08 });
  }

  // Take `amount` off an enemy: stagger, bleed, and die at 0 health.
  function damageEnemy(enemy, amount, x, y, z, ctx) {
    enemy.health -= amount;
    enemy.stagger = 0.45;
    if (ctx) ctx.effects.blood(x, y, z);
    if (enemy.health <= 0) {
      enemy.dead = true;
      scene.remove(enemy.model);
      const i = enemies.indexOf(enemy);
      if (i >= 0) enemies.splice(i, 1);
      return true;
    }
    return false;
  }

  function spawnEnemy(x, z) {
    const model = createPlayerCharacter();
    // Red jacket marks a hostile.
    model.children.forEach((child) => {
      if (child.material && child.material.color && child.material.color.getHex() === 0x2e5f8a) {
        child.material = new THREE.MeshLambertMaterial({ color: 0x8a2e2e });
      }
    });
    model.userData.gun.visible = true;
    scene.add(model);
    const enemy = {
      model, x, z, heading: 0, health: 60, shootTimer: 1 + rng() * 1.5, walkPhase: 0, dead: false,
      stagger: 0, // seconds the enemy is stunned after being hit
    };
    model.position.set(x, 0, z);
    enemies.push(enemy);
    return enemy;
  }

  function removeEnemy(enemy) {
    scene.remove(enemy.model);
    const i = enemies.indexOf(enemy);
    if (i >= 0) enemies.splice(i, 1);
  }

  function clearAll() {
    for (const enemy of [...enemies]) removeEnemy(enemy);
  }

  // The closest live enemy near the aim ray from `from` along `dir`
  // (2..90 m out, within 2.2 m of the ray), or null.
  function enemyOnRay(from, dir) {
    let best = null;
    let bestD = Infinity;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const to = new THREE.Vector3(enemy.x - from.x, 1.2 - from.y, enemy.z - from.z);
      const along = to.dot(dir);
      if (along < 2 || along > 90) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 2.2 && along < bestD) {
        bestD = along;
        best = enemy;
      }
    }
    return best;
  }

  return {
    enemies,
    spawnEnemy,
    clearAll,

    // Melee: hit anything hostile or pedestrian within 2.4 m in front.
    punch(ctx) {
      const player = ctx.player;
      const fx = Math.sin(player.heading);
      const fz = Math.cos(player.heading);
      let hitSomething = false;
      const targets = [...enemies, ...ctx.peds.peds];
      for (const target of targets) {
        if (target.dead) continue;
        const dx = target.x - player.x;
        const dz = target.z - player.z;
        const d = Math.hypot(dx, dz);
        // In front of the player (dot product with the facing vector).
        if (d < 2.4 && (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.3) {
          hitSomething = true;
          ctx.effects.sparks(target.x, 1.2, target.z);
          if (target.health !== undefined) {
            damageEnemy(target, 25, target.x, 1, target.z, ctx);
          } else {
            // A pedestrian: knocked down, flees when they get up.
            target.dead = true;
            scene.remove(target.model);
            ctx.peds.scare(player.x, player.z, 30);
            ctx.police.addWanted(1);
          }
        }
      }
      return hitSomething;
    },

    // Hitscan pistol shot toward the camera's aim point.
    shoot(ctx) {
      const player = ctx.player;
      if (player.ammo <= 0) return false;
      player.ammo -= 1;
      const camera = ctx.camera;
      const from = new THREE.Vector3(player.x, player.y + 1.5, player.z);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const best = enemyOnRay(from, dir);
      const end = best
        ? new THREE.Vector3(best.x, 1.2, best.z)
        : from.clone().addScaledVector(dir, 70);
      addTracer(from, end);
      ctx.effects.muzzle(from.x + dir.x * 0.8, from.y, from.z + dir.z * 0.8);
      ctx.effects.sparks(end.x, end.y, end.z);
      if (best) damageEnemy(best, 34, best.x, 1.2, best.z, ctx);
      ctx.peds.scare(player.x, player.z, 45);
      ctx.police.addWanted(1);
      return true;
    },

    update(dt, ctx) {
      const player = ctx.player;
      for (const enemy of [...enemies]) {
        if (enemy.dead) continue;
        // A staggered enemy stands still and does not shoot.
        if (enemy.stagger > 0) {
          enemy.stagger -= dt;
          const swing = Math.sin(enemy.walkPhase) * 0.5;
          enemy.model.userData.leftLeg.rotation.x = swing;
          enemy.model.userData.rightLeg.rotation.x = -swing;
          enemy.model.position.set(enemy.x, 0, enemy.z);
          enemy.model.rotation.y = enemy.heading;
          continue;
        }
        const d = distance2D(enemy.x, enemy.z, player.x, player.z);
        const targetHeading = Math.atan2(player.x - enemy.x, player.z - enemy.z);
        enemy.heading = targetHeading;
        if (d > 14) {
          // Close the distance.
          enemy.x += Math.sin(enemy.heading) * 5 * dt;
          enemy.z += Math.cos(enemy.heading) * 5 * dt;
          const fixed = ctx.city.resolveCircle(enemy.x, enemy.z, 0.55);
          enemy.x = fixed.x;
          enemy.z = fixed.z;
          enemy.walkPhase += dt * 10;
        } else {
          enemy.shootTimer -= dt;
          if (enemy.shootTimer <= 0) {
            enemy.shootTimer = 1.2 + rng() * 1.2;
            // Inaccurate return fire: hits about a third of the time, and
            // more often the hotter the wanted level is.
            const from = new THREE.Vector3(enemy.x, 1.4, enemy.z);
            const to = new THREE.Vector3(player.x, 1.2, player.z);
            addTracer(from, to);
            ctx.effects.muzzle(from.x, from.y, from.z);
            const hitChance = 0.3 + Math.min(0.2, ctx.police.wanted * 0.03);
            if (rng() < hitChance && !player.inCar) {
              applyDamage(player, 9);
              ctx.effects.blood(player.x, 1.2, player.z);
            }
          }
        }
        const swing = Math.sin(enemy.walkPhase) * 0.5;
        enemy.model.userData.leftLeg.rotation.x = swing;
        enemy.model.userData.rightLeg.rotation.x = -swing;
        enemy.model.position.set(enemy.x, 0, enemy.z);
        enemy.model.rotation.y = enemy.heading;
      }
      for (const tracer of [...tracers]) {
        tracer.life -= dt;
        if (tracer.life <= 0) {
          scene.remove(tracer.line);
          const i = tracers.indexOf(tracer);
          if (i >= 0) tracers.splice(i, 1);
        }
      }
    },
  };
}
