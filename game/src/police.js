// The wanted system and the Solmar Bay Police Department.
// Crimes raise the wanted level (0-5 stars); police cars chase and ram the
// player's car, foot officers chase the player on foot, and a long stretch
// out of sight lets the heat cool down one star at a time.

import * as THREE from 'three';
import { MAX_WANTED, WANTED_DECAY_SECONDS, clamp, distance2D } from './config.js';
import { createCarModel, Car } from './vehicles.js';
import { createPlayerCharacter } from './player.js';

export function createPolice(scene, rng) {
  const copCars = [];
  const footCops = [];
  let wanted = 0;
  let heatTimer = 0; // seconds the player has stayed hidden
  let sirenTimer = 0;

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

    // How many police the current wanted level calls for.
    wantedForce() {
      return { cars: Math.min(wanted, 4), foot: wanted >= 2 ? Math.min(wanted - 1, 4) : 0 };
    },

    update(dt, ctx) {
      const player = ctx.player;
      const px = player.inCar ? player.inCar.x : player.x;
      const pz = player.inCar ? player.inCar.z : player.z;
      const force = this.wantedForce();

      // Spawn police just out of sight, at the edge of the player's view.
      while (copCars.length < force.cars) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 70 + Math.random() * 40;
        spawnCopCar(px + Math.sin(angle) * dist, pz + Math.cos(angle) * dist);
      }
      while (footCops.length < force.foot && !player.inCar) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 45 + Math.random() * 25;
        spawnFootCop(px + Math.sin(angle) * dist, pz + Math.cos(angle) * dist);
      }
      while (copCars.length > force.cars) removeCopCar(copCars[copCars.length - 1]);
      while (footCops.length > force.foot) removeFootCop(footCops[footCops.length - 1]);

      // Siren wail while any cop car is out.
      sirenTimer -= dt;
      if (copCars.length > 0 && sirenTimer <= 0) {
        ctx.audio.siren(true);
        sirenTimer = 1.4;
      }

      // Cop cars chase the player and ram.
      for (const car of copCars) {
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

      // Foot cops run at the player; standing close for a while = busted.
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
