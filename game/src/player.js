// Dani Reyes on foot: a low-poly character (jacket, head, legs that swing
// when walking) with third-person movement, jumping and a follow camera that
// orbits with the mouse drag. The camera lives here because it follows the
// player wherever they are — on foot or in a car.

import * as THREE from 'three';
import { WALK_SPEED, RUN_SPEED, JUMP_SPEED, GRAVITY, PLAYER_RADIUS, CAMERA_DISTANCE, CAMERA_HEIGHT, clamp, angleLerp } from './config.js';

export function createPlayerCharacter() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5f });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e5f8a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1c1410 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), jacket);
  torso.position.y = 1.18;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.34), skin);
  head.position.y = 1.75;
  head.castShadow = true;
  group.add(head);

  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), hair);
  hairTop.position.y = 1.97;
  group.add(hairTop);

  const legGeo = new THREE.BoxGeometry(0.24, 0.8, 0.26);
  const leftLeg = new THREE.Mesh(legGeo, pants);
  leftLeg.geometry = legGeo.clone();
  leftLeg.geometry.translate(0, -0.4, 0);
  leftLeg.position.set(-0.16, 0.82, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, pants);
  rightLeg.geometry = legGeo.clone();
  rightLeg.geometry.translate(0, -0.4, 0);
  rightLeg.position.set(0.16, 0.82, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  const armGeo = new THREE.BoxGeometry(0.2, 0.66, 0.22);
  const leftArm = new THREE.Mesh(armGeo, jacket);
  leftArm.geometry = armGeo.clone();
  leftArm.geometry.translate(0, -0.33, 0);
  leftArm.position.set(-0.42, 1.5, 0);
  group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo, jacket);
  rightArm.geometry = armGeo.clone();
  rightArm.geometry.translate(0, -0.33, 0);
  rightArm.position.set(0.42, 1.5, 0);
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
      // Walk swing.
      const swing = this.moving ? Math.sin(this.walkPhase) * 0.55 : 0;
      this.group.userData.leftLeg.rotation.x = swing;
      this.group.userData.rightLeg.rotation.x = -swing;
      this.group.userData.leftArm.rotation.x = -swing * 0.8;
      this.group.userData.rightArm.rotation.x = swing * 0.8;
      this.syncModel();
    },
  };
}

// Follow camera: behind the focus point, smoothed, drag orbits the yaw.
export function updateCamera(camera, focusX, focusY, focusZ, focusHeading, player, dt, dragPixels) {
  player.cameraYaw += dragPixels * 0.005;
  // Camera sits behind the focus: yaw equals the facing direction, so the
  // camera offset (-sin yaw, -cos yaw) is the opposite of forward.
  const targetYaw = player.inCar ? focusHeading : player.cameraYaw;
  const yaw = angleLerp(player.cameraYaw, targetYaw, Math.min(1, dt * (player.inCar ? 2.2 : 5)));
  player.cameraYaw = yaw;
  const dist = player.inCar ? CAMERA_DISTANCE + 3 : CAMERA_DISTANCE;
  const height = player.inCar ? CAMERA_HEIGHT + 1.2 : CAMERA_HEIGHT;
  const cx = focusX - Math.sin(yaw) * dist;
  const cz = focusZ - Math.cos(yaw) * dist;
  const cy = focusY + height;
  camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 7);
  camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 7);
  camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 7);
  camera.lookAt(focusX, focusY + 1.4, focusZ);
}

export function clampCameraPitch(player, value) {
  player.cameraPitch = clamp(value, 0.12, 0.9);
}
