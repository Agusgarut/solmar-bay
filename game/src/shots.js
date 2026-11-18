// The screenshot scenes behind ?shot=start|drive|mission|chase.
// Each one stages the real game — a real car, real police, a real mission —
// then lets the simulation run a couple of seconds so the frame is what a
// short game really looks like, and the same seed always gives the same frame.

import { createCarModel, Car } from './vehicles.js';

// Where each scene starts the player (x, z, heading).
const SPAWNS = {
  // Title on the beachfront: the sun, sea and palms settle around here.
  start: { x: 315, z: -20, heading: 0 },
  // Beachfront: drive SOUTH down the Ocean boulevard (x=315) — sea and
  // palms on the left, sun ahead-left, ferris wheel and pier ahead.
  drive: { x: 315, z: -60, heading: 0 },
  // On the road by the port, facing the warehouse beacon — never inside a
  // building lot.
  mission: { x: 225, z: -160, heading: 2.0 },
  // Chase south down the same beach road, so the pursuit runs past the
  // palms, the pier and the beach crowd.
  chase: { x: 315, z: -110, heading: 0 },
};

export function stageShot(name, ctx) {
  const spawn = SPAWNS[name] || SPAWNS.start;
  // The staged hour: bright golden hour for every shot — the sun is still
  // well up at 17.2-17.5, so every frame reads sunlit, like the reference.
  // updateGame advances time from timeBase, so set the base, not the clock.
  ctx.timeBase = name === 'start' ? 17.2 : 17.5;
  ctx.timeOfDay = ctx.timeBase;
  // Driving shots get a green light on their axis so the car is at speed,
  // not queued behind traffic stopped at a red light. The beach road runs
  // north-south (z axis), whose green phase is 0-5 — cycle 2 is green.
  if (name === 'drive' || name === 'chase') ctx.city.setCycle(2);
  ctx.player.health = 100;
  ctx.player.ammo = 24;
  ctx.player.weapon = name === 'mission' ? 'pistol' : 'fists';
  ctx.player.place(spawn.x, spawn.z, spawn.heading);

  if (name === 'start') {
    // Title screen: a cinematic poster frame on the beachfront — the pink
    // hero car in the lower right, low 3/4 rear view, palms and the sea
    // ahead-left, the sun low over the road behind it.
    ctx.setState('title');
    ctx.hud.showTitle();
    const heroModel = createCarModel('sport', 0xff2e88, ctx.rng);
    ctx.scene.add(heroModel);
    const heroCar = new Car(heroModel, 'sport');
    heroCar.driver = null;
    heroCar.parked = true;
    heroCar.place(315, -5, 0.1);
    ctx.traffic.parked.push(heroCar);
    ctx.player.cameraYaw = Math.PI * 0.75;
    return {
      simulateSeconds: 0, throttle: 0, steer: 0, orbit: false,
      // Low and close, north-west of the car looking east-south-east
      // down the beach: the pink hero fills the lower-right of the frame
      // in a 3/4 rear view (flank + spoiler + plate + rims all readable),
      // clear of the centred title text and button, with the sea and the
      // pier on the left of the frame.
      cameraPose: { pos: [306, 2.8, -18], look: [340, 1.5, 2] },
    };
  }

  ctx.setState('play');
  ctx.hud.showPlay();
  ctx.audio.unlock();

  if (name === 'drive' || name === 'chase') {
    // Put Dani in a car and let them drive while the police close in.
    // The chase runs at 4 stars, so the helicopter is in the frame too.
    // The hero car is hot pink in both shots: it has to pop against the
    // sunset road, like the reference entries' pink sports car.
    // Direction vectors: forward (fx, fz) and right (rx, rz) for any
    // heading, so the lane offsets work on the beach road too.
    const fx = Math.sin(spawn.heading);
    const fz = Math.cos(spawn.heading);
    const rx = Math.cos(spawn.heading);
    const rz = -Math.sin(spawn.heading);
    const type = 'sport';
    const model = createCarModel(type, 0xff2e88, ctx.rng);
    ctx.scene.add(model);
    const car = new Car(model, type);
    car.driver = 'player';
    // Right-hand lane, not the centre line.
    car.place(spawn.x + rx * -3.5, spawn.z + rz * -3.5, spawn.heading);
    // The chase starts already rolling fast: its sim is shorter, so the
    // car needs a higher starting speed to be at full pace in the frame.
    car.speed = name === 'chase' ? 24 : 18;
    ctx.traffic.parked.push(car);
    ctx.player.inCar = car;
    ctx.player.group.visible = false;
    ctx.police.setWanted(name === 'chase' ? 4 : 2);
    // Clear only the player's exact lane right ahead: cars in the other
    // lane and further out stay in the frame, so the street reads busy.
    for (let i = ctx.traffic.cars.length - 1; i >= 0; i -= 1) {
      const c = ctx.traffic.cars[i];
      const along = (c.x - spawn.x) * fx + (c.z - spawn.z) * fz;
      const side = Math.abs((c.x - spawn.x) * fz - (c.z - spawn.z) * fx);
      if (along > -5 && along < 55 && side < 5.5) {
        ctx.scene.remove(c.model);
        ctx.traffic.cars.splice(i, 1);
      }
    }
    // Stage a busy street: real traffic cars ahead in both lanes, placed
    // far enough out that the player can't ram them during the short sim,
    // close enough that the frame reads dense. Same-lane cars sit 55-180 m
    // ahead (the player only closes ~23 m in the sim); oncoming cars
    // 65-225 m (they close ~69 m, so they arrive right in the frame).
    // That leaves cars at roughly 30-155 m ahead when the frame is taken.
    // Gaps are >= 15 m in each lane: any closer and the car behind brakes
    // for the car ahead (traffic slows within 11 m), the player catches
    // the stopped car and the shot crawls at 36 km/h instead of 150+.
    const ahead = (dist, side) => ({
      x: spawn.x + fx * dist + rx * side,
      z: spawn.z + fz * dist + rz * side,
    });
    const stageCar = (dist, side, typeName, color) => {
      const p = ahead(dist, side);
      const m = createCarModel(typeName, color, ctx.rng);
      ctx.scene.add(m);
      const staged = new Car(m, typeName);
      staged.driver = 'traffic';
      // Same-direction lane faces away; the oncoming lane faces the player.
      staged.place(p.x, p.z, side < 0 ? spawn.heading : spawn.heading + Math.PI);
      staged.speed = 13;
      staged.targetSpeed = 13;
      ctx.traffic.cars.push(staged);
    };
    stageCar(55, -3.5, 'convertible', 0xffe14f);
    stageCar(78, -3.5, 'sedan', 0xff2e88);
    stageCar(102, -3.5, 'taxi', 0xe8b93b);
    stageCar(128, -3.5, 'sport', 0x2ec4b6);
    stageCar(155, -3.5, 'sport', 0xff2e88);
    stageCar(180, -3.5, 'coupe', 0x2e6fc2);
    stageCar(65, 3.5, 'sedan', 0xd8d8d8);
    stageCar(95, 3.5, 'muscle', 0xff7a1a);
    stageCar(125, 3.5, 'coupe', 0xffe14f);
    stageCar(140, 3.5, 'truck', 0x2ec4b6);
    stageCar(170, 3.5, 'van', 0xd8d8d8);
    stageCar(200, 3.5, 'sedan', 0xff3b30);
    stageCar(225, 3.5, 'pickup', 0xff7a1a);
    // Parked cars along the beachfront kerb: the street is never empty.
    const parkCar = (x, z, heading, typeName, color) => {
      const m = createCarModel(typeName, color, ctx.rng);
      ctx.scene.add(m);
      const parkedCar = new Car(m, typeName);
      parkedCar.driver = null;
      parkedCar.parked = true;
      parkedCar.place(x, z, heading);
      ctx.traffic.parked.push(parkedCar);
    };
    parkCar(spawn.x - 10.5, spawn.z + 30, spawn.heading, 'coupe', 0x4fd8ff);
    parkCar(spawn.x - 10.5, spawn.z + 72, spawn.heading, 'sedan', 0xff5e8a);
    parkCar(spawn.x + 10.5, spawn.z + 52, spawn.heading + Math.PI, 'van', 0xd8d8d8);
    // A busy beachfront: 8 pedestrians on both sidewalks, 3 strolling the
    // sand, 2 crossing at the next intersection — the frame must read
    // crowded, like the reference.
    const stagedPeds = ctx.peds.peds.slice(0, 13);
    stagedPeds.forEach((ped, i) => {
      let p;
      if (i < 8) {
        p = ahead(15 + i * 13, i % 2 === 0 ? -10.5 : 10.5);
        ped.heading = spawn.heading;
      } else if (i < 11) {
        p = ahead(30 + (i - 8) * 28, 26 + (i - 8) * 9);
        ped.heading = spawn.heading;
      } else {
        // Crossing the beach road at the next intersection.
        const cz = spawn.z + 15;
        p = { x: spawn.x + (i === 11 ? -10.5 : 10.5), z: cz };
        ped.heading = i === 11 ? Math.PI / 2 : -Math.PI / 2;
      }
      ped.x = p.x;
      ped.z = p.z;
      ped.model.position.set(p.x, 0, p.z);
      ped.model.rotation.y = ped.heading;
    });
    // Short sim: the pursuit needs a moment to close in, but a longer run
    // lets a cop that spawned ahead meet the car head-on and pin it to a
    // crawl. The chase sim is even shorter (1.2 s) so the cops arrive in
    // the frame before any of them can glue onto the player and ram his
    // speed down.
    return { simulateSeconds: name === 'chase' ? 1.2 : 1.6, throttle: 1, steer: 0, orbit: false };
  }

  // Mission: the port shootout, pistol out, guards ahead. Pull the guards
  // onto the street in front of Dani so the shootout reads in the frame
  // (their mission spots are behind the warehouses). The mission banner
  // and the intro dialogue stay up for the frame.
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
