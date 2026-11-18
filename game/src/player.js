// Dani Reyes on foot: a low-poly character (jacket, head, legs that swing
// when walking) with third-person movement, jumping and a follow camera that
// orbits with the mouse drag. The camera lives here because it follows the
// player wherever they are — on foot or in a car.

import * as THREE from 'three';
import { WALK_SPEED, RUN_SPEED, JUMP_SPEED, GRAVITY, PLAYER_RADIUS, CAMERA_DISTANCE, CAMERA_HEIGHT, CAMERA_CAR_DISTANCE, CAMERA_CAR_HEIGHT, clamp, angleLerp } from './config.js';

// One helper for every body part: a box mesh, positioned, optionally
// casting a shadow, with its pivot translated so limbs swing from the hip
// or shoulder instead of their centre.
// Shared part geometries: dozens of characters (player, pedestrians,
// cops, enemies) are built from the same few boxes — one geometry per
// size/pivot, not one per body part per character.
const partGeoCache = new Map();
function part(w, h, d, material, x, y, z, pivotY) {
  const key = `${w}|${h}|${d}|${pivotY ?? ''}`;
  let geo = partGeoCache.get(key);
  if (!geo) {
    geo = new THREE.BoxGeometry(w, h, d);
    if (pivotY !== undefined) geo.translate(0, pivotY, 0);
    partGeoCache.set(key, geo);
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function createPlayerCharacter() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5f });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e5f8a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1c1410 });

  const torso = part(0.62, 0.72, 0.34, jacket, 0, 1.18, 0);
  group.add(torso);
  const head = part(0.36, 0.38, 0.34, skin, 0, 1.75, 0);
  group.add(head);
  const hairTop = part(0.38, 0.12, 0.36, hair, 0, 1.97, 0);
  group.add(hairTop);

  const leftLeg = part(0.24, 0.8, 0.26, pants, -0.16, 0.82, 0, -0.4);
  group.add(leftLeg);
  const rightLeg = part(0.24, 0.8, 0.26, pants, 0.16, 0.82, 0, -0.4);
  group.add(rightLeg);
  const leftArm = part(0.2, 0.66, 0.22, jacket, -0.42, 1.5, 0, -0.33);
  group.add(leftArm);
  const rightArm = part(0.2, 0.66, 0.22, jacket, 0.42, 1.5, 0, -0.33);
  group.add(rightArm);

  // Pistol, shown only while the pistol is equipped.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.34), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.42, 1.18, 0.2);
  gun.visible = false;
  group.add(gun);

  group.userData = { leftLeg, rightLeg, leftArm, rightArm, gun };
  return group;
}

export function createPlayer(scene) {
  const group = createPlayerCharacter();
  scene.add(group);
  return {
    group,
    x: 0,
    z: 0,
    y: 0, // height above the ground (jumping)
    vy: 0,
    heading: 0,
    moving: false,
    walkPhase: 0,
    health: 100,
    armor: 0, // mission reward: absorbs damage before health does
    weapon: 'fists', // 'fists' | 'pistol'
    ammo: 24,
    inCar: null,
    // Camera orbit, in radians around the player (or the car).
    cameraYaw: Math.PI,
    cameraPitch: 0.32,

    place(x, z, heading) {
      this.x = x;
      this.z = z;
      this.y = 0;
      this.vy = 0;
      this.heading = heading;
      this.syncModel();
    },

    syncModel() {
      this.group.position.set(this.x, this.y, this.z);
      this.group.rotation.y = this.heading;
      this.group.userData.gun.visible = this.weapon === 'pistol' && !this.inCar;
    },

    // Move on foot: forward/strafe are -1..1 in camera space.
    step(dt, move, cameraYaw, resolveCircle) {
      const speed = move.run ? RUN_SPEED : WALK_SPEED;
      // Camera-relative axes: forward is (sin yaw, cos yaw), right is
      // (cos yaw, -sin yaw).
      const fx = Math.sin(cameraYaw);
      const fz = Math.cos(cameraYaw);
      const rx = Math.cos(cameraYaw);
      const rz = -Math.sin(cameraYaw);
      let mx = fx * move.forward + rx * move.strafe;
      let mz = fz * move.forward + rz * move.strafe;
      const len = Math.hypot(mx, mz);
      this.moving = len > 0.01;
      if (this.moving) {
        mx /= len;
        mz /= len;
        const targetHeading = Math.atan2(mx, mz);
        this.heading = angleLerp(this.heading, targetHeading, Math.min(1, dt * 12));
        const next = resolveCircle(this.x + mx * speed * dt, this.z + mz * speed * dt, PLAYER_RADIUS);
        this.x = next.x;
        this.z = next.z;
        this.walkPhase += dt * speed * 1.6;
      }
      // Jump + gravity.
      if (this.y === 0 && move.jump) this.vy = JUMP_SPEED;
      if (this.y > 0 || this.vy !== 0) {
        this.vy -= GRAVITY * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
        }
      }
      // Walk swing: legs and arms counter-swing.
      const swing = this.moving ? Math.sin(this.walkPhase) * 0.55 : 0;
      this.group.userData.leftLeg.rotation.x = swing;
      this.group.userData.rightLeg.rotation.x = -swing;
      this.group.userData.leftArm.rotation.x = -swing * 0.8;
      this.group.userData.rightArm.rotation.x = swing * 0.8;
      this.syncModel();
    },
  };
}

