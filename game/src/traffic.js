// Traffic: NPC cars that loop around the road grid, plus parked cars the
// player can steal. A traffic car picks a road, drives along it, turns at a
// random intersection, and slows when another car is right ahead.

import * as THREE from 'three';
import { ROAD_POSITIONS, ROAD_WIDTH, WORLD_HALF, clamp, distance2D } from './config.js';
import { createCarModel, Car } from './vehicles.js';
import { pick, range } from './random.js';

const TRAFFIC_TYPES = ['sedan', 'coupe', 'taxi', 'van', 'sport'];
const TRAFFIC_SPEED = 13;

export function createTraffic(scene, rng, city) {
  const cars = [];
  const parked = [];

  function spawnTrafficCar() {
    const type = pick(rng, TRAFFIC_TYPES);
    const model = createCarModel(type, undefined, rng);
    scene.add(model);
    const car = new Car(model, type);
    car.driver = 'traffic';
    // Start on a random road, heading along it.
    const along = Math.random() < 0.5;
    const road = pick(rng, ROAD_POSITIONS);
    const t = range(rng, -WORLD_HALF + 30, WORLD_HALF - 30);
    const dir = rng() < 0.5 ? 1 : -1;
    if (along) car.place(t, road + (dir > 0 ? 3.5 : -3.5), dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    else car.place(road + (dir > 0 ? -3.5 : 3.5), t, dir > 0 ? 0 : Math.PI);
    car.speed = TRAFFIC_SPEED * range(rng, 0.8, 1.1);
    car.targetSpeed = car.speed;
    cars.push(car);
    return car;
  }

  function spawnParkedCar() {
    const type = pick(rng, TRAFFIC_TYPES);
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

  for (let i = 0; i < 22; i += 1) spawnTrafficCar();
  for (let i = 0; i < 12; i += 1) spawnParkedCar();

  function nearestRoadCoord(value) {
    let best = ROAD_POSITIONS[0];
    for (const p of ROAD_POSITIONS) {
      if (Math.abs(p - value) < Math.abs(best - value)) best = p;
    }
    return best;
  }

  function update(dt, allCars) {
    for (const car of cars) {
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
      const target = blocked ? 0 : TRAFFIC_SPEED;
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // At an intersection, sometimes turn onto the crossing road.
      // Right-hand traffic: the lane offset after a turn follows the new
      // heading's right side (cos for north/south, sin for east/west).
      const movingAlongX = Math.abs(Math.sin(car.heading)) > 0.9;
      const along = movingAlongX ? car.x : car.z;
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
