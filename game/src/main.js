// AshboelPunks — boot and the one loop.
// Input is read every frame, the world advances in fixed 1/60 s steps, and
// the renderer paints what is there. The game moves between four screens:
// title, play, paused and game over (busted / wasted).
//
// ?seed=N fixes the city. ?shot=start|drive|mission|chase (with &seed=N)
// stages that scene instead of running the loop, plays it forward a couple
// of seconds, paints it and sets window.__shotReady for a screenshot.

import * as THREE from 'three';
import { WORLD_HALF, DAY_LENGTH_SECONDS, START_MONEY, MAX_WANTED, GOLDEN_HOUR, clamp, districtAt, streetAt, distance2D } from './config.js';
import { createRandom } from './random.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER_CAR, ACTION_PUNCH, ACTION_SHOOT, ACTION_WEAPON, ACTION_JUMP, ACTION_RADIO, ACTION_HORN } from './input.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave } from './save.js';
import { buildCity } from './city.js';
import { createCarModel, Car, HERO_RED } from './vehicles.js';
import { createPlayer, updateCamera, applyDamage } from './player.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions, MISSIONS } from './missions.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Filmic tone mapping: golden-hour sunsets get warm highlights instead of
// blown-out white, and neon reads at dusk. Exposure is high on purpose:
// the game should read bright and sunny, like the entries on the feed.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87bfe8);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
camera.position.set(0, 30, -80);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- World and systems -------------------------------------------------
const save = loadSave();
const audio = createAudio();
audio.setMuted(save.muted);
audio.setStation(save.radioStation || 0);
const city = buildCity(scene, rng);
const player = createPlayer(scene);
const traffic = createTraffic(scene, rng, city);
const peds = createPedestrians(scene, rng);
const police = createPolice(scene, rng);
const combat = createCombat(scene, rng);
const missions = createMissions(scene);
const effects = createEffects(scene);
const hud = createHud();
const minimap = createMinimap();
const input = createInput(canvas);

const ctx = {
  scene, camera, renderer, rng, input, audio, save, city, player, traffic,
  peds, police, combat, missions, effects, hud, minimap,
  timeOfDay: GOLDEN_HOUR,
  timeBase: GOLDEN_HOUR, // timeOfDay advances from here; staging can set the hour
  state: 'title',
  mapOpen: false, // full-screen map (Tab) freezes the world while open
  lastMapState: null, // latest minimap state, reused to draw the big map
  setState(next) {
    ctx.state = next;
  },
  saveData() {
    writeSave(ctx.save);
  },
  spawnMissionCar() {
    const model = createCarModel('sport', HERO_RED, rng);
    scene.add(model);
    const car = new Car(model, 'sport');
    car.driver = null;
    car.parked = true;
    car.place(225, -270 + 10, 0);
    traffic.parked.push(car);
    ctx.missionCar = car;
  },
  spawnMissionEnemies() {
    const spots = [[262, -172], [278, -188], [250, -196], [285, -165], [258, -180]];
    for (const [x, z] of spots) combat.spawnEnemy(x, z);
  },
};

player.place(0, 45, Math.PI);
player.health = 100;
player.money = save.money;
ctx.missionCar = null;

