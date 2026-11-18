// Cars: a low-poly model built from boxes (body, cabin, wheels, lights) and
// the arcade driving model every car in the game shares — player cars,
// traffic and police alike. No physics engine: velocity, steering and drag
// on a flat plane, with building and car-car collision handled by callers.

import * as THREE from 'three';
import { CAR_ACCEL, CAR_BRAKE, CAR_REVERSE_ACCEL, CAR_MAX_SPEED, CAR_MAX_REVERSE, CAR_TURN, CAR_DRAG, clamp } from './config.js';
import { pick } from './random.js';

export const CAR_TYPES = {
  sedan: { length: 4.4, width: 1.9, accel: 1.0, top: 1.0, color: 0xc23b2e },
  coupe: { length: 4.1, width: 1.85, accel: 1.15, top: 1.12, color: 0x2e6fc2 },
  taxi: { length: 4.4, width: 1.9, accel: 0.95, top: 0.95, color: 0xe8b93b },
  van: { length: 5.2, width: 2.1, accel: 0.8, top: 0.85, color: 0x7a7f85 },
  sport: { length: 4.2, width: 1.95, accel: 1.35, top: 1.25, color: 0xd81e5b },
  police: { length: 4.5, width: 1.95, accel: 1.2, top: 1.15, color: 0x1a1d22 },
};

const PAINT_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8b93b, 0x3a9e5f, 0x8a4fc2, 0xd8d8d8, 0x22252a, 0xd81e5b];

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

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.82, 0.55, type.length * 0.48), glassMat);
  cabin.position.set(0, 1.1, -type.length * 0.05);
  cabin.castShadow = true;
  group.add(cabin);

  // Headlights and taillights.
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

  // Police light bar.
  if (typeName === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4), darkMat);
    bar.position.set(0, 1.5, -type.length * 0.05);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 }));
    red.position.set(-0.28, 1.5, -type.length * 0.05);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1 }));
    blue.position.set(0.28, 1.5, -type.length * 0.05);
    group.add(blue);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx * (type.width / 2 - 0.1), 0.36, wz * (type.length / 2 - 0.75));
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  group.userData.type = type;
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
