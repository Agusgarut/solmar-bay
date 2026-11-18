// Traffic: NPC cars that loop around the road grid, plus parked cars the
// player can steal. A traffic car picks a road, drives along it, turns at a
// random intersection, and slows when another car is right ahead.

import * as THREE from 'three';
import { ROAD_POSITIONS, ROAD_WIDTH, WORLD_HALF, TRAFFIC_CARS, PARKED_CARS, clamp, distance2D } from './config.js';
import { createCarModel, Car } from './vehicles.js';
import { pick, range, weighted } from './random.js';

// Traffic mix by weight: sedans and taxis dominate, sports are rare.
const TRAFFIC_MIX = [
  ['sedan', 3], ['coupe', 2], ['taxi', 2], ['van', 1],
  ['sport', 2], ['muscle', 2], ['pickup', 1],
];
const TRAFFIC_TYPES = TRAFFIC_MIX.map(([type]) => type);
const TRAFFIC_SPEED = 13;

export function createTraffic(scene, rng, city) {
  const cars = [];
  const parked = [];

  function spawnTrafficCar(preset) {
    const type = weighted(rng, TRAFFIC_MIX);
    const model = createCarModel(type, undefined, rng);
    scene.add(model);
    const car = new Car(model, type);
    car.driver = 'traffic';
    // Start on a random road, heading along it — or on a preset road and
    // lane when a platoon is being built.
    const along = preset ? preset.along : Math.random() < 0.5;
    const road = preset ? preset.road : pick(rng, ROAD_POSITIONS);
    const t = preset ? preset.t : range(rng, -WORLD_HALF + 30, WORLD_HALF - 30);
    const dir = preset ? preset.dir : rng() < 0.5 ? 1 : -1;
    if (along) car.place(t, road + (dir > 0 ? 3.5 : -3.5), dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    else car.place(road + (dir > 0 ? -3.5 : 3.5), t, dir > 0 ? 0 : Math.PI);
    car.speed = TRAFFIC_SPEED * range(rng, 0.8, 1.1);
    car.targetSpeed = car.speed;
    cars.push(car);
    return car;
  }

  // Platoons: clusters of 3-4 cars bumper to bumper on the same road and
  // lane, so the streets read busy instead of one lonely car per block.
  function spawnPlatoon() {
    const along = Math.random() < 0.5;
    const road = pick(rng, ROAD_POSITIONS);
    const dir = rng() < 0.5 ? 1 : -1;
    const t0 = range(rng, -WORLD_HALF + 120, WORLD_HALF - 120);
    const n = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i += 1) {
      spawnTrafficCar({ along, road, dir, t: t0 - dir * i * range(rng, 12, 18) });
    }
  }

  function spawnParkedCar() {
    const type = weighted(rng, TRAFFIC_MIX);
    const model = createCarModel(type, undefined, rng);
    scene.add(model);
    const car = new Car(model, type);
    car.driver = null;
    car.parked = true;
    const road = pick(rng, ROAD_POSITIONS);
    const along = Math.random() < 0.5;
    const t = range(rng, -WORLD_HALF + 40, WORLD_HALF - 40);
    const side = rng() < 0.5 ? 1 : -1;
    if (along) car.place(t, road + side * (ROAD_WIDTH / 2 + 3.5), side > 0 ? Math.PI / 2 : -Math.PI / 2);
    else car.place(road + side * (ROAD_WIDTH / 2 + 3.5), t, side > 0 ? 0 : Math.PI);
    parked.push(car);
    return car;
  }

  for (let i = 0; i < 12; i += 1) spawnPlatoon();
  for (let i = 0; i < TRAFFIC_CARS - 40; i += 1) spawnTrafficCar();
  for (let i = 0; i < PARKED_CARS; i += 1) spawnParkedCar();

  function nearestRoadCoord(value) {
    let best = ROAD_POSITIONS[0];
    for (const p of ROAD_POSITIONS) {
      if (Math.abs(p - value) < Math.abs(best - value)) best = p;
    }
    return best;
  }

  function update(dt, allCars) {
    // Headlights glow as the light fades: dusk and night driving reads.
    const night = city.nightFactor ? city.nightFactor() : 0;
    for (const car of cars) car.setLights(night);
    for (const car of parked) car.setLights(night);
    for (const car of cars) {
      const movingAlongX = Math.abs(Math.sin(car.heading)) > 0.9;
      const axis = movingAlongX ? 'x' : 'z';
      const along = movingAlongX ? car.x : car.z;
      const dirSign = movingAlongX ? Math.sign(Math.sin(car.heading)) : Math.sign(Math.cos(car.heading));
      // Stop at a red traffic light when approaching a major intersection,
      // slow down on yellow.
      let lightStop = false;
      let lightSlow = false;
      for (const p of [-135, -45, 45, 135]) {
        const ahead = (p - along) * dirSign;
        if (ahead > 1 && ahead < 16) {
          const state = city.lightForAxis(axis);
          if (state === 'red') lightStop = true;
          if (state === 'yellow') lightSlow = true;
          break;
        }
      }
      // Slow down for the car ahead.
      let blocked = false;
      for (const other of allCars) {
        if (other === car || other.parked) continue;
        const d = distance2D(car.x, car.z, other.x, other.z);
        if (d < 11) {
          const aheadX = car.x + Math.sin(car.heading) * 8;
          const aheadZ = car.z + Math.cos(car.heading) * 8;
          if (distance2D(aheadX, aheadZ, other.x, other.z) < 7) {
            blocked = true;
            break;
          }
        }
      }
      const target = blocked || lightStop ? 0 : lightSlow ? TRAFFIC_SPEED * 0.4 : TRAFFIC_SPEED;
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // At an intersection, sometimes turn onto the crossing road.
      // Right-hand traffic: the lane offset after a turn follows the new
      // heading's right side (cos for north/south, sin for east/west).
      const near = nearestRoadCoord(along);
      if (Math.abs(along - near) < 2 && rng() < dt * 0.25) {
        car.heading += (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
        if (movingAlongX) car.x = near - 3.5 * Math.cos(car.heading);
        else car.z = near + 3.5 * Math.sin(car.heading);
      }
      // Wrap around the city edge instead of driving into the sea.
      if (car.x > WORLD_HALF - 10 || car.x < -WORLD_HALF + 10 || car.z > WORLD_HALF - 10 || car.z < -WORLD_HALF + 10) {
        car.heading += Math.PI;
        car.x = clamp(car.x, -WORLD_HALF + 20, WORLD_HALF - 20);
        car.z = clamp(car.z, -WORLD_HALF + 20, WORLD_HALF - 20);
      }
      car.syncModel();
    }
  }

  return {
    cars,
    parked,
    all() {
      return cars.concat(parked);
    },
    update,
    // The closest stealable car to (x, z) within `range`, or null.
    nearestStealable(x, z, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const car of cars.concat(parked)) {
        if (car.driver === 'player') continue;
        const d = distance2D(x, z, car.x, car.z);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      return best;
    },
  };
}