// Follow camera: behind the focus point, smoothed, drag orbits the yaw and
// tilts the pitch. At high speed in a car the camera shakes a little, so
// fast driving feels fast.
export function updateCamera(camera, focusX, focusY, focusZ, focusHeading, player, dt, dragPixels, dragYPixels) {
  player.cameraYaw += dragPixels * 0.005;
  if (dragYPixels) clampCameraPitch(player, player.cameraPitch + dragYPixels * 0.0025);
  // The camera sits behind the focus: yaw equals the facing direction, so
  // the offset (-sin yaw, -cos yaw) is the opposite of forward. In a car
  // the yaw eases toward the car's heading; on foot it follows the drag.
  const targetYaw = player.inCar ? focusHeading : player.cameraYaw;
  const yaw = angleLerp(player.cameraYaw, targetYaw, Math.min(1, dt * (player.inCar ? 2.2 : 5)));
  player.cameraYaw = yaw;
  const dist = player.inCar ? CAMERA_CAR_DISTANCE : CAMERA_DISTANCE;
  // Pitch tilts the camera: low pitch is a low, cinematic chase cam. In a
  // car the camera sits low and close (GTA-style) so the car fills the
  // lower third of the frame; on foot it stays further back.
  const height = (player.inCar ? CAMERA_CAR_HEIGHT : CAMERA_HEIGHT) * (0.7 + player.cameraPitch * 0.9);
  let cx = focusX - Math.sin(yaw) * dist;
  let cz = focusZ - Math.cos(yaw) * dist;
  let cy = focusY + height;
  // 3/4 chase view: in a car the camera sits off to the car's right-rear,
  // so the frame shows the rear AND the flank — spoiler, rims, side intake
  // — instead of a dead-on rectangle from behind. The lookAt stays on the
  // car, so the car just shifts slightly left in the frame. The offset is
  // wide (2.2 m) on purpose: the reference frames the car from a clear
  // rear 3/4, never dead behind it.
  if (player.inCar) {
    cx += -Math.cos(yaw) * 2.2;
    cz += Math.sin(yaw) * 2.2;
  }
  // Speed shake: a small random jitter at 100+ km/h in a car.
  if (player.inCar && Math.abs(player.inCar.speed) > 28) {
    const jitter = Math.min(0.16, (Math.abs(player.inCar.speed) - 28) * 0.008);
    cx += (Math.random() - 0.5) * jitter;
    cy += (Math.random() - 0.5) * jitter * 0.6;
    cz += (Math.random() - 0.5) * jitter;
  }
  // The camera chases a fast car: at 44 m/s a slow lerp trails metres
  // behind, so the car shrinks in the frame. In a car the follow is much
  // stiffer, and when the camera is far from its target (spawn, teleport,
  // screenshot staging) it snaps instead of chasing for seconds.
  const gap = Math.hypot(cx - camera.position.x, cy - camera.position.y, cz - camera.position.z);
  if (gap > 12) {
    camera.position.set(cx, cy, cz);
  } else {
    const rate = player.inCar ? 16 : 7;
    const k = Math.min(1, dt * rate);
    camera.position.x += (cx - camera.position.x) * k;
    camera.position.y += (cy - camera.position.y) * k;
    camera.position.z += (cz - camera.position.z) * k;
  }
  camera.lookAt(focusX, focusY + (player.inCar ? 1.9 : 1.4), focusZ);
}

// Damage hits armor first, then health — the armor bar in the HUD is real.
export function applyDamage(player, amount) {
  const absorbed = Math.min(player.armor || 0, amount);
  player.armor = (player.armor || 0) - absorbed;
  player.health = clamp(player.health - (amount - absorbed), 0, 100);
}

export function clampCameraPitch(player, value) {
  player.cameraPitch = clamp(value, 0.12, 0.9);
}
