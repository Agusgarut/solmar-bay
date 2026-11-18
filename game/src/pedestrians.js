// Pedestrians: people strolling the sidewalks. They walk along the road
// grid, turn at intersections, and run away from gunfire, speeding cars and
// police chases nearby. Hitting one is a crime — the wanted system notices.

import * as THREE from 'three';
import { ROAD_POSITIONS, ROAD_WIDTH, WORLD_HALF, clamp, distance2D } from './config.js';
import { pick, range } from './random.js';

const SHIRT_COLORS = [0xd8d8d8, 0xc23b2e, 0x2e6fc2, 0x3a9e5f, 0xe8b93b, 0x8a4fc2, 0x22252a, 0xd81e5b];

function createPedModel(rng) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: pick(rng, [0xc98a5f, 0x8a5a38, 0xe8b88a]) });
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRT_COLORS) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.3), skin);
  head.position.y = 1.64;
  head.castShadow = true;
  group.add(head);
  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.22);
  legGeo.translate(0, -0.36, 0);
  const leftLeg = new THREE.Mesh(legGeo, pants);
  leftLeg.position.set(-0.14, 0.74, 0);
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, pants);
  rightLeg.position.set(0.14, 0.74, 0);
  group.add(rightLeg);
  group.userData = { leftLeg, rightLeg };
  return group;
}

export function createPedestrians(scene, rng) {
  const peds = [];

  function spawn() {
    const model = createPedModel(rng);
    scene.add(model);
    const road = pick(rng, ROAD_POSITIONS);
    const along = Math.random() < 0.5;
    const t = range(rng, -WORLD_HALF + 20, WORLD_HALF - 20);
    const side = rng() < 0.5 ? 1 : -1;
    const ped = {
      model,
      x: along ? t : road + side * (ROAD_WIDTH / 2 + 2.5),
      z: along ? road + side * (ROAD_WIDTH / 2 + 2.5) : t,
      heading: along ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI),
      speed: range(rng, 1.2, 2.2),
      walkPhase: rng() * 6,
      fleeing: false,
      fleeTimer: 0,
      dead: false,
    };
    model.position.set(ped.x, 0, ped.z);
    model.rotation.y = ped.heading;
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < 60; i += 1) spawn();

  function nearestRoadCoord(value) {
    let best = ROAD_POSITIONS[0];
    for (const p of ROAD_POSITIONS) {
      if (Math.abs(p - value) < Math.abs(best - value)) best = p;
    }
    return best;
  }

  return {
    peds,
    spawn,
    // Scare every pedestrian within `radius` of (x, z): they run away.
    scare(x, z, radius) {
      for (const ped of peds) {
        if (ped.dead) continue;
        if (distance2D(x, z, ped.x, ped.z) < radius) {
          ped.fleeing = true;
          ped.fleeTimer = 3 + Math.random() * 2;
          ped.heading = Math.atan2(ped.x - x, ped.z - z);
        }
      }
    },
    update(dt) {
      for (const ped of peds) {
        if (ped.dead) continue;
        if (ped.fleeing) {
          ped.fleeTimer -= dt;
          if (ped.fleeTimer <= 0) ped.fleeing = false;
        }
        const speed = ped.fleeing ? 5.5 : ped.speed;
        ped.x += Math.sin(ped.heading) * speed * dt;
        ped.z += Math.cos(ped.heading) * speed * dt;
        // Turn at intersections so they keep wandering the sidewalks.
        if (!ped.fleeing) {
          const movingAlongX = Math.abs(Math.sin(ped.heading)) > 0.9;
          const along = movingAlongX ? ped.x : ped.z;
          const near = nearestRoadCoord(along);
          if (Math.abs(along - near) < 1.5 && Math.random() < dt * 0.2) {
            ped.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
          }
        }
        ped.x = clamp(ped.x, -WORLD_HALF + 5, WORLD_HALF - 5);
        ped.z = clamp(ped.z, -WORLD_HALF + 5, WORLD_HALF - 5);
        ped.walkPhase += dt * speed * 2.2;
        const swing = Math.sin(ped.walkPhase) * 0.5;
        ped.model.userData.leftLeg.rotation.x = swing;
        ped.model.userData.rightLeg.rotation.x = -swing;
        ped.model.position.set(ped.x, 0, ped.z);
        ped.model.rotation.y = ped.heading;
      }
    },
  };
}
