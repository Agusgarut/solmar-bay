// Cars: a low-poly model built from boxes (body, cabin, wheels, lights) and
// the arcade driving model every car in the game shares — player cars,
// traffic and police alike. No physics engine: velocity, steering and drag
// on a flat plane, with building and car-car collision handled by callers.

import * as THREE from 'three';
import { CAR_ACCEL, CAR_BRAKE, CAR_REVERSE_ACCEL, CAR_MAX_SPEED, CAR_MAX_REVERSE, CAR_TURN, CAR_DRAG, clamp } from './config.js';
import { pick } from './random.js';

// The hero's red: the bright supercar red from the new reference entry,
// not the old hot pink. Every hero call site passes this constant.
export const HERO_RED = 0xe8112d;

export const CAR_TYPES = {
  sedan: { length: 4.4, width: 1.9, accel: 1.0, top: 1.0, color: 0xc23b2e, label: 'Solmar Sedan' },
  coupe: { length: 4.6, width: 2.05, accel: 1.15, top: 1.12, color: 0xff3b30, label: 'Bayfront GT' },
  taxi: { length: 4.4, width: 1.9, accel: 0.95, top: 0.95, color: 0xe8b93b, label: 'Taksi Kuning' },
  van: { length: 5.2, width: 2.1, accel: 0.8, top: 0.85, color: 0x7a7f85, label: 'Van Kargo' },
  sport: { length: 4.9, width: 2.15, accel: 1.35, top: 1.25, color: HERO_RED, label: 'Solmar GT' },
  muscle: { length: 4.9, width: 2.1, accel: 1.25, top: 1.18, color: 0xff7a1a, label: 'Banteng GT' },
  pickup: { length: 5.0, width: 2.0, accel: 0.9, top: 0.95, color: 0x2ea8a0, label: 'Pikap Pantai' },
  convertible: { length: 4.7, width: 2.05, accel: 1.2, top: 1.15, color: 0xff7a1a, label: 'Solmar Cabrio' },
  truck: { length: 5.6, width: 2.2, accel: 0.7, top: 0.8, color: 0xd8d8d8, label: 'Truk Kargo' },
  police: { length: 4.5, width: 1.95, accel: 1.2, top: 1.15, color: 0x1a1d22, label: 'SBPD Interceptor' },
};

const PAINT_COLORS = [HERO_RED, 0xff3b30, 0xff7a1a, 0xffe14f, 0x2ec4b6, 0xc23b2e, 0x2e6fc2, 0xe8b93b, 0x3a9e5f, 0x8a4fc2, 0xd8d8d8, 0x22252a];

