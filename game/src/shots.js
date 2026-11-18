// The screenshot scenes behind ?shot=start|drive|mission|chase.
// Each one stages the real game — a real car, real police, a real mission —
// then lets the simulation run a couple of seconds so the frame is what a
// short game really looks like, and the same seed always gives the same frame.

import { createCarModel, Car } from './vehicles.js';

// Where each scene starts the player (x, z, heading).
const SPAWNS = {
  start: { x: 250, z: 45, heading: -Math.PI / 2 },
  // Drive from the far west so the car is clear of the red-light queue at
  // the first major intersection when the frame is taken.
  drive: { x: -320, z: 45, heading: Math.PI / 2 },
  // On the road by the port, facing the warehouse beacon — never inside a
  // building lot.
  mission: { x: 225, z: -160, heading: 2.0 },
  chase: { x: -100, z: -45, heading: Math.PI / 2 },
};

export function stageShot(name, ctx) {
  const spawn = SPAWNS[name] || SPAWNS.start;
  // The staged hour: night for the chase, sunset for the title, day else.
  // updateGame advances time from timeBase, so set the base, not the clock.
  ctx.timeBase = name === 'chase' ? 21.5 : name === 'start' ? 17.3 : name === 'mission' ? 14 : 10;
  ctx.timeOfDay = ctx.timeBase;
  // Driving shots get a green light on their axis so the car is at speed,
  // not queued behind traffic stopped at a red light.
  if (name === 'drive' || name === 'chase') ctx.city.setCycle(8);
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

  // Mission: the port shootout, pistol out, guards ahead. Pull the guards
  // onto the street in front of Dani so the shootout reads in the frame
  // (their mission spots are behind the warehouses).
  ctx.missions.startMission(4, ctx);
  ctx.player.place(spawn.x, spawn.z, spawn.heading);
  const guardSpots = [[229, -172], [222, -181], [231, -190]];
  ctx.combat.enemies.forEach((enemy, i) => {
    const [gx, gz] = guardSpots[i % guardSpots.length];
    enemy.x = gx;
    enemy.z = gz;
    enemy.heading = Math.atan2(spawn.x - gx, spawn.z - gz);
    enemy.model.position.set(gx, 0, gz);
    enemy.model.rotation.y = enemy.heading;
  });
  return { simulateSeconds: 1.2, throttle: 0, steer: 0, orbit: false };
}
