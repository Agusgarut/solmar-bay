// Cars: a low-poly model built from boxes (body, cabin, wheels, lights) and
// the arcade driving model every car in the game shares — player cars,
// traffic and police alike. No physics engine: velocity, steering and drag
// on a flat plane, with building and car-car collision handled by callers.

import * as THREE from 'three';
import { CAR_ACCEL, CAR_BRAKE, CAR_REVERSE_ACCEL, CAR_MAX_SPEED, CAR_MAX_REVERSE, CAR_TURN, CAR_DRAG, clamp } from './config.js';
import { pick } from './random.js';

export const CAR_TYPES = {
  sedan: { length: 4.4, width: 1.9, accel: 1.0, top: 1.0, color: 0xc23b2e, label: 'Solmar Sedan' },
  coupe: { length: 4.1, width: 1.85, accel: 1.15, top: 1.12, color: 0xff3b30, label: 'Bayfront GT' },
  taxi: { length: 4.4, width: 1.9, accel: 0.95, top: 0.95, color: 0xe8b93b, label: 'Taksi Kuning' },
  van: { length: 5.2, width: 2.1, accel: 0.8, top: 0.85, color: 0x7a7f85, label: 'Van Kargo' },
  sport: { length: 4.2, width: 1.95, accel: 1.35, top: 1.25, color: 0xff2e88, label: 'Solmar GT' },
  muscle: { length: 4.6, width: 2.0, accel: 1.25, top: 1.18, color: 0xff7a1a, label: 'Banteng GT' },
  pickup: { length: 5.0, width: 2.0, accel: 0.9, top: 0.95, color: 0x2ea8a0, label: 'Pikap Pantai' },
  convertible: { length: 4.2, width: 1.95, accel: 1.2, top: 1.15, color: 0xff7a1a, label: 'Solmar Cabrio' },
  truck: { length: 5.6, width: 2.2, accel: 0.7, top: 0.8, color: 0xd8d8d8, label: 'Truk Kargo' },
  police: { length: 4.5, width: 1.95, accel: 1.2, top: 1.15, color: 0x1a1d22, label: 'SBPD Interceptor' },
};

const PAINT_COLORS = [0xff2e88, 0xff3b30, 0xff7a1a, 0xffe14f, 0x2ec4b6, 0xc23b2e, 0x2e6fc2, 0xe8b93b, 0x3a9e5f, 0x8a4fc2, 0xd8d8d8, 0x22252a];

function makeDoorTextTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 128, 48);
  g.font = '900 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#101216';
  g.fillText(text, 64, 26);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// License plate: white plate, dark border, navy text — readable from the
// chase cam, so every car carries an identity, not a blank bumper.
function makePlateTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f2f2ee';
  g.fillRect(0, 0, 128, 32);
  g.strokeStyle = '#1c2f4a';
  g.lineWidth = 3;
  g.strokeRect(2, 2, 124, 28);
  g.font = '900 20px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#1c2f4a';
  g.fillText(text, 64, 17);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Alloy rim face: silver disc with five dark spokes and a centre cap.
