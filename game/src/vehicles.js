// Cars: a low-poly model built from boxes (body, cabin, wheels, lights) and
// the arcade driving model every car in the game shares — player cars,
// traffic and police alike. No physics engine: velocity, steering and drag
// on a flat plane, with building and car-car collision handled by callers.

import * as THREE from 'three';
import { CAR_ACCEL, CAR_BRAKE, CAR_REVERSE_ACCEL, CAR_MAX_SPEED, CAR_MAX_REVERSE, CAR_TURN, CAR_DRAG, clamp } from './config.js';
import { pick } from './random.js';

export const CAR_TYPES = {
  sedan: { length: 4.4, width: 1.9, accel: 1.0, top: 1.0, color: 0xc23b2e, label: 'Solmar Sedan' },
  coupe: { length: 4.1, width: 1.85, accel: 1.15, top: 1.12, color: 0xff3b30, label: 'Vespera GT' },
  taxi: { length: 4.4, width: 1.9, accel: 0.95, top: 0.95, color: 0xe8b93b, label: 'Taksi Kuning' },
  van: { length: 5.2, width: 2.1, accel: 0.8, top: 0.85, color: 0x7a7f85, label: 'Van Kargo' },
  sport: { length: 4.2, width: 1.95, accel: 1.35, top: 1.25, color: 0xff2e88, label: 'Vespera GT' },
  muscle: { length: 4.6, width: 2.0, accel: 1.25, top: 1.18, color: 0xff7a1a, label: 'Banteng GT' },
  pickup: { length: 5.0, width: 2.0, accel: 0.9, top: 0.95, color: 0x2ea8a0, label: 'Pikap Pantai' },
  police: { length: 4.5, width: 1.95, accel: 1.2, top: 1.15, color: 0x1a1d22, label: 'SBPD Interceptor' },
};

const PAINT_COLORS = [0xff2e88, 0xff3b30, 0xff7a1a, 0xffe14f, 0x2ec4b6, 0xc23b2e, 0x2e6fc2, 0xe8b93b, 0x3a9e5f, 0x8a4fc2, 0xd8d8d8, 0x22252a];

function makeDoorTextTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 128, 48);
  g.font = '900 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#101216';
  g.fillText(text, 64, 26);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCarModel(typeName, color, rng) {
  const type = CAR_TYPES[typeName] || CAR_TYPES.sedan;
  const paint = color !== undefined ? color : pick(rng || Math.random, PAINT_COLORS);
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color: paint, shininess: 90, specular: 0x777777 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x18242e, shininess: 120, specular: 0xaaaaaa });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(type.width, 0.62, type.length), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  // Two-tone roof panel over the cabin, plus a dark grille and bumpers so
  // the car reads as a car at a glance, not a painted box.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.84, 0.1, type.length * 0.46), bodyMat);
  roof.position.set(0, 1.42, -type.length * 0.05);
  group.add(roof);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.5, 0.18, 0.06), darkMat);
  grille.position.set(0, 0.52, type.length / 2 + 0.02);
  group.add(grille);
  for (const bz of [type.length / 2 - 0.05, -type.length / 2 + 0.05]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(type.width + 0.06, 0.16, 0.22), darkMat);
    bumper.position.set(0, 0.32, bz);
    group.add(bumper);
  }
  // Side mirrors.
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.2), darkMat);
    mirror.position.set(side * (type.width / 2 + 0.05), 1.05, type.length * 0.12);
    group.add(mirror);
  }
  // Rear spoiler on the fast ones, hood scoop on the muscle car.
  if (typeName === 'sport' || typeName === 'coupe' || typeName === 'muscle') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.9, 0.07, 0.5), darkMat);
    wing.position.set(0, 1.05, -type.length / 2 + 0.15);
    group.add(wing);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), darkMat);
      strut.position.set(side * (type.width / 2 - 0.35), 0.92, -type.length / 2 + 0.15);
      group.add(strut);
    }
    // Front splitter and side skirts: the fast cars sit low and wide, so
    // they read as sports cars from the chase cam, not plain boxes.
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.94, 0.12, 0.34), darkMat);
    splitter.position.set(0, 0.2, type.length / 2 + 0.06);
    group.add(splitter);
    for (const side of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, type.length * 0.62), darkMat);
      skirt.position.set(side * (type.width / 2 + 0.02), 0.24, 0);
      group.add(skirt);
    }
    // Twin exhaust tips at the rear.
    const exhaustGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.22, 8);
    exhaustGeo.rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      const tip = new THREE.Mesh(exhaustGeo, darkMat);
      tip.position.set(side * (type.width / 2 - 0.5), 0.3, -type.length / 2 - 0.06);
      group.add(tip);
    }
    // Roof antenna fin on the hero car.
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.4), darkMat);
    fin.position.set(0, 1.56, -type.length * 0.22);
    group.add(fin);
    // Two-tone white roof: the hero car reads bright from behind and
    // above, not as a dark slab.
    const whiteRoof = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.88, 0.06, type.length * 0.44), new THREE.MeshLambertMaterial({ color: 0xf2f2ee }));
    whiteRoof.position.set(0, 1.5, -type.length * 0.05);
    group.add(whiteRoof);
    // Rear light strip: a glowing bar across the back, so the car reads
    // from behind at dusk.
    const stripMat = new THREE.MeshLambertMaterial({ color: 0xff5e8a, emissive: 0xff2e88, emissiveIntensity: 1.4 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.9, 0.14, 0.06), stripMat);
    strip.position.set(0, 0.62, -type.length / 2 - 0.01);
    group.add(strip);
  }
  if (typeName === 'muscle') {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.9), darkMat);
    scoop.position.set(0, 0.92, type.length * 0.16);
    group.add(scoop);
  }
  // Pickup bed instead of a closed cabin.
  if (typeName === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.86, 0.3, type.length * 0.32), darkMat);
    bed.position.set(0, 0.95, -type.length * 0.28);
    group.add(bed);
  }

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.82, 0.55, type.length * 0.48), glassMat);
  cabin.position.set(0, 1.1, -type.length * 0.05);
  cabin.castShadow = true;
  group.add(cabin);

  // Headlights and taillights. The materials are kept on userData so the
  // game can glow them at sunset and flash the brake lights.
  const lightGeo = new THREE.BoxGeometry(0.34, 0.16, 0.08);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.7 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0xaa1111, emissiveIntensity: 0.7 });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(lightGeo, headMat);
    head.position.set(side * (type.width / 2 - 0.3), 0.62, type.length / 2);
    group.add(head);
    const tail = new THREE.Mesh(lightGeo, tailMat);
    tail.position.set(side * (type.width / 2 - 0.3), 0.62, -type.length / 2);
    group.add(tail);
  }

  // Police light bar, two-tone doors and push bar.
  let lightBar = null;
  if (typeName === 'police') {
    // White door panels over the black body, with SBPD on the side.
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, type.length * 0.42), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      door.position.set(side * (type.width / 2 + 0.01), 0.6, 0);
      group.add(door);
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.56),
        new THREE.MeshBasicMaterial({ map: makeDoorTextTexture('SBPD'), transparent: true }),
      );
      decal.position.set(side * (type.width / 2 + 0.04), 0.62, 0);
      decal.rotation.y = side * Math.PI / 2;
      group.add(decal);
    }
    const pushBar = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.7, 0.3, 0.14), darkMat);
    pushBar.position.set(0, 0.5, type.length / 2 + 0.12);
    group.add(pushBar);
    // White roof panel: the black-and-white livery reads from behind and
    // above, so a police car is never just a black box.
    const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.88, 0.06, type.length * 0.5), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    roofPanel.position.set(0, 1.5, -type.length * 0.05);
    group.add(roofPanel);
    // Oversized light bar: the red/blue flash has to read from 60 m away.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.46), darkMat);
    bar.position.set(0, 1.56, -type.length * 0.05);
    group.add(bar);
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1.6 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1.6 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 0.48), redMat);
    red.position.set(-0.38, 1.56, -type.length * 0.05);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 0.48), blueMat);
    blue.position.set(0.38, 1.56, -type.length * 0.05);
    group.add(blue);
    lightBar = { redMat, blueMat };
  }

  // Wheels with light hubcaps, big enough to read from the chase cam —
  // chunky tyres, not hidden discs under the body.
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc2 });
  const wheels = [];
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx * (type.width / 2 - 0.08), 0.42, wz * (type.length / 2 - 0.75));
    wheel.castShadow = true;
    group.add(wheel);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.position.copy(wheel.position);
    group.add(hub);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  group.userData.type = type;
  group.userData.headMat = headMat;
  group.userData.tailMat = tailMat;
  group.userData.lightBar = lightBar;
  group.userData.setLights = (level) => {
    headMat.emissiveIntensity = 0.7 + level * 1.6;
  };
  group.userData.setBraking = (on) => {
    tailMat.emissiveIntensity = on ? 2.6 : 0.7;
  };
  return group;
}

// Arcade car: position on the plane, heading, signed forward speed.
export class Car {
  constructor(model, typeName) {
    this.model = model;
    this.type = CAR_TYPES[typeName] || CAR_TYPES.sedan;
    this.typeName = typeName;
    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.parked = false;
    this.driver = null; // 'player' | 'traffic' | 'police' | null
    this.health = 100;
  }

  get length() {
    return this.type.length;
  }

  get width() {
    return this.type.width;
  }

  syncModel() {
    this.model.position.set(this.x, 0, this.z);
    this.model.rotation.y = this.heading;
    const spin = this.speed * 0.016 * 2.4;
    for (const wheel of this.model.userData.wheels) wheel.rotation.x += spin;
  }

  // Headlight glow follows the time of day (traffic calls this).
  setLights(level) {
    if (this.model.userData.setLights) this.model.userData.setLights(level);
  }

  // Brake lights flare while the brakes are on.
  setBraking(on) {
    if (this.model.userData.setBraking) this.model.userData.setBraking(on);
  }

  // Drive with arcade controls: throttle -1..1, steer -1..1, handbrake bool.
  drive(dt, throttle, steer, handbrake) {
    const top = CAR_MAX_SPEED * this.type.top;
    if (throttle > 0) this.speed += CAR_ACCEL * this.type.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= CAR_BRAKE * dt;
      else this.speed += CAR_REVERSE_ACCEL * throttle * dt;
    }
    if (handbrake) this.speed *= Math.max(0, 1 - 3.2 * dt);
    // Drag and clamp.
    this.speed -= this.speed * CAR_DRAG * dt;
    this.speed = clamp(this.speed, -CAR_MAX_REVERSE, top);
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    // Steering bites harder the faster the car goes, up to a point.
    const steerFactor = clamp(Math.abs(this.speed) / 12, 0, 1);
    this.heading += steer * CAR_TURN * steerFactor * Math.sign(this.speed) * dt;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.syncModel();
  }

  place(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.syncModel();
  }
}