// ---- Interactions -------------------------------------------------------
function enterOrExitCar() {
  if (player.inCar) {
    const car = player.inCar;
    car.driver = null;
    car.parked = true;
    car.speed = 0;
    traffic.parked.push(car);
    player.inCar = null;
    // Step out on the car's left side.
    const sideX = car.x - Math.cos(car.heading) * 2.2;
    const sideZ = car.z + Math.sin(car.heading) * 2.2;
    const fixed = city.resolveCircle(sideX, sideZ, 0.6);
    player.place(fixed.x, fixed.z, car.heading);
    player.group.visible = true;
    hud.showToast('Keluar dari mobil.');
    return;
  }
  const car = traffic.nearestStealable(player.x, player.z, 4.5);
  if (!car) {
    hud.showToast('Tidak ada mobil di dekat sini.');
    return;
  }
  if (car === ctx.missionCar) {
    missions.onSteal(ctx);
    hud.showToast('Coupe merah didapat! Antar ke garasi Rico.');
  } else if (car.driver === 'traffic') {
    // Carjacking: the driver runs off, the law notices.
    const i = traffic.cars.indexOf(car);
    if (i >= 0) traffic.cars.splice(i, 1);
    peds.scare(player.x, player.z, 20);
    police.addWanted(1);
    save.carsStolen += 1;
    hud.showToast('Mobil dicuri! Wanted +1.');
  } else {
    const i = traffic.parked.indexOf(car);
    if (i >= 0) traffic.parked.splice(i, 1);
    let seen = false;
    for (const copCar of police.copCars) {
      if (distance2D(copCar.x, copCar.z, player.x, player.z) < 60) seen = true;
    }
    if (seen) {
      police.addWanted(1);
      hud.showToast('Mencuri mobil di depan polisi! Wanted +1.');
    }
    save.carsStolen += 1;
  }
  car.driver = 'player';
  car.parked = false;
  player.inCar = car;
  player.group.visible = false;
  audio.pickup();
}

function startNextMission() {
  if (missions.isActive()) {
    hud.showToast('Misi sedang berjalan — lihat objective di atas.');
    return;
  }
  if (save.missionsDone >= MISSIONS.length) {
    hud.showToast('Semua misi selesai! Kamu legenda Solmar Bay.');
    return;
  }
  missions.startMission(save.missionIndex, ctx);
}

function respawn(reason) {
  const lost = Math.floor(save.money * 0.15);
  save.money = Math.max(0, save.money - lost);
  ctx.saveData();
  police.clearWanted();
  combat.clearAll();
  if (player.inCar) {
    player.inCar.driver = null;
    player.inCar.parked = true;
    traffic.parked.push(player.inCar);
    player.inCar = null;
  }
  player.group.visible = true;
  player.health = 100;
  player.ammo = 24;
  player.place(0, 45, Math.PI);
  ctx.timeOfDay = GOLDEN_HOUR;
  hud.showOver(reason, `Kamu kehilangan $${lost}. Dani kembali ke jalanan Downtown.`);
  audio.busted();
}

function gameOverIfNeeded() {
  if (player.health <= 0) {
    respawn('WASTED');
    return true;
  }
  return false;
}

// ---- One fixed step of the world ----------------------------------------
let lastDamageAt = -100;
let prevHealth = 100;
let elapsed = 0;
let prevEnemies = 0;
let minimapTimer = 0;