// One texture, shared by every wheel — the spokes have to read at 1280x720,
// so they are drawn chunky, not hairline.
let rimTexture = null;
function makeRimTexture() {
  if (rimTexture) return rimTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#c8ccd2';
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2a2d33';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#2a2d33';
  for (let i = 0; i < 5; i += 1) {
    g.save();
    g.translate(64, 64);
    g.rotate((i * Math.PI * 2) / 5);
    g.fillRect(-8, -56, 16, 50);
    g.restore();
  }
  g.fillStyle = '#c8ccd2';
  g.beginPath();
  g.arc(64, 64, 18, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a2d33';
  g.beginPath();
  g.arc(64, 64, 9, 0, Math.PI * 2);
  g.fill();
  rimTexture = new THREE.CanvasTexture(canvas);
  rimTexture.colorSpace = THREE.SRGBColorSpace;
  return rimTexture;
}

export function createCarModel(typeName, color, rng) {
  const type = CAR_TYPES[typeName] || CAR_TYPES.sedan;
  const paint = color !== undefined ? color : pick(rng || Math.random, PAINT_COLORS);
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color: paint, shininess: 90, specular: 0x777777 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x18242e, shininess: 120, specular: 0xaaaaaa });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const chromeMat = new THREE.MeshPhongMaterial({ color: 0xd8dce2, shininess: 160, specular: 0xffffff });
  const isFast = typeName === 'sport' || typeName === 'coupe' || typeName === 'muscle' || typeName === 'convertible';
  // The taillight strip's material, so braking can flare it too.
  let stripMat = null;
  // Plate number: the hero pink car is always SB-88; the rest vary.
  const plateText = typeName === 'sport' && paint === 0xff2e88
    ? 'SB·88' : `SB·${10 + Math.floor((rng || Math.random)() * 89)}`;

  const body = new THREE.Mesh(new THREE.BoxGeometry(type.width, 0.62, type.length), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  // Two-tone roof panel over the cabin, plus a dark grille and bumpers so
  // the car reads as a car at a glance, not a painted box. Convertibles
  // and trucks have their own tops (open top / cargo box) instead.
  if (typeName !== 'convertible' && typeName !== 'truck') {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.84, 0.1, type.length * 0.46), bodyMat);
    roof.position.set(0, 1.42, -type.length * 0.05);
    group.add(roof);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.5, 0.18, 0.06), darkMat);
  grille.position.set(0, 0.52, type.length / 2 + 0.02);
  group.add(grille);
  // Chrome slats across the grille: the front face needs horizontal detail
  // or it reads as one flat dark slab from the chase cam's 3/4 angle.
  for (const gy of [0.47, 0.57]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.46, 0.035, 0.03), chromeMat);
    slat.position.set(0, gy, type.length / 2 + 0.06);
    group.add(slat);
  }
  for (const bz of [type.length / 2 - 0.05, -type.length / 2 + 0.05]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(type.width + 0.06, 0.16, 0.22), darkMat);
    bumper.position.set(0, 0.32, bz);
    group.add(bumper);
  }
  // Side mirrors, body-coloured and oversized on purpose: at 1280x720 a
  // 0.12 m mirror is invisible, a 0.2 m one reads as a mirror.
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.26), bodyMat);
    mirror.position.set(side * (type.width / 2 + 0.09), 1.06, type.length * 0.12);
    group.add(mirror);
    // Door handles, one per side.
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.3), darkMat);
    handle.position.set(side * (type.width / 2 + 0.01), 0.95, type.length * 0.08);
    group.add(handle);
  }
  // License plates, front and rear: white plates with dark text, so the
  // rear of the car carries a readable mark instead of bare paint.
  const plateTex = makePlateTexture(plateText);
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });
  const plateGeo = new THREE.BoxGeometry(0.72, 0.2, 0.03);
  const plateRear = new THREE.Mesh(plateGeo, plateMat);
  plateRear.position.set(0, 0.48, -type.length / 2 - 0.06);
  plateRear.rotation.y = Math.PI;
  group.add(plateRear);
  const plateFront = new THREE.Mesh(plateGeo, plateMat);
  plateFront.position.set(0, 0.42, type.length / 2 + 0.14);
  group.add(plateFront);
  // Rear spoiler on the fast ones, hood scoop on the muscle car.
  // The wing sits HIGH on tall struts with end plates and is painted the
  // body colour: from the 3/4 chase cam it has to read as a wing, not a
  // thin dark line lost against the rear window.
  if (isFast) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.95, 0.09, 0.55), bodyMat);
    wing.position.set(0, 1.22, -type.length / 2 + 0.18);
    group.add(wing);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.36, 0.09), darkMat);
      strut.position.set(side * (type.width / 2 - 0.32), 1.0, -type.length / 2 + 0.18);
      group.add(strut);
      // End plates: vertical fins at each wing tip, the classic GT look.
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.6), darkMat);
      plate.position.set(side * (type.width / 2 - 0.02), 1.2, -type.length / 2 + 0.18);
      group.add(plate);
    }
    // Front splitter and side skirts: the fast cars sit low and wide, so
    // they read as sports cars from the chase cam, not plain boxes.
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.94, 0.12, 0.34), darkMat);
    splitter.position.set(0, 0.2, type.length / 2 + 0.06);
    group.add(splitter);
    for (const side of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, type.length * 0.62), darkMat);
      skirt.position.set(side * (type.width / 2 + 0.02), 0.24, 0);
      group.add(skirt);
      // Side air intake behind the front door, so the flank isn't blank.
      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.5), darkMat);
      intake.position.set(side * (type.width / 2 + 0.01), 0.62, -type.length * 0.08);
      group.add(intake);
    }
    // Rear diffuser with vertical fins, low at the back — the rear face
    // gets a second dark layer below the bumper so it isn't one flat wall.
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.82, 0.2, 0.3), darkMat);
    diffuser.position.set(0, 0.18, -type.length / 2 - 0.02);
    group.add(diffuser);
    for (const fx of [-0.5, -0.17, 0.17, 0.5]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.3), darkMat);
      fin.position.set(fx * type.width * 0.8, 0.16, -type.length / 2 - 0.04);
      group.add(fin);
    }
    // Twin exhaust tips, chrome and oversized, poking out of the diffuser.
    const exhaustGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.26, 10);
    exhaustGeo.rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      const tip = new THREE.Mesh(exhaustGeo, chromeMat);
      tip.position.set(side * (type.width / 2 - 0.42), 0.3, -type.length / 2 - 0.12);
      group.add(tip);
    }
    // Raised hood panel with a centre ridge, so the front reads sculpted
    // from the 3/4 angle instead of a flat slab.
    const hood = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.78, 0.07, type.length * 0.3), bodyMat);
    hood.position.set(0, 0.9, type.length * 0.26);
    group.add(hood);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, type.length * 0.28), bodyMat);
    ridge.position.set(0, 0.93, type.length * 0.26);
    group.add(ridge);
    // Roof antenna fin on the hero car.
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.4), darkMat);
    fin.position.set(0, 1.56, -type.length * 0.22);
    group.add(fin);
    // Two-tone white roof: the hero car reads bright from behind and
    // above, not as a dark slab.
    const whiteRoof = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.88, 0.06, type.length * 0.44), new THREE.MeshLambertMaterial({ color: 0xf2f2ee }));
    whiteRoof.position.set(0, 1.5, -type.length * 0.05);
    group.add(whiteRoof);
    // Rear light strip: a glowing bar across the back, so the car reads
    // from behind at dusk. Brighter than before, and it flares on braking.
    stripMat = new THREE.MeshLambertMaterial({ color: 0xff5e8a, emissive: 0xff2e88, emissiveIntensity: 2.0 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.92, 0.16, 0.06), stripMat);
    strip.position.set(0, 0.66, -type.length / 2 - 0.02);
    group.add(strip);
  }
  if (typeName === 'muscle') {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.9), darkMat);
    scoop.position.set(0, 0.92, type.length * 0.16);
    group.add(scoop);
  }
  // Pickup bed instead of a closed cabin.
  if (typeName === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.86, 0.3, type.length * 0.32), darkMat);
    bed.position.set(0, 0.95, -type.length * 0.28);
    group.add(bed);
  }

  // Convertible: open top — a raked windshield, a roll bar and two seats
  // you can actually see, instead of a closed glass box.
  if (typeName === 'convertible') {
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.8, 0.5, 0.06), glassMat);
    windshield.position.set(0, 1.18, type.length * 0.14);
    windshield.rotation.x = -0.28;
    group.add(windshield);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), darkMat);
      post.position.set(side * (type.width / 2 - 0.3), 1.2, -type.length * 0.16);
      group.add(post);
    }
    const rollBar = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.8, 0.08, 0.1), darkMat);
    rollBar.position.set(0, 1.46, -type.length * 0.16);
    group.add(rollBar);
    for (const side of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.45), darkMat);
      seat.position.set(side * 0.42, 0.95, -type.length * 0.06);
      group.add(seat);
      const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.14), darkMat);
      headrest.position.set(side * 0.42, 1.32, -type.length * 0.14);
      group.add(headrest);
    }
  } else if (typeName === 'truck') {
    // Small box truck: a tall cab up front, a cargo box behind it.
    const cab = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.92, 1.0, type.length * 0.26), bodyMat);
    cab.position.set(0, 1.15, type.length * 0.3);
    cab.castShadow = true;
    group.add(cab);
    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.8, 0.5, 0.06), glassMat);
    cabGlass.position.set(0, 1.35, type.length * 0.44);
    group.add(cabGlass);
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.96, 1.7, type.length * 0.52), new THREE.MeshLambertMaterial({ color: 0xe8e8e2 }));
    cargo.position.set(0, 1.35, -type.length * 0.16);
    cargo.castShadow = true;
    group.add(cargo);
    // Coloured stripe along the cargo box so the truck isn't a white slab.
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, type.length * 0.5), new THREE.MeshLambertMaterial({ color: paint }));
      stripe.position.set(side * (type.width / 2 + 0.01), 1.5, -type.length * 0.16);
      group.add(stripe);
    }
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.82, 0.55, type.length * 0.48), glassMat);
    cabin.position.set(0, 1.1, -type.length * 0.05);
    cabin.castShadow = true;
    group.add(cabin);
  }

  // Headlights and taillights, oversized on purpose: at 1280x720 a 0.34 m
  // lamp is a smudge, a 0.44 m one reads as a lamp. The materials are kept
  // on userData so the game can glow them at sunset and flash the brakes.
  const lightGeo = new THREE.BoxGeometry(0.44, 0.2, 0.08);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 1.0 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0xaa1111, emissiveIntensity: 1.0 });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(lightGeo, headMat);
    head.position.set(side * (type.width / 2 - 0.32), 0.64, type.length / 2);
    group.add(head);
    const tail = new THREE.Mesh(lightGeo, tailMat);
    tail.position.set(side * (type.width / 2 - 0.32), 0.64, -type.length / 2);
    group.add(tail);
    // Fog lamps low in the front bumper.
    const fog = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.06), headMat);
    fog.position.set(side * (type.width / 2 - 0.42), 0.36, type.length / 2 + 0.04);
    group.add(fog);
  }

  // Police light bar, two-tone doors and push bar.
  let lightBar = null;
  if (typeName === 'police') {
    // White door panels over the black body, with SBPD on the side.
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, type.length * 0.42), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      door.position.set(side * (type.width / 2 + 0.01), 0.6, 0);
      group.add(door);
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.56),
        new THREE.MeshBasicMaterial({ map: makeDoorTextTexture('SBPD'), transparent: true }),
      );
      decal.position.set(side * (type.width / 2 + 0.04), 0.62, 0);
      decal.rotation.y = side * Math.PI / 2;
      group.add(decal);
    }
    const pushBar = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.7, 0.3, 0.14), darkMat);
    pushBar.position.set(0, 0.5, type.length / 2 + 0.12);
    group.add(pushBar);
    // White roof panel: the black-and-white livery reads from behind and
    // above, so a police car is never just a black box.
    const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.88, 0.06, type.length * 0.5), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    roofPanel.position.set(0, 1.5, -type.length * 0.05);
    group.add(roofPanel);
    // Oversized light bar: the red/blue flash has to read from 60 m away.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.46), darkMat);
    bar.position.set(0, 1.56, -type.length * 0.05);
    group.add(bar);
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1.6 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1.6 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 0.48), redMat);
    red.position.set(-0.38, 1.56, -type.length * 0.05);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 0.48), blueMat);
    blue.position.set(0.38, 1.56, -type.length * 0.05);
    group.add(blue);
    // Rear deck flashers, same materials so they strobe in sync with the
    // roof bar: the police car has to read as police from behind too.
    const rearRed = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.2), redMat);
    rearRed.position.set(-0.45, 0.95, -type.length / 2 + 0.35);
    group.add(rearRed);
    const rearBlue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.2), blueMat);
    rearBlue.position.set(0.45, 0.95, -type.length / 2 + 0.35);
    group.add(rearBlue);
    // SBPD on the trunk, facing rear — the car ahead of you in a chase
    // needs to say who it is.
    const rearDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.5),
      new THREE.MeshBasicMaterial({ map: makeDoorTextTexture('SBPD'), transparent: true }),
    );
    rearDecal.position.set(0, 0.62, -type.length / 2 - 0.03);
    rearDecal.rotation.y = Math.PI;
    group.add(rearDecal);
    // A-pillar spotlight on the driver's side.
    const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 8), chromeMat);
    spot.rotation.z = Math.PI / 2;
    spot.position.set(-(type.width / 2 + 0.08), 1.2, type.length * 0.18);
    group.add(spot);
    lightBar = { redMat, blueMat };
  }

  // Wheels: chunky tyres that poke out of the bodywork, with a 5-spoke
  // alloy rim face on the outside of each one — the rim disc is a child of
  // the wheel, so the spokes spin with the tyre. Fast cars and trucks get
  // bigger rubber; police cars get dark steel rims instead of alloys.
  const wheelRadius = isFast || typeName === 'truck' ? 0.46 : 0.42;
  const wheelWidth = isFast || typeName === 'truck' ? 0.4 : 0.34;
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CircleGeometry(wheelRadius * 0.62, 20);
  const rimMat = typeName === 'police'
    ? new THREE.MeshLambertMaterial({ color: 0x3a3d42 })
    : new THREE.MeshBasicMaterial({ map: makeRimTexture() });
  const wheels = [];
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    // Fast cars sit wide: the rear tyres stick out just past the body, so
    // the rear 3/4 view shows tyre + rim instead of bodywork.
    const outboard = isFast ? type.width / 2 - 0.02 : type.width / 2 - 0.08;
    wheel.position.set(wx * outboard, wheelRadius, wz * (type.length / 2 - 0.75));
    wheel.castShadow = true;
    group.add(wheel);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(wx * (wheelWidth / 2 + 0.01), 0, 0);
    rim.rotation.y = wx * Math.PI / 2;
    wheel.add(rim);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  group.userData.type = type;
  group.userData.headMat = headMat;
  group.userData.tailMat = tailMat;
  group.userData.lightBar = lightBar;
  group.userData.setLights = (level) => {
    headMat.emissiveIntensity = 0.7 + level * 1.6;
  };
  group.userData.setBraking = (on) => {
    tailMat.emissiveIntensity = on ? 2.6 : 1.0;
    if (stripMat) stripMat.emissiveIntensity = on ? 3.4 : 2.0;
  };
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

  // Headlight glow follows the time of day (traffic calls this).
  setLights(level) {
    if (this.model.userData.setLights) this.model.userData.setLights(level);
  }

  // Brake lights flare while the brakes are on.
  setBraking(on) {
    if (this.model.userData.setBraking) this.model.userData.setBraking(on);
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