// One helper for every box part of a car: build the mesh, place it, and
// (when asked) let it cast a shadow. Almost every car part is a box, so
// this keeps the model code to one line per part. `rx` tilts the box
// around the x-axis — the supercar's sloped hood and fastback deck are
// thin boxes pitched a few degrees, not flat slabs.
function box(group, w, h, d, material, x, y, z, shadow, rx = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  if (rx) mesh.rotation.x = rx;
  if (shadow) mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

// Rounded side-profile body: the car's silhouette drawn as a 2D shape
// (x = along the car, front at +x; y = up) with every corner rounded by
// quadratic curves, extruded across the width with a bevel — so the body
// reads as a sculpted, rounded form from every angle instead of a
// sharp-cornered box. The bevel rounds the side edges; the curves round
// the silhouette (nose, roof, fastback, tail). The long edges stay
// straight: a quadratic between two edge midpoints with the corner as
// control point only bows where the corner itself turns.
function roundedProfileGeometry(points, depth, bevel) {
  const shape = new THREE.Shape();
  const n = points.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(points[n - 1], points[0]);
  shape.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const m = mid(p, q);
    shape.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8,
    bevelSegments: 3, steps: 1, curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  // Shape x (car length, front +x) -> world +z; extrude z -> world x.
  geo.rotateY(-Math.PI / 2);
  return geo;
}

// Body silhouette per class, in fractions of the car's half-length.
// Fast cars get the long low wedge: low nose, low roof, fastback deck
// falling to a short tail face. Ordinary cars get a taller cabin base
// (the glass cabin box sits on top of it). Vans are tall boxes with
// rounded edges; trucks are a low rounded chassis (cab + cargo sit on
// top, as before).
function makeBodyGeometry(typeName, isFast) {
  const type = CAR_TYPES[typeName];
  const hl = type.length / 2;
  let pts;
  if (typeName === 'truck') {
    pts = [[hl, 0.12], [hl, 0.8], [-hl, 0.8], [-hl, 0.12]];
  } else if (typeName === 'van') {
    pts = [[hl, 0.12], [hl, 1.5], [hl * 0.6, 1.62], [-hl * 0.8, 1.62], [-hl, 1.5], [-hl, 0.12]];
  } else if (isFast) {
    const roofH = typeName === 'convertible' ? 0.8 : 1.0;
    pts = [
      [hl, 0.12], [hl, 0.52], [hl * 0.55, 0.66], [hl * 0.18, 0.74],
      [-hl * 0.08, roofH], [-hl * 0.42, roofH - 0.02],
      [-hl * 0.94, 0.58], [-hl * 0.99, 0.42], [-hl * 0.99, 0.12],
    ];
  } else {
    pts = [
      [hl, 0.12], [hl, 0.6], [hl * 0.5, 0.8], [hl * 0.1, 0.88],
      [-hl * 0.5, 0.88], [-hl * 0.85, 0.72], [-hl, 0.55], [-hl, 0.12],
    ];
  }
  return roundedProfileGeometry(pts, type.width - 0.16, 0.08);
}

// Contact shadow: a soft dark ellipse right under the car, so it sits
// ON the asphalt instead of floating above it — the real sun shadow is
// long and soft at golden hour, and this grounds the car even where the
// sun shadow falls far to the side. One shared radial-gradient texture.
let contactShadowTex = null;
function getContactShadowTexture() {
  if (contactShadowTex) return contactShadowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(10, 8, 6, 0.55)');
  grad.addColorStop(0.6, 'rgba(10, 8, 6, 0.32)');
  grad.addColorStop(1, 'rgba(10, 8, 6, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  contactShadowTex = new THREE.CanvasTexture(canvas);
  contactShadowTex.colorSpace = THREE.SRGBColorSpace;
  return contactShadowTex;
}

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

export function createCarModel(typeName, color, rng, hero = false) {
  const type = CAR_TYPES[typeName] || CAR_TYPES.sedan;
  const paint = color !== undefined ? color : pick(rng || Math.random, PAINT_COLORS);
  const group = new THREE.Group();
  const isFast = typeName === 'sport' || typeName === 'coupe' || typeName === 'muscle' || typeName === 'convertible';
  // Fast cars get a small emissive lift in their own paint colour: the
  // chase cam looks at the car's shadow side (the sun is ahead), so
  // without it the red hero reads as a black box. 0.22 keeps the paint
  // glossy red in shadow, not glowing.
  const bodyMat = new THREE.MeshPhongMaterial({
    color: paint, shininess: 110, specular: 0x999999,
    emissive: isFast ? paint : 0x000000, emissiveIntensity: isFast ? 0.22 : 0,
  });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x18242e, shininess: 120, specular: 0xaaaaaa });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const chromeMat = new THREE.MeshPhongMaterial({ color: 0xd8dce2, shininess: 160, specular: 0xffffff });
  // Stance: fast cars sit LOW and WIDE like the reference's red supercar —
  // a lower deck, a lower glasshouse and bigger wheels. Every part below
  // positions off these heights, so the ordinary cars (sedan / taxi / van
  // / truck / pickup / police) keep exactly their old stance.
  const st = isFast ? {
    grilleY: 0.46, slatA: 0.41, slatB: 0.51, bumperY: 0.28,
    mirrorY: 0.88, handleY: 0.8,
    plateY: 0.34, plateFrontY: 0.4,
    cabinH: 0.42, cabinY: 0.94, roofY: 1.02,
    lampY: 0.55, fogY: 0.3, indY: 0.53,
    wingY: 1.42, wheelR: 0.5, wheelW: 0.44, rearW: 0.54,
  } : {
    grilleY: 0.52, slatA: 0.47, slatB: 0.57, bumperY: 0.32,
    mirrorY: 1.06, handleY: 0.95,
    plateY: 0.48, plateFrontY: 0.42,
    cabinH: 0.55, cabinY: 1.1, roofY: 1.5,
    lampY: 0.64, fogY: 0.36, indY: 0.62,
    wingY: 1.22, wheelR: 0.42, wheelW: 0.34, rearW: 0.34,
  };
  // The taillight strips' material, so braking can flare them too.
  let stripMat = null;
  // Plate number: the hero car is always SB-88; the rest vary.
  const plateText = hero
    ? 'SB·88' : `SB·${10 + Math.floor((rng || Math.random)() * 89)}`;

  // The body itself: a rounded, sculpted side profile (extruded + bevel),
  // not a sharp box — the single biggest change against the boxy look.
  // The bevel rounds the side edges, the profile curves round the nose,
  // roof, fastback and tail.
  const body = new THREE.Mesh(makeBodyGeometry(typeName, isFast), bodyMat);
  body.castShadow = true;
  group.add(body);
  // Contact shadow: a soft dark ellipse right under the car.
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(type.width * 1.3, type.length * 1.12),
    new THREE.MeshBasicMaterial({ map: getContactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.6 }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.06;
  group.add(contact);

  // Two-tone roof panel over the cabin, plus a dark grille and bumpers so
  // the car reads as a car at a glance, not a painted box. Convertibles
  // and trucks have their own tops (open top / cargo box) instead — and
  // fast cars skip the body-coloured roof slab, their low dark glass
  // canopy is the roof.
  if (!isFast && typeName !== 'convertible' && typeName !== 'truck') {
    box(group, type.width * 0.84, 0.1, type.length * 0.46, bodyMat, 0, 1.42, -type.length * 0.05, false);
  }
  box(group, type.width * 0.5, 0.18, 0.06, darkMat, 0, st.grilleY, type.length / 2 + 0.02, false);
  // Chrome slats across the grille: the front face needs horizontal detail
  // or it reads as one flat dark slab from the chase cam's 3/4 angle.
  for (const gy of [st.slatA, st.slatB]) {
    box(group, type.width * 0.46, 0.035, 0.03, chromeMat, 0, gy, type.length / 2 + 0.06, false);
  }
  for (const bz of [type.length / 2 - 0.05, -type.length / 2 + 0.05]) {
    box(group, type.width + 0.06, 0.16, 0.22, darkMat, 0, st.bumperY, bz, false);
  }
  // Side mirrors, body-coloured and oversized on purpose: at 1280x720 a
  // 0.12 m mirror is invisible, a 0.2 m one reads as a mirror.
  for (const side of [-1, 1]) {
    box(group, 0.2, 0.12, 0.26, bodyMat, side * (type.width / 2 + 0.09), st.mirrorY, type.length * 0.12, false);
    // Glass face on the mirror's outer side, so the mirror reads as a
    // mirror (dark glass catching the sky) instead of a paint blob.
    box(group, 0.02, 0.09, 0.2, glassMat, side * (type.width / 2 + 0.19), st.mirrorY, type.length * 0.12, false);
    // Door handles, one per side.
    box(group, 0.04, 0.06, 0.3, darkMat, side * (type.width / 2 + 0.01), st.handleY, type.length * 0.08, false);
    // Panel shut line: a thin dark line along the flank, so the body
    // reads as panelled sheet metal, not one flat slab.
    if (isFast) {
      box(group, 0.02, 0.03, type.length * 0.5, darkMat, side * (type.width / 2 + 0.005), 0.62, type.length * 0.05, false);
    }
  }
  // License plates, front and rear: white plates with dark text, so the
  // rear of the car carries a readable mark instead of bare paint.
  const plateTex = makePlateTexture(plateText);
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });
  const plateGeo = new THREE.BoxGeometry(0.72, 0.2, 0.03);
  const plateRear = new THREE.Mesh(plateGeo, plateMat);
  plateRear.position.set(0, st.plateY, -type.length / 2 - 0.06);
  plateRear.rotation.y = Math.PI;
  group.add(plateRear);
  const plateFront = new THREE.Mesh(plateGeo, plateMat);
  plateFront.position.set(0, st.plateFrontY, type.length / 2 + 0.14);
  group.add(plateFront);
  // Rear spoiler on the fast ones, hood scoop on the muscle car.
  // The wing sits HIGH on tall struts with end plates and is painted the
  // body colour: from the 3/4 chase cam it has to read as a wing, not a
  // thin dark line lost against the rear window. On the low supercar
  // stance the wing towers over the fastback deck, like the reference's
  // red car — struts rise from the deck, not from the roof.
  if (isFast) {
    // The wing is the rear silhouette: wider than the body, deeper, and
    // higher (1.42 m) on tall struts rising from the fastback deck, with
    // tall end plates — it has to tower over the deck like the reference
    // supercar's wing, not sit on the roof like a parcel shelf.
    box(group, type.width * 1.06, 0.08, 0.7, bodyMat, 0, st.wingY, -type.length / 2 + 0.22, false);
    for (const side of [-1, 1]) {
      box(group, 0.09, 0.8, 0.09, darkMat, side * (type.width / 2 - 0.32), 1.02, -type.length / 2 + 0.22, false);
      // End plates: vertical fins at each wing tip, the classic GT look.
      box(group, 0.05, 0.5, 0.75, darkMat, side * (type.width / 2 - 0.02), st.wingY, -type.length / 2 + 0.22, false);
    }
    // Front splitter and side skirts: the fast cars sit low and wide, so
    // they read as sports cars from the chase cam, not plain boxes.
    box(group, type.width * 0.94, 0.12, 0.34, darkMat, 0, 0.16, type.length / 2 + 0.06, false);
    for (const side of [-1, 1]) {
      box(group, 0.1, 0.14, type.length * 0.62, darkMat, side * (type.width / 2 + 0.02), 0.2, 0, false);
      // Side air intake behind the front door, so the flank isn't blank.
      box(group, 0.06, 0.22, 0.5, darkMat, side * (type.width / 2 + 0.01), 0.55, -type.length * 0.08, false);
    }
    // Rear diffuser with vertical fins, low at the back and PROTRUDING
    // past the tail face — the rear gets a dark sculpted valance below
    // the tail band, so the back isn't one flat wall.
    box(group, type.width * 0.82, 0.24, 0.3, darkMat, 0, 0.14, -type.length / 2 - 0.1, false);
    for (const fx of [-0.5, -0.17, 0.17, 0.5]) {
      box(group, 0.05, 0.24, 0.3, darkMat, fx * type.width * 0.8, 0.13, -type.length / 2 - 0.12, false);
    }
    // Twin exhaust tips, chrome and oversized, poking out of the diffuser.
    const exhaustGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.26, 12);
    exhaustGeo.rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      const tip = new THREE.Mesh(exhaustGeo, chromeMat);
      tip.position.set(side * (type.width / 2 - 0.42), 0.24, -type.length / 2 - 0.2);
      group.add(tip);
    }
    // Sloped hood: a thin box pitched a few degrees, so the nose reads
    // as a wedge instead of a flat slab. The fastback deck is the body
    // profile itself now (and the sloped rear glass below), not a slab.
    box(group, type.width * 0.8, 0.05, type.length * 0.3, bodyMat, 0, 0.7, type.length * 0.28, false, -0.13);
    // Raised hood panel with a centre ridge, so the front reads sculpted
    // from the 3/4 angle instead of a flat slab.
    box(group, type.width * 0.78, 0.07, type.length * 0.3, bodyMat, 0, 0.72, type.length * 0.26, false);
    box(group, 0.16, 0.08, type.length * 0.28, bodyMat, 0, 0.74, type.length * 0.26, false);
    // Roof antenna fin on the hero car.
    box(group, 0.08, 0.22, 0.4, darkMat, 0, 1.12, -type.length * 0.22, false);
    // Glasshouse that follows the profile: a raked windshield, a thin
    // dark roof panel, and a STEEPLY SLOPED rear glass falling to the
    // tail — from behind you see sloped glass and deck, never a vertical
    // black wall. (The old flat canopy box is gone for exactly that
    // reason.) rx +0.38 tips the windshield's front end down; rx -0.5
    // tips the rear glass's tail end down. Convertibles skip it — they
    // get the open top below instead.
    const hl = type.length / 2;
    if (typeName !== 'convertible') {
      box(group, type.width * 0.8, 0.05, hl * 0.32, glassMat, 0, 0.87, hl * 0.05, false, 0.38);
      // Roof panel in BODY colour, like the reference's red roof — the
      // old dark-glass roof merged with the rear glass into one big
      // black slab on top of the car.
      box(group, type.width * 0.78, 0.05, hl * 0.31, bodyMat, 0, 1.02, -hl * 0.25, false);
      box(group, type.width * 0.8, 0.05, hl * 0.47, glassMat, 0, 0.82, -hl * 0.63, false, -0.5);
    }
    // Thin tail band on the short tail face, with TWO THIN glowing
    // strips at its top edge — the reference's slim taillights, not the
    // old wide pale bar. The band is DARK so the two bright red strips
    // read as two separate lines against it. Both strips share one
    // material, so braking flares them together.
    box(group, type.width * 0.9, 0.16, 0.06, darkMat, 0, 0.54, -type.length / 2 - 0.02, false);
    stripMat = new THREE.MeshLambertMaterial({ color: 0xff2233, emissive: 0xff2233, emissiveIntensity: 2.6 });
    for (const side of [-1, 1]) {
      box(group, type.width * 0.3, 0.07, 0.04, stripMat, side * type.width * 0.27, 0.58, -type.length / 2 - 0.05, false);
    }
  }
  if (typeName === 'muscle') {
    box(group, 0.7, 0.16, 0.9, darkMat, 0, 0.8, type.length * 0.16, false);
  }
  // Pickup bed instead of a closed cabin.
  if (typeName === 'pickup') {
    box(group, type.width * 0.86, 0.3, type.length * 0.32, darkMat, 0, 0.95, -type.length * 0.28, false);
  }

  // Convertible: open top — a raked windshield, a roll bar and two seats
  // you can actually see, instead of a closed glass box. On the low
  // stance the windshield and seats sit lower too, so the cabrio keeps
  // the same sleek profile as the other fast cars.
  if (typeName === 'convertible') {
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.8, 0.5, 0.06), glassMat);
    windshield.position.set(0, 0.92, type.length * 0.14);
    windshield.rotation.x = -0.28;
    group.add(windshield);
    for (const side of [-1, 1]) {
      box(group, 0.08, 0.5, 0.08, darkMat, side * (type.width / 2 - 0.3), 0.94, -type.length * 0.16, false);
      box(group, 0.55, 0.55, 0.45, darkMat, side * 0.42, 0.76, -type.length * 0.06, false);
      box(group, 0.3, 0.22, 0.14, darkMat, side * 0.42, 1.0, -type.length * 0.14, false);
    }
    box(group, type.width * 0.8, 0.08, 0.1, darkMat, 0, 1.14, -type.length * 0.16, false);
  } else if (typeName === 'truck') {
    // Small box truck: a tall cab up front, a cargo box behind it.
    box(group, type.width * 0.92, 1.0, type.length * 0.26, bodyMat, 0, 1.15, type.length * 0.3, true);
    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(type.width * 0.8, 0.5, 0.06), glassMat);
    cabGlass.position.set(0, 1.35, type.length * 0.44);
    group.add(cabGlass);
    box(group, type.width * 0.96, 1.7, type.length * 0.52, new THREE.MeshLambertMaterial({ color: 0xe8e8e2 }), 0, 1.35, -type.length * 0.16, true);
    // Coloured stripe along the cargo box so the truck isn't a white slab.
    for (const side of [-1, 1]) {
      box(group, 0.04, 0.3, type.length * 0.5, new THREE.MeshLambertMaterial({ color: paint }), side * (type.width / 2 + 0.01), 1.5, -type.length * 0.16, false);
    }
  } else {
    box(group, type.width * 0.82, st.cabinH, type.length * 0.48, glassMat, 0, st.cabinY, -type.length * 0.05, true);
  }

  // Headlights and taillights, oversized on purpose: at 1280x720 a 0.34 m
  // lamp is a smudge, a 0.44 m one reads as a lamp. The materials are kept
  // on userData so the game can glow them at sunset and flash the brakes.
  const lightGeo = new THREE.BoxGeometry(0.44, 0.2, 0.08);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 1.0 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0xaa1111, emissiveIntensity: 1.0 });
  const indicatorMat = new THREE.MeshLambertMaterial({ color: 0xffaa22, emissive: 0xff9911, emissiveIntensity: 0.8 });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(lightGeo, headMat);
    head.position.set(side * (type.width / 2 - 0.32), st.lampY, type.length / 2);
    group.add(head);
    // Fast cars carry the thin glowing strips instead of these square
    // lamps, so the tail stays sculpted.
    if (!isFast) {
      const tail = new THREE.Mesh(lightGeo, tailMat);
      tail.position.set(side * (type.width / 2 - 0.32), st.lampY, -type.length / 2);
      group.add(tail);
    }
    // Fog lamps low in the front bumper.
    box(group, 0.2, 0.12, 0.06, headMat, side * (type.width / 2 - 0.42), st.fogY, type.length / 2 + 0.04, false);
    // Amber turn indicators beside the headlights, so the front face has
    // a third lamp colour instead of just white and chrome.
    box(group, 0.16, 0.14, 0.06, indicatorMat, side * (type.width / 2 - 0.62), st.indY, type.length / 2 + 0.02, false);
  }

  // Police light bar, two-tone doors and push bar.
  let lightBar = null;
  if (typeName === 'police') {
    // White door panels over the black body, with SBPD on the side.
    for (const side of [-1, 1]) {
      box(group, 0.04, 0.5, type.length * 0.42, new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }), side * (type.width / 2 + 0.01), 0.6, 0, false);
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.56),
        new THREE.MeshBasicMaterial({ map: makeDoorTextTexture('SBPD'), transparent: true }),
      );
      decal.position.set(side * (type.width / 2 + 0.04), 0.62, 0);
      decal.rotation.y = side * Math.PI / 2;
      group.add(decal);
    }
    box(group, type.width * 0.7, 0.3, 0.14, darkMat, 0, 0.5, type.length / 2 + 0.12, false);
    // White roof panel: the black-and-white livery reads from behind and
    // above, so a police car is never just a black box.
    box(group, type.width * 0.88, 0.06, type.length * 0.5, new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }), 0, 1.5, -type.length * 0.05, false);
    // Oversized light bar: the red/blue flash has to read from 60 m away.
    box(group, 1.5, 0.2, 0.46, darkMat, 0, 1.56, -type.length * 0.05, false);
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1.6 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1.6 });
    box(group, 0.68, 0.26, 0.48, redMat, -0.38, 1.56, -type.length * 0.05, false);
    box(group, 0.68, 0.26, 0.48, blueMat, 0.38, 1.56, -type.length * 0.05, false);
    // Rear deck flashers, same materials so they strobe in sync with the
    // roof bar: the police car has to read as police from behind too.
    box(group, 0.3, 0.16, 0.2, redMat, -0.45, 0.95, -type.length / 2 + 0.35, false);
    box(group, 0.3, 0.16, 0.2, blueMat, 0.45, 0.95, -type.length / 2 + 0.35, false);
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
  // the wheel, so the spokes spin with the tyre. Fast cars get bigger
  // rubber (0.5 m) and WIDER rear tyres than fronts, like the reference
  // supercar's staggered setup; trucks keep their old size, police cars
  // get dark steel rims instead of alloys.
  const wheelRadius = isFast ? st.wheelR : (typeName === 'truck' ? 0.46 : 0.42);
  const wheelWidth = isFast ? st.wheelW : (typeName === 'truck' ? 0.4 : 0.34);
  const rearWidth = isFast ? st.rearW : wheelWidth;
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
  wheelGeo.rotateZ(Math.PI / 2);
  const rearGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, rearWidth, 24);
  rearGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CircleGeometry(wheelRadius * 0.62, 32);
  const rimMat = typeName === 'police'
    ? new THREE.MeshLambertMaterial({ color: 0x3a3d42 })
    : new THREE.MeshBasicMaterial({ map: makeRimTexture() });
  const wheels = [];
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const isRear = wz < 0;
    const wheel = new THREE.Mesh(isRear ? rearGeo : wheelGeo, darkMat);
    // Fast cars sit wide: the rear tyres stick out just past the body, so
    // the rear 3/4 view shows tyre + rim instead of bodywork.
    const outboard = isFast ? type.width / 2 - 0.02 : type.width / 2 - 0.08;
    wheel.position.set(wx * outboard, wheelRadius, wz * (type.length / 2 - 0.75));
    wheel.castShadow = true;
    group.add(wheel);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(wx * ((isRear ? rearWidth : wheelWidth) / 2 + 0.01), 0, 0);
    rim.rotation.y = wx * Math.PI / 2;
    wheel.add(rim);
    wheels.push(wheel);
  }
  // Wheel-arch shells on fast cars: a curved half-cylinder band over
  // each tyre, body-coloured — the fender reads as a rounded arch
  // hugging the wheel, not a square hole cut in a slab. The cylinder's
  // theta half (0..PI) becomes the TOP half after rotateZ(PI/2).
  if (isFast) {
    const archMat = bodyMat.clone();
    archMat.side = THREE.DoubleSide;
    // Two shared geometries (front / rear tyre widths), reused by all
    // four arches — one geometry per car, not per wheel.
    const archGeoF = new THREE.CylinderGeometry(wheelRadius + 0.08, wheelRadius + 0.08, wheelWidth + 0.18, 12, 1, true, 0, Math.PI);
    archGeoF.rotateZ(Math.PI / 2);
    const archGeoR = new THREE.CylinderGeometry(wheelRadius + 0.08, wheelRadius + 0.08, rearWidth + 0.18, 12, 1, true, 0, Math.PI);
    archGeoR.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const isRear = wz < 0;
      const arch = new THREE.Mesh(isRear ? archGeoR : archGeoF, archMat);
      const outboard = type.width / 2 - 0.02;
      arch.position.set(wx * outboard, wheelRadius, wz * (type.length / 2 - 0.75));
      group.add(arch);
    }
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
    if (stripMat) stripMat.emissiveIntensity = on ? 3.6 : 2.6;
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