// Drive the player's car for one step: arcade controls, wall and car
// collisions, running over pedestrians, dust and exhaust.
function drivePlayerCar(dt, car, throttle, steer, handbrake, allCars) {
  car.drive(dt, throttle, steer, handbrake);
  // Handbrake skid: tyre smoke, screech and brake lights.
  const skidding = handbrake && Math.abs(car.speed) > 15;
  car.setBraking(handbrake || throttle < 0);
  if (skidding) {
    const bx = car.x - Math.sin(car.heading) * 1.6;
    const bz = car.z - Math.cos(car.heading) * 1.6;
    effects.skidSmoke(bx, 0.3, bz);
    if (Math.random() < dt * 6) audio.skid();
  }
  const fixed = city.resolveCircle(car.x, car.z, 2.2);
  if (Math.abs(fixed.x - car.x) + Math.abs(fixed.z - car.z) > 0.05) {
    if (Math.abs(car.speed) > 12) {
      audio.crash();
      effects.sparks(car.x, 1, car.z);
    }
    car.speed *= 0.5;
    car.x = fixed.x;
    car.z = fixed.z;
  }
  // Ram other cars.
  for (const other of allCars) {
    if (other === car) continue;
    if (distance2D(car.x, car.z, other.x, other.z) < 4.2) {
      car.speed *= 0.88;
      other.speed *= 0.9;
      if (Math.abs(car.speed) > 10 && Math.random() < dt * 2) {
        audio.crash();
        effects.sparks(car.x, 1, car.z);
      }
    }
  }
  // Run over pedestrians.
  for (const ped of peds.peds) {
    if (ped.dead) continue;
    if (distance2D(car.x, car.z, ped.x, ped.z) < 1.8 && Math.abs(car.speed) > 4) {
      ped.dead = true;
      scene.remove(ped.model);
      peds.scare(car.x, car.z, 40);
      police.addWanted(1);
      audio.crash();
      effects.blood(ped.x, 1, ped.z);
      hud.showToast('Kamu menabrak pejalan kaki! Wanted +1.');
    }
  }
  // Dust and exhaust while driving: a soft billowing trail behind the
  // rear wheels at speed, like the new reference's dust cloud. The puffs
  // stay where the tyres kicked them up (world space) and expand there —
  // the car's forward motion lays the trail, so they need no backward
  // velocity of their own (a backward kick would blow them past the
  // camera before they can be seen).
  if (Math.abs(car.speed) > 8 && Math.random() < dt * 14) {
    effects.dustTrail(
      car.x - Math.sin(car.heading) * 2, 0.4, car.z - Math.cos(car.heading) * 2,
      0, 0,
      Math.min(1, Math.abs(car.speed) / 40),
    );
  }
  if (Math.abs(car.speed) > 20 && Math.random() < dt * 4) {
    effects.smoke(car.x, 0.6, car.z);
  }
  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;
  audio.engine(Math.abs(car.speed) / 42, true);
}

// Walk for one step: move on foot, and traffic can hit the player.
function walkPlayer(dt, move, cameraYaw) {
  player.step(dt, move, cameraYaw, city.resolveCircle);
  audio.engine(0, false);
  for (const car of traffic.cars) {
    if (distance2D(car.x, car.z, player.x, player.z) < 1.4 && Math.abs(car.speed) > 3) {
      applyDamage(player, 8);
      lastDamageAt = elapsed;
      car.speed *= 0.6;
      audio.crash();
      effects.sparks(player.x, 1, player.z);
      peds.scare(player.x, player.z, 25);
    }
  }
}

// Advance every world system by one step and return the police outcome.
function stepWorld(dt) {
  const allCars = traffic.all().concat(police.copCars);
  traffic.update(dt, allCars);
  peds.update(dt);
  const policeResult = police.update(dt, ctx);
  prevEnemies = combat.enemies.length;
  combat.update(dt, ctx);
  if (combat.enemies.length < prevEnemies) {
    // An enemy went down: loot a little ammo and count the kill.
    player.ammo += 6;
    missions.onKill(ctx);
  }
  missions.update(dt, ctx);
  effects.update(dt);
  city.update(dt, ctx.timeOfDay, player.inCar ? player.inCar : player);
  return policeResult;
}

// HUD + minimap for the current frame, and the best-stats bookkeeping.
function syncHud(dt) {
  const missionTarget = missions.current ? missions.objectiveSpot(missions.currentObjective()) : null;
  const mapState = {
    playerX: player.x,
    playerZ: player.z,
    heading: player.heading,
    trafficCars: traffic.cars,
    copCars: police.copCars,
    missionTarget,
  };
  ctx.lastMapState = mapState;
  hud.update({
    health: player.health,
    armor: player.armor,
    money: save.money,
    wanted: police.wanted,
    // Respect: jobs done + heat earned, like the reference's meter.
    respect: Math.min(100, save.missionsDone * 12 + Math.max(save.bestWanted, police.wanted) * 8),
    speed: player.inCar ? player.inCar.speed : 0,
    inCar: !!player.inCar,
    objective: missions.objectiveText(),
    mission: missions.missionInfo(),
    nextMission: missions.nextMissionInfo(save.missionIndex),
    dispatch: police.dispatchList(player.x, player.z),
    vehicle: player.inCar ? { name: player.inCar.type.label, condition: player.inCar.health } : null,
    radio: audio.currentStation(),
    weapon: { name: player.weapon, ammo: player.ammo },
    district: districtAt(player.x, player.z),
    street: streetAt(player.x, player.z),
    timeOfDay: ctx.timeOfDay,
    day: Math.floor(elapsed / DAY_LENGTH_SECONDS) % 7,
    showCrosshair: !player.inCar && player.weapon === 'pistol',
  });
  save.bestWanted = Math.max(save.bestWanted, police.wanted);
  if (player.inCar) save.bestSpeed = Math.max(save.bestSpeed || 0, Math.round(Math.abs(player.inCar.speed) * 3.6));
  minimapTimer -= dt;
  if (minimapTimer <= 0) {
    minimapTimer = 0.15;
    minimap.draw(mapState);
  }
}

