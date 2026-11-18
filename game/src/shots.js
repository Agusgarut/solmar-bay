// The screenshot scenes behind ?shot=start|drive|mission|chase.
// Each one stages the real game — a real car, real police, a real mission —
// then lets the simulation run a couple of seconds so the frame is what a
// short game really looks like, and the same seed always gives the same frame.

import { createCarModel, Car } from './vehicles.js';

// Where each scene starts the player (x, z, heading).
const SPAWNS = {
  start: { x: 250, z: 45, heading: -Math.PI / 2 },
  drive: { x: -200, z: 45, heading: Math.PI / 2 },
  mission: { x: 250, z: -160, heading: Math.PI },
  chase: { x: -100, z: -45, heading: Math.PI / 2 },
};

export function stageShot(name, ctx) {
  const spawn = SPAWNS[name] || SPAWNS.start;
  // The staged hour: night for the chase, sunset for the title, day else.
  // updateGame advances time from timeBase, so set the base, not the clock.
  ctx.timeBase = name === 'chase' ? 21.5 : name === 'start' ? 17.3 : name === 'mission' ? 14 : 10;
  ctx.timeOfDay = ctx.timeBase;
  ctx.player.health = 100;
  ctx.player.ammo = 24;
  ctx.player.weapon = name === 'mission' ? 'pistol' : 'fists';
  ctx.player.place(spawn.x, spawn.z, spawn.heading);

  if (name === 'start') {
    // Title screen over the city at sunset: the camera orbits downtown.
    ctx.setState('title');
    ctx.hud.showTitle();
    ctx.player.cameraYaw = Math.PI * 0.75;
    return { simulateSeconds: 0, throttle: 0, steer: 0, orbit: true };
  }

  ctx.setState('play');
  ctx.hud.showPlay();
  ctx.audio.unlock();

  if (name === 'drive' || name === 'chase') {
    // Put Dani in a car and let them drive while the police close in.
    const type = name === 'chase' ? 'sport' : 'coupe';
    const model = createCarModel(type, name === 'chase' ? 0xd81e5b : 0x2e6fc2, ctx.rng);
    ctx.scene.add(model);
    const car = new Car(model, type);
    car.driver = 'player';
    // Right-hand lane, not the centre line.
    car.place(spawn.x, spawn.z + 3.5, spawn.heading);
    car.speed = 18;
    ctx.traffic.parked.push(car);
    ctx.player.inCar = car;
    ctx.player.group.visible = false;
    ctx.police.setWanted(name === 'chase' ? 4 : 2);
    return { simulateSeconds: 2.6, throttle: 1, steer: 0, orbit: false };
  }

  // Mission: the port shootout, pistol out, guards ahead.
  ctx.missions.startMission(4, ctx);
  ctx.player.place(spawn.x, spawn.z, spawn.heading);
  return { simulateSeconds: 1.2, throttle: 0, steer: 0, orbit: false };
}
