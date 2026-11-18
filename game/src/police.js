// The wanted system and the Solmar Bay Police Department.
// Crimes raise the wanted level (0-5 stars); police cars chase and ram the
// player's car, foot officers chase the player on foot, and a long stretch
// out of sight lets the heat cool down one star at a time.

import * as THREE from 'three';
import { HELI_MIN_WANTED, MAX_WANTED, WANTED_DECAY_SECONDS, ROAD_POSITIONS, ROAD_WIDTH, WORLD_HALF, clamp, distance2D } from './config.js';
import { createCarModel, Car } from './vehicles.js';
import { createPlayerCharacter } from './player.js';

// Callsigns for the dispatch list the HUD shows.
const UNIT_CALLSIGNS = ['SBPD-12', 'SBPD-27', 'SBPD-31', 'SBPD-44'];

// One helper for helicopter parts: a box (or any geometry) placed in the
// group, optionally casting a shadow.
function heliPart(group, geo, material, x, y, z, shadow) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  if (shadow) mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function createHelicopter(scene) {
  const group = new THREE.Group();
  // Scaled up 25%: at wanted 3+ the chopper has to dominate the sky in
  // the chase frame, not hide as a speck between the towers.
  group.scale.setScalar(1.25);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1c2f4a });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc4d8 });

  heliPart(group, new THREE.BoxGeometry(2.2, 1.4, 4.2), bodyMat, 0, 0, 0, true);
  heliPart(group, new THREE.BoxGeometry(1.8, 1.0, 1.2), glassMat, 0, -0.1, 2.4, false);
  heliPart(group, new THREE.BoxGeometry(0.5, 0.5, 5.5), bodyMat, 0, 0.3, -4.2, false);
  heliPart(group, new THREE.BoxGeometry(0.2, 1.4, 1.0), bodyMat, 0, 0.9, -6.6, false);
  const rotorMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const rotor = heliPart(group, new THREE.BoxGeometry(11, 0.08, 0.5), rotorMat, 0, 1.0, 0, false);
  const rotor2 = heliPart(group, new THREE.BoxGeometry(0.5, 0.08, 11), rotorMat, 0, 1.0, 0, false);
  // Rotor blur disc: a translucent circle under the blades, so the rotor
  // reads as a spinning blur instead of two thin sticks.
  const blurDisc = new THREE.Mesh(
    new THREE.CircleGeometry(5.5, 24),
    new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  );
  blurDisc.rotation.x = -Math.PI / 2;
  blurDisc.position.y = 1.0;
  group.add(blurDisc);
  for (const side of [-1, 1]) {
    heliPart(group, new THREE.BoxGeometry(0.14, 0.14, 3.4), darkMat, side * 0.9, -0.95, 0, false);
  }
  // Searchlight cone, aimed down; on from golden hour on, so the chase
  // frame always has a visible beam sweeping the street.
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(8, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = -18;
  beam.rotation.x = Math.PI;
  group.add(beam);
  // Red beacon strobes on the mast so the chopper reads in the dusk sky.
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x660000, emissive: 0xff2222, emissiveIntensity: 2 }),
  );
  beacon.position.set(0, 1.05, 0);
  group.add(beacon);
  scene.add(group);
  return { group, rotor, rotor2, beam, beacon, angle: 0 };
}