// Camera follows the player (or the car). The field of view widens with
// speed so fast driving feels fast.
function syncCamera(dt, drag, dragY) {
  const focus = player.inCar ? player.inCar : player;
  const focusY = player.inCar ? 1 : player.y;
  updateCamera(camera, focus.x, focusY, focus.z, focus.heading, player, dt, drag, dragY);
  const speed01 = player.inCar ? Math.min(1, Math.abs(player.inCar.speed) / 45) : 0;
  // The speed FOV kick is gentle: a wide lens at speed shrinks the
  // player car in the frame, which is the opposite of the GTA look.
  const targetFov = 62 + speed01 * 8;
  if (Math.abs(camera.fov - targetFov) > 0.2) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
}

function updateGame(dt, scripted) {
  elapsed += dt;
  ctx.timeOfDay = (ctx.timeBase + (elapsed / DAY_LENGTH_SECONDS) * 24) % 24;
  const actions = scripted ? scripted.actions : input.takeActions();
  const drag = scripted ? 0 : input.takeDrag();
  const dragY = scripted ? 0 : input.takeDragY();
  const move = scripted ? scripted.move : input.move();
  if (scripted && scripted.jump) move.jump = true;
  if (!scripted && (actions & ACTION_JUMP)) move.jump = true;

  // One-shot actions.
  if (actions & ACTION_PAUSE) {
    if (ctx.state === 'play') {
      ctx.setState('paused');
      hud.showPause();
      ctx.saveData();
      audio.engine(0, false);
    } else if (ctx.state === 'paused') {
      ctx.setState('play');
      hud.showPlay();
    }
  }
  if (ctx.state !== 'play') return;

  if (actions & ACTION_ENTER_CAR) enterOrExitCar();
  if (actions & ACTION_WEAPON) {
    player.weapon = player.weapon === 'fists' ? 'pistol' : 'fists';
    if (player.weapon === 'pistol' && player.ammo <= 0) {
      hud.showToast('Tidak ada peluru! Selesaikan misi untuk isi ulang.');
      player.weapon = 'fists';
    } else {
      hud.showToast(player.weapon === 'pistol' ? 'Pistol siap. Klik untuk menembak.' : 'Tinju siap. F untuk memukul.');
    }
    player.syncModel();
  }
  if (actions & ACTION_RADIO) {
    const station = audio.cycleStation();
    save.radioStation = station.index;
    ctx.saveData();
    hud.showToast(`${station.name} ${station.freq} — ${station.track}`);
  }
  if (actions & ACTION_HORN && player.inCar) audio.horn();
  if (actions & ACTION_PUNCH && !player.inCar) {
    if (combat.punch(ctx)) {
      audio.punch();
      missions.onPunch(ctx);
    }
  }
  if (actions & ACTION_SHOOT && !player.inCar && player.weapon === 'pistol') {
    if (combat.shoot(ctx)) audio.gunshot();
    else hud.showToast('Tidak ada peluru!');
  }
  if (actions & ACTION_CONFIRM && !missions.isActive()) {
    // Enter also starts a mission when nothing is running.
    if (move.forward === 0 && move.strafe === 0) startNextMission();
  }

  // Player: drive or walk.
  const allCars = traffic.all().concat(police.copCars);
  if (player.inCar) {
    const car = player.inCar;
    const throttle = scripted ? scripted.throttle : move.forward;
    const steer = scripted ? scripted.steer : -move.strafe;
    const handbrake = !scripted && move.run;
    drivePlayerCar(dt, car, throttle, steer, handbrake, allCars);
  } else {
    walkPlayer(dt, move, player.cameraYaw);
  }

  // World systems.
  const policeResult = stepWorld(dt);

  // Slow health regen out of combat: any health drop restarts the timer.
  if (player.health < prevHealth) lastDamageAt = elapsed;
  prevHealth = player.health;
  if (elapsed - lastDamageAt > 6 && player.health > 0 && player.health < 100) {
    player.health = Math.min(100, player.health + 2 * dt);
  }

  // Busted or wasted.
  if (policeResult.busted) {
    respawn('BUSTED');
    return;
  }
  if (gameOverIfNeeded()) return;

  syncHud(dt);
  syncCamera(dt, drag, dragY);
}

// ---- Screens -------------------------------------------------------------
function startGame() {
  audio.unlock();
  audio.startMusic();
  ctx.setState('play');
  hud.showPlay();
  hud.showToast('WASD jalan/nyetir, E masuk mobil, M mulai misi, F pukul, klik tembak.');
  hud.announce('Bermain. WASD untuk bergerak, E untuk masuk mobil, M untuk misi.');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000 || 0, MAX_FRAME);
  last = now;
  if (ctx.state === 'title') {
    const actions = input.takeActions();
    if (actions & (ACTION_CONFIRM | ACTION_SHOOT)) startGame();
    // Slow orbit over the city behind the title screen.
    const t = now * 0.00004;
    camera.position.set(Math.sin(t) * 220, 62, Math.cos(t) * 220);
    camera.lookAt(0, 18, 0);
    city.update(dt, 17.5, { x: 0, z: 0 });
    traffic.update(dt, traffic.all());
    peds.update(dt);
    renderer.render(scene, camera);
    return;
  }
  if (ctx.state === 'paused') {
    const actions = input.takeActions();
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM | ACTION_SHOOT)) {
      ctx.setState('play');
      hud.showPlay();
    }
    renderer.render(scene, camera);
    return;
  }
  if (ctx.state === 'over') {
    const actions = input.takeActions();
    if (actions & (ACTION_CONFIRM | ACTION_SHOOT)) {
      player.health = 100;
      ctx.setState('play');
      hud.showPlay();
    }
    renderer.render(scene, camera);
    return;
  }
  // Play: fixed steps.
  // Full-screen map (Tab): the world freezes, only the scene renders.
  if (ctx.mapOpen) {
    renderer.render(scene, camera);
    return;
  }
  accumulator += dt;
  while (accumulator >= STEP) {
    updateGame(STEP, null);
    accumulator -= STEP;
    if (ctx.state !== 'play') break;
  }
  renderer.render(scene, camera);
}

let last = performance.now();
let accumulator = 0;