export function createPolice(scene, rng) {
  const copCars = [];
  const footCops = [];
  let wanted = 0;
  let heatTimer = 0; // seconds the player has stayed hidden
  let sirenTimer = 0;
  let heli = null; // police helicopter, out at 3+ stars
  let roadblockCar = null; // one cop car parked across the road at 4+ stars

  function spawnCopCar(x, z) {
    const model = createCarModel('police', 0x1a1d22, rng);
    scene.add(model);
    const car = new Car(model, 'police');
    car.driver = 'police';
    car.place(x, z, 0);
    car.speed = 0;
    copCars.push(car);
    return car;
  }

  function spawnFootCop(x, z) {
    const model = createPlayerCharacter();
    // Navy uniform instead of Dani's jacket.
    model.children.forEach((child) => {
      if (child.material && child.material.color && child.material.color.getHex() === 0x2e5f8a) {
        child.material = new THREE.MeshLambertMaterial({ color: 0x1c2f4a });
      }
    });
    scene.add(model);
    const cop = { model, x, z, heading: 0, speed: 0, bustTimer: 0, walkPhase: 0 };
    model.position.set(x, 0, z);
    footCops.push(cop);
    return cop;
  }

  function removeCopCar(car) {
    scene.remove(car.model);
    const i = copCars.indexOf(car);
    if (i >= 0) copCars.splice(i, 1);
  }

  function removeFootCop(cop) {
    scene.remove(cop.model);
    const i = footCops.indexOf(cop);
    if (i >= 0) footCops.splice(i, 1);
  }

  function clearAll() {
    for (const car of [...copCars]) removeCopCar(car);
    for (const cop of [...footCops]) removeFootCop(cop);
    if (heli) {
      scene.remove(heli.group);
      heli = null;
    }
    roadblockCar = null;
  }

  // A spawn point on a road near (px, pz): police arrive driving down a
  // street, never materialising inside a building lot.
  function roadSpawn(px, pz, minDist, maxDist) {
    let x = px;
    let z = pz;
    for (let tries = 0; tries < 8; tries += 1) {
      const road = ROAD_POSITIONS[Math.floor(Math.random() * ROAD_POSITIONS.length)];
      const along = (Math.random() * 2 - 1) * (WORLD_HALF - 40);
      const side = Math.random() < 0.5 ? 1 : -1;
      const onX = Math.random() < 0.5;
      x = onX ? along : road + side * (ROAD_WIDTH / 2 + 2.5);
      z = onX ? road + side * (ROAD_WIDTH / 2 + 2.5) : along;
      const d = Math.hypot(x - px, z - pz);
      if (d >= minDist) {
        if (d > maxDist) {
          x = px + (x - px) * (maxDist / d);
          z = pz + (z - pz) * (maxDist / d);
        }
        break;
      }
    }
    return { x, z };
  }

  // Spawn police just out of sight, at the edge of the player's view,
  // until the force matches the wanted level.
  function maintainForce(player, px, pz) {
    const force = { cars: Math.min(wanted, 4), foot: wanted >= 2 && !player.inCar ? Math.min(wanted - 1, 4) : 0 };
    while (copCars.length < force.cars) {
      const spot = roadSpawn(px, pz, 55, 110);
      spawnCopCar(spot.x, spot.z);
    }
    while (footCops.length < force.foot) {
      const spot = roadSpawn(px, pz, 35, 70);
      spawnFootCop(spot.x, spot.z);
    }
    while (copCars.length > force.cars) removeCopCar(copCars[copCars.length - 1]);
    while (footCops.length > force.foot) removeFootCop(footCops[footCops.length - 1]);
    return force;
  }

  // Light bars flash red/blue, alternating every 250 ms.
  function flashLightBars() {
    const flashRed = Math.floor(Date.now() / 250) % 2 === 0;
    for (const car of copCars) {
      const bar = car.model.userData.lightBar;
      if (!bar) continue;
      bar.redMat.emissiveIntensity = flashRed ? 3.0 : 0.2;
      bar.blueMat.emissiveIntensity = flashRed ? 0.2 : 3.0;
    }
  }

  // Helicopter at 3+ stars: circles the player, rotor spinning, and its
  // searchlight comes on after dark.
  function updateHeli(dt, ctx, px, pz) {
    if (wanted >= HELI_MIN_WANTED && !heli) heli = createHelicopter(scene);
    if (wanted < HELI_MIN_WANTED - 1 && heli) {
      scene.remove(heli.group);
      heli = null;
    }
    if (!heli) return;
    heli.angle += dt * 0.45;
    const hx = px + Math.sin(heli.angle) * 34;
    const hz = pz + Math.cos(heli.angle) * 34;
    // High orbit (52 m) so the chopper clears the downtown towers and
    // reads against the sky.
    heli.group.position.set(hx, 52, hz);
    heli.group.rotation.y = Math.atan2(px - hx, pz - hz);
    heli.rotor.rotation.y += dt * 22;
    heli.rotor2.rotation.y += dt * 22;
    // Searchlight sweeps the player once dusk sets in.
    heli.beam.visible = ctx.city.nightFactor() > 0.35;
    heli.beacon.material.emissiveIntensity = Math.floor(Date.now() / 400) % 2 === 0 ? 2.5 : 0.2;
  }

  // Roadblock at 4+ stars: one cop car parks across the left lane ahead
  // of the player, facing sideways, until the heat drops. The right lane
  // stays open, so a fast driver can squeeze through.
  function updateRoadblock(player, px, pz) {
    if (wanted >= 4 && !roadblockCar && copCars.length > 0) {
      roadblockCar = copCars[copCars.length - 1];
      const fx = Math.sin(player.heading);
      const fz = Math.cos(player.heading);
      roadblockCar.place(
        px + fx * 42 + Math.cos(player.heading) * 5,
        pz + fz * 42 - Math.sin(player.heading) * 5,
        player.heading + Math.PI / 2,
      );
    }
    if (wanted < 4) roadblockCar = null;
    if (roadblockCar) {
      roadblockCar.speed = 0;
      roadblockCar.syncModel();
    }
  }

  // Cop cars chase the player and ram. The roadblock car holds its
  // position instead of chasing.
  function chaseCars(dt, ctx, player, px, pz) {
    for (const car of copCars) {
      if (car === roadblockCar) continue;
      const d = distance2D(car.x, car.z, px, pz);
      const targetHeading = Math.atan2(px - car.x, pz - car.z);
      let diff = targetHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += clamp(diff, -1.6 * dt, 1.6 * dt);
      const targetSpeed = d > 6 ? 30 + wanted * 2 : 12;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      const fixed = ctx.city.resolveCircle(car.x, car.z, 2.2);
      car.x = fixed.x;
      car.z = fixed.z;
      car.syncModel();
      // Ram the player's car.
      if (player.inCar && d < 4.6) {
        player.inCar.speed *= 0.94;
        ctx.effects.sparks(px, 1, pz);
        if (Math.random() < dt * 0.5) ctx.audio.crash();
      }
    }
  }

  // Foot cops run at the player; standing close for a while = busted.
  function chaseFoot(dt, ctx, player) {
    let busted = false;
    for (const cop of footCops) {
      const d = distance2D(cop.x, cop.z, player.x, player.z);
      const targetHeading = Math.atan2(player.x - cop.x, player.z - cop.z);
      cop.heading = targetHeading;
      const speed = d > 3 ? 7.5 : 2;
      cop.x += Math.sin(cop.heading) * speed * dt;
      cop.z += Math.cos(cop.heading) * speed * dt;
      const fixed = ctx.city.resolveCircle(cop.x, cop.z, 0.55);
      cop.x = fixed.x;
      cop.z = fixed.z;
      cop.walkPhase += dt * speed * 2;
      const swing = Math.sin(cop.walkPhase) * 0.5;
      cop.model.userData.leftLeg.rotation.x = swing;
      cop.model.userData.rightLeg.rotation.x = -swing;
      cop.model.position.set(cop.x, 0, cop.z);
      cop.model.rotation.y = cop.heading;
      if (d < 2.2) {
        cop.bustTimer += dt;
        if (cop.bustTimer > 2.5) busted = true;
      } else {
        cop.bustTimer = 0;
      }
    }
    return busted;
  }

  return {
    get wanted() {
      return wanted;
    },
    copCars,
    footCops,

    addWanted(stars) {
      wanted = clamp(wanted + stars, 0, MAX_WANTED);
      heatTimer = 0;
    },
    setWanted(stars) {
      wanted = clamp(stars, 0, MAX_WANTED);
      heatTimer = 0;
    },
    clearWanted() {
      wanted = 0;
      heatTimer = 0;
      clearAll();
    },

    // The dispatch list the HUD shows: unit callsign, distance in metres,
    // and what it is doing right now.
    dispatchList(px, pz) {
      const list = [];
      copCars.forEach((car, i) => {
        const d = Math.round(distance2D(car.x, car.z, px, pz));
        const status = car === roadblockCar ? 'ROADBLOCK' : d < 9 ? 'RAMMING' : 'PURSUIT';
        list.push({ unit: UNIT_CALLSIGNS[i % UNIT_CALLSIGNS.length], dist: d, status });
      });
      footCops.forEach((cop, i) => {
        const d = Math.round(distance2D(cop.x, cop.z, px, pz));
        list.push({ unit: `SBPD-F${i + 1}`, dist: d, status: 'FOOT' });
      });
      if (heli) list.push({ unit: 'AIR-1', dist: Math.round(distance2D(heli.group.position.x, heli.group.position.z, px, pz)), status: 'AIR SUPPORT' });
      return list.slice(0, 5);
    },

    // How many police the current wanted level calls for.
    wantedForce() {
      return { cars: Math.min(wanted, 4), foot: wanted >= 2 ? Math.min(wanted - 1, 4) : 0 };
    },

    // The helicopter, if one is out (screenshots use this to pose it).
    get heli() {
      return heli;
    },
    // Put the helicopter at a chosen orbit angle around (px, pz).
    // height/radius let the screenshot pose drop it into the frame.
    placeHeli(angle, px, pz, height = 52, radius = 34) {
      if (!heli) return;
      heli.angle = angle;
      heli.group.position.set(px + Math.sin(angle) * radius, height, pz + Math.cos(angle) * radius);
      heli.group.rotation.y = Math.atan2(px - heli.group.position.x, pz - heli.group.position.z);
    },

    update(dt, ctx) {
      const player = ctx.player;
      const px = player.inCar ? player.inCar.x : player.x;
      const pz = player.inCar ? player.inCar.z : player.z;

      maintainForce(player, px, pz);

      // Siren wail while any cop car is out.
      sirenTimer -= dt;
      if (copCars.length > 0 && sirenTimer <= 0) {
        ctx.audio.siren(true);
        sirenTimer = 1.4;
      }

      flashLightBars();
      updateHeli(dt, ctx, px, pz);
      updateRoadblock(player, px, pz);
      chaseCars(dt, ctx, player, px, pz);
      const busted = chaseFoot(dt, ctx, player);

      // Heat cools down when no police is close to the player.
      let nearest = Infinity;
      for (const car of copCars) nearest = Math.min(nearest, distance2D(car.x, car.z, px, pz));
      for (const cop of footCops) nearest = Math.min(nearest, distance2D(cop.x, cop.z, px, pz));
      if (wanted > 0 && nearest > 60) {
        heatTimer += dt;
        if (heatTimer > WANTED_DECAY_SECONDS) {
          wanted -= 1;
          heatTimer = 0;
        }
      } else {
        heatTimer = 0;
      }
      return { busted };
    },
  };
}