// ---- Screenshot staging --------------------------------------------------
function runShot(name) {
  const staged = stageShot(name, ctx);
  // Let the staged scene play forward so police, traffic and the mission
  // are mid-action, then paint and signal readiness.
  const steps = Math.floor(staged.simulateSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    updateGame(STEP, {
      actions: 0,
      move: { forward: 1, strafe: 0, run: false },
      throttle: staged.throttle,
      steer: staged.steer,
      jump: false,
    });
    if (ctx.state !== 'play') break;
  }
  if (staged.orbit) {
    camera.position.set(180, 60, 180);
    camera.lookAt(0, 18, 0);
  } else if (staged.cameraPose) {
    camera.position.set(...staged.cameraPose.pos);
    camera.lookAt(...staged.cameraPose.look);
  }
  if (name === 'mission' && ctx.missions.current) {
    // The staged sim runs synchronously for ~4-5 s of real time in
    // swiftshader, so the banner (4.2 s) and intro dialogue (5 s) shown
    // by startMission expire before the frame is painted. Show them again
    // now, fresh, so the mission shot reads like the game does.
    const cm = ctx.missions.current.mission;
    ctx.hud.showMissionBanner(`MISI ${ctx.missions.current.index + 1} — ${cm.title}`, cm.briefing, 10);
    if (cm.intro) ctx.hud.showDialogue(cm.intro.speaker, cm.intro.line, 8);
  }
  if (name === 'drive' || name === 'chase') {
    // Put two police cars ahead of the player, facing them, so the chase
    // reads in the frame (the rest of the pursuit stays behind the camera).
    const car = ctx.player.inCar;
    if (car) {
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      ctx.police.copCars.slice(0, 2).forEach((cop, i) => {
        const side = i === 0 ? -5 : 5;
        cop.place(
          car.x + fx * 30 - fz * side,
          car.z + fz * 30 + fx * side,
          car.heading + Math.PI,
        );
      });
      // The helicopter hangs ahead in the sky, in the frame: straight down
      // the street corridor so the towers on both sides can't hide it.
      if (name === 'chase') ctx.police.placeHeli(car.heading, car.x, car.z, 35, 60);
    }
    // One last game step after posing the police: the HUD (dispatch
    // distances, speed) was last updated during the sim, before the cops
    // were moved into the frame — refresh it so the panel matches the shot.
    updateGame(STEP, {
      actions: 0,
      move: { forward: 0, strafe: 0, run: false },
      throttle: 0,
      steer: 0,
      jump: false,
    });
    // That step lets police.update drag the helicopter back to its high
    // orbit (52 m, above the frame), so pose it again — low and far down
    // the street corridor, where the camera can actually see it.
    if (name === 'chase') {
      const car = ctx.player.inCar;
      ctx.police.placeHeli(car.heading, car.x, car.z, 28, 60);
      // Upper-LEFT of the frame, like the reference: east is screen-left
      // when looking south down the beach road.
      const heli = ctx.police.heli;
      if (heli) heli.group.position.x += 22;
    }
  }
  // Settle the sun, sky, fog and lamps for the staged hour: the title shot
  // never runs the loop, so without this it would render noon defaults.
  ctx.city.update(0.016, ctx.timeOfDay, ctx.player.inCar ? ctx.player.inCar : ctx.player);
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

if (shot) {
  hud.showTitle();
  runShot(shot);
} else {
  hud.showTitle();
  hud.announce('AshboelPunks. Tekan Enter atau klik untuk mulai.');
  requestAnimationFrame(frame);
}

// Mute toggle (M is missions; use key 0? keep it simple: N toggles mute).
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyN' && !event.repeat) {
    save.muted = !save.muted;
    audio.setMuted(save.muted);
    writeSave(save);
    hud.showToast(save.muted ? 'Suara dimatikan (N untuk nyalakan).' : 'Suara dinyalakan.');
  }
  if (event.code === 'KeyM' && !event.repeat && ctx.state === 'play') {
    startNextMission();
  }
  // Tab toggles the full-screen map; the world freezes while it is open.
  // The fallback state covers the first frame after starting, when no
  // minimap frame has run yet — the map still draws instead of opening
  // blank.
  if (event.code === 'Tab' && !event.repeat && ctx.state === 'play') {
    event.preventDefault();
    ctx.mapOpen = !ctx.mapOpen;
    document.getElementById('map-screen').classList.toggle('hidden', !ctx.mapOpen);
    if (ctx.mapOpen) {
      minimap.drawBig(ctx.lastMapState || {
        playerX: player.x, playerZ: player.z, heading: player.heading,
        trafficCars: traffic.cars, copCars: police.copCars, missionTarget: null,
      });
    }
  }
});
