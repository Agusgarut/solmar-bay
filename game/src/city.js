// Solmar Bay itself: ground, beach and water, the road grid with traffic
// lights and crosswalks, sidewalks, parks, and district-by-district
// buildings — glass towers downtown, low terracotta Old Town, warehouses in
// Industrial, hotels on Beachfront — plus the landmarks (Solmar Tower, the
// lighthouse, the ferris wheel, the pier), neon signs, palms and street
// lamps, and the sun and day/night cycle. Also owns the collision boxes the
// rest of the game tests against, and the road helpers traffic uses.

import * as THREE from 'three';
import { ROAD_POSITIONS, ROAD_WIDTH, WORLD_HALF, BEACH_X, WATER_X, SAND_X0, WATERLINE_X, PALETTE, BUILDING_CORNER_MAX, BUILDING_BEVEL, BUILDING_SETBACK_CHANCE, BUILDING_BALCONY_CHANCE, BUILDING_ARCADE_CHANCE, clamp, lerp } from './config.js';
import { pick, range, gauss } from './random.js';

// Warm pastel facades, varied like the entries on the feed: pink, orange
// and teal next to the sand and cream, so no two streets look alike.
const FACADE_COLORS = ['#e8a89a', '#f0b27a', '#8fc4b8', '#f2d06b', '#d9a0c0', '#d9b48f', '#c98a6b', '#b8c4c4', '#e0cfa8', '#a8b8c4'];
const GLASS_COLORS = ['#7fa8c4', '#5f8aa8', '#8fb4c8'];

function makeFacadeTexture(rng, base, glass, litChance) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Window grid: some lit warm, most dark glass; glass towers get denser,
  // bluer windows. Warm seafront facades get many more lit windows —
  // golden-hour rooms glowing, like the reference's beachfront.
  const rows = glass ? 16 : 12;
  const cols = glass ? 8 : 6;
  const chance = litChance !== undefined ? litChance : (glass ? 0.2 : 0.28);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lit = rng() < chance;
      g.fillStyle = lit ? (rng() < 0.75 ? '#ffd98a' : '#ffab5c') : glass ? '#274b63' : '#2e4250';
      g.fillRect(6 + col * (128 / cols), 8 + row * (256 / rows), 128 / cols - 6, 256 / rows - 7);
      // A thin frame around every window, so the facade reads as framed
      // openings rather than flat dark rectangles pasted on a wall.
      g.strokeStyle = 'rgba(255,255,255,0.20)';
      g.lineWidth = 1;
      g.strokeRect(6 + col * (128 / cols) + 0.5, 8 + row * (256 / rows) + 0.5, 128 / cols - 7, 256 / rows - 8);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeRoadTexture() {
  // Canvas is wide: the lines run along U, the road's long axis.
  // DARK asphalt like the reference (double yellow centre lines, white
  // edge lines), never wide brown — the road must read as a sunlit city
  // street, not a desert. Subtle tonal variation + tyre tracks along the
  // wheel lines keep it from reading flat, and the yellow lines stay
  // crisp so the lane reads at a glance.
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  // Light cool-grey base: sunlit asphalt like the new reference — light
  // enough to read bright at sunset, grey enough to stay asphalt, never
  // a brown desert. Round 13: the old warm-grey base (#6e675c) plus the
  // warm emissive and warm sheen stacked into brown-tan in the drive
  // shot — the base is lighter and cooler now, and the warm sun does
  // the warming; the base stays grey.
  g.fillStyle = '#8d8880';
  g.fillRect(0, 0, 512, 64);
  // Soft tonal blotches: low alpha so the 512px tile repeats without an
  // obvious seam, just enough grain to break the flat colour.
  for (let i = 0; i < 26; i += 1) {
    const light = rng01() < 0.5;
    g.fillStyle = light ? 'rgba(150, 142, 130, 0.10)' : 'rgba(40, 36, 32, 0.10)';
    const w = 20 + rng01() * 60;
    const h = 6 + rng01() * 18;
    g.fillRect(rng01() * 512, rng01() * 64, w, h);
  }
  // Tyre tracks: darker bands along the wheel lines, constant along U so
  // they tile seamlessly down the whole road.
  g.fillStyle = 'rgba(40, 36, 32, 0.13)';
  g.fillRect(0, 12, 512, 7);
  g.fillRect(0, 45, 512, 7);
  // Fine grain: hundreds of tiny speckles, so the asphalt reads as
  // textured aggregate at close range instead of a flat grey slab.
  for (let i = 0; i < 900; i += 1) {
    const v = rng01();
    g.fillStyle = v < 0.5 ? 'rgba(255, 244, 224, 0.05)' : 'rgba(20, 16, 12, 0.06)';
    g.fillRect(rng01() * 512, rng01() * 64, 1 + rng01() * 1.5, 1);
  }
  // Sunlit sheen band on the sun side of the road — cooler and weaker
  // than before, so it reads as hazy light on grey asphalt, not a warm
  // wash turning the whole road tan.
  const sheen = g.createLinearGradient(0, 0, 0, 20);
  sheen.addColorStop(0, 'rgba(255, 242, 222, 0.13)');
  sheen.addColorStop(1, 'rgba(255, 242, 222, 0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, 512, 20);
  // Double yellow centre lines, 1 px thin and close together like the
  // reference's — the old 2-3 px lines read as fat yellow slabs at speed.
  // Slightly worn: a few short faded gaps, so the markings read used,
  // not freshly painted.
  g.fillStyle = '#f2c230';
  g.fillRect(0, 31, 512, 1);
  g.fillRect(0, 33, 512, 1);
  for (let i = 0; i < 14; i += 1) {
    g.fillStyle = 'rgba(141, 136, 128, 0.55)';
    g.fillRect(rng01() * 512, 31, 3 + rng01() * 8, 3);
  }
  // White edge lines.
  g.fillStyle = '#e8e4da';
  g.fillRect(0, 3, 512, 2);
  g.fillRect(0, 59, 512, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(45, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Sand texture: dry pale sand at the promenade edge fading to a darker
// wet band at the waterline, with fine speckle — the beach reads as sand
// with a shoreline, not a flat yellow slab.
function makeSandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, '#e8d29a');
  grad.addColorStop(0.7, '#dfc68e');
  grad.addColorStop(1, '#c9a86e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 500; i += 1) {
    const v = rng01();
    g.fillStyle = v < 0.5 ? 'rgba(255, 244, 210, 0.08)' : 'rgba(120, 95, 50, 0.08)';
    g.fillRect(rng01() * 128, rng01() * 256, 1 + rng01() * 2, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Tiny deterministic pseudo-random for texture painting (not the seeded
// world rng — textures must not consume it).
let texSeed = 1234567;
function rng01() {
  texSeed = (texSeed * 1103515245 + 12345) % 2147483648;
  return texSeed / 2147483648;
}

function makeSignTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#14101c';
  g.fillRect(0, 0, 256, 64);
  g.font = '900 38px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 16;
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Rounded-corner building mass: the footprint is a rounded rectangle
// (quadratic corners) extruded up with a bevel, so no building is a
// sharp-cornered slab — the same rounded-extrude trick the cars use
// (round 9), applied to architecture. ExtrudeGeometry's side walls take
// UVs in shape units (metres), so a facade texture with repeat 1/20,
// 1/24 tiles every 20 m across and 24 m up; material 0 is the lids
// (roof), material 1 the walls. The bevel bulges the mass slightly at
// the base and the roofline, like a plinth and a cornice.
function roundedRectShape(w, d, r) {
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hd = d / 2;
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  shape.closePath();
  return shape;
}

function extrudeMass(w, d, h, r) {
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r), {
    depth: h, bevelEnabled: true, bevelThickness: BUILDING_BEVEL,
    bevelSize: BUILDING_BEVEL * 0.8, bevelSegments: 2, steps: 1, curveSegments: 6,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, BUILDING_BEVEL, 0);
  return geo;
}

function blockRanges() {
  // Gaps between the roads (road width 14, so 7 each side) plus the edges.
  const ranges = [];
  for (let i = 0; i < ROAD_POSITIONS.length; i += 1) {
    const x0 = i === 0 ? -WORLD_HALF : ROAD_POSITIONS[i - 1] + ROAD_WIDTH / 2;
    const x1 = ROAD_POSITIONS[i] - ROAD_WIDTH / 2;
    ranges.push([x0, x1]);
  }
  ranges.push([ROAD_POSITIONS[ROAD_POSITIONS.length - 1] + ROAD_WIDTH / 2, WORLD_HALF]);
  return ranges;
}

function districtOf(cx, cz) {
  if (cx > -90 && cx < 90 && cz > -180 && cz < 180) return 'downtown';
  if (cx > 90 && cz < -90) return 'industrial';
  if (cx > 90) return 'beachfront';
  if (cz > 180) return 'marina';
  return 'oldtown';
}

export function buildCity(scene, rng) {
  const colliders = [];
  const lamps = [];
  const facadeMats = [];
  const trafficHeads = [];
  const boats = [];
  const group = new THREE.Group();
  scene.add(group);

  // Ground: city slab, then sand, then water to the east. The slab ENDS
  // at the waterline (x=348) — it used to run to x=400, burying the sea
  // under green ground so the ocean only showed past 85 m of land.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WATERLINE_X + WORLD_HALF + 40, WORLD_HALF * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x6f7f5a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((WATERLINE_X - WORLD_HALF - 40) / 2, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    // The beach is a NARROW 26 m strip of sand: from the promenade
    // (x=322) to the waterline (x=348), so the Ocean boulevard (x=315)
    // has the sea right beside it — the ocean fills the frame when
    // driving south, instead of a thin strip past 78 m of sand.
    new THREE.PlaneGeometry(WATERLINE_X - SAND_X0, WORLD_HALF * 2),
    // A touch of warm emissive: the sand sits in the hotels' long shadows
    // at golden hour, and without it the beach reads grey-green, not sand.
    // Kept low (0.12) so shadowed sand still reads as shadow.
    new THREE.MeshLambertMaterial({ map: makeSandTexture(), emissive: 0x8a7a4a, emissiveIntensity: 0.12 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((SAND_X0 + WATERLINE_X) / 2, 0.03, 0);
  sand.receiveShadow = true;
  group.add(sand);

  // The sea: bright turquoise with a sun glitter, so it reads as ocean at
  // golden hour — a flat Lambert teal under a low sun goes muddy grey.
  // The teal emissive keeps it turquoise even where the low sun only
  // grazes it; the orange sunset glint is a small extra on top.
  const waterMat = new THREE.MeshPhongMaterial({ color: 0x2f8fb0, emissive: 0x1a7a99, emissiveIntensity: 0.3, shininess: 90, specular: 0xaaddff });
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(560, WORLD_HALF * 2 + 400),
    waterMat,
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WATERLINE_X + 280, -0.5, 0);
  group.add(water);

  // Surf foam: three thin white strips along the shoreline, sliding in
  // and out with the swell so the sea reads alive, not a flat blue slab.
  const foamGeo = new THREE.PlaneGeometry(3, WORLD_HALF * 2 + 400);
  foamGeo.rotateX(-Math.PI / 2);
  const foams = [];
  for (const [fx, op] of [[WATERLINE_X + 4, 0.5], [WATERLINE_X + 9, 0.35], [WATERLINE_X + 14, 0.22]]) {
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false });
    const foam = new THREE.Mesh(foamGeo, foamMat);
    foam.position.set(fx, -0.15, 0);
    group.add(foam);
    foams.push({ mesh: foam, baseX: fx, phase: fx * 0.7 });
  }

  // Roads with dashed centre lines, and sidewalks along their edges.
  // Geometries are pre-rotated flat (rotateY turns a road along X into one
  // along Z), so no per-mesh Euler guesswork is needed.
  const roadTexture = makeRoadTexture();
  // Sunlit lift: a little COOL emissive so the asphalt reads bright in
  // the sunset instead of going dark brown under the pink sky. Round 13:
  // the old warm emissive (0xffc08a) was the main brown culprit — a warm
  // glow on a warm-grey base turned the whole road tan. Cool grey-blue
  // lift keeps the road grey; the sun still warms it from above.
  const roadMat = new THREE.MeshPhongMaterial({ map: roadTexture, emissive: 0xb9c2cc, emissiveIntensity: 0.1, shininess: 14, specular: 0x4a5058 });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const roadGeoX = new THREE.PlaneGeometry(WORLD_HALF * 2, ROAD_WIDTH);
  roadGeoX.rotateX(-Math.PI / 2);
  const roadGeoZ = roadGeoX.clone();
  roadGeoZ.rotateY(Math.PI / 2);
  const walkGeoX = new THREE.PlaneGeometry(WORLD_HALF * 2, 5);
  walkGeoX.rotateX(-Math.PI / 2);
  const walkGeoZ = walkGeoX.clone();
  walkGeoZ.rotateY(Math.PI / 2);
  for (const p of ROAD_POSITIONS) {
    for (const axis of ['x', 'z']) {
      const road = new THREE.Mesh(axis === 'x' ? roadGeoX : roadGeoZ, roadMat);
      road.position.set(axis === 'x' ? 0 : p, 0.02, axis === 'x' ? p : 0);
      road.receiveShadow = true;
      group.add(road);
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(axis === 'x' ? walkGeoX : walkGeoZ, walkMat);
        const off = side * (ROAD_WIDTH / 2 + 2.5);
        walk.position.set(axis === 'x' ? 0 : p + off, 0.05, axis === 'x' ? p + off : 0);
        walk.receiveShadow = true;
        group.add(walk);
      }
    }
  }

  // Crosswalks at every major intersection: striped planes, so every
  // crossing a drive passes reads as a real crossing, not bare asphalt.
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 128;
  stripeCanvas.height = 64;
  const sg = stripeCanvas.getContext('2d');
  sg.fillStyle = '#54514b';
  sg.fillRect(0, 0, 128, 64);
  sg.fillStyle = '#f5f2e8';
  for (let i = 0; i < 6; i += 1) sg.fillRect(6 + i * 21, 6, 10, 52);
  const stripeTex = new THREE.CanvasTexture(stripeCanvas);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  const crossGeo = new THREE.PlaneGeometry(14, 7);
  crossGeo.rotateX(-Math.PI / 2);
  const crossGeoZ = crossGeo.clone();
  crossGeoZ.rotateY(Math.PI / 2);
  const crossMat = new THREE.MeshLambertMaterial({ map: stripeTex });
  for (const ix of [-135, -45, 45, 135]) {
    for (const iz of [-135, -45, 45, 135]) {
      for (const [dx, dz, geo] of [[-11, 0, crossGeoZ], [11, 0, crossGeoZ], [0, -11, crossGeo], [0, 11, crossGeo]]) {
        const cross = new THREE.Mesh(geo, crossMat);
        cross.position.set(ix + dx, 0.04, iz + dz);
        cross.receiveShadow = true;
        group.add(cross);
      }
    }
  }

  // Stop signs at a few intersections: a red octagon on a pole, so the
  // street furniture reads at a glance from the chase cam.
  const stopGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.06, 8);
  stopGeo.rotateX(Math.PI / 2);
  const stopMat = new THREE.MeshLambertMaterial({ color: 0xc22222, emissive: 0x881111, emissiveIntensity: 0.4 });
  const stopPoleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const stopPoleGeo = new THREE.CylinderGeometry(0.07, 0.09, 2.6, 8);
  for (const [sx, sz, rotY] of [
    [-45, -54, 0], [45, 54, Math.PI], [-135, 36, Math.PI / 2], [135, -36, -Math.PI / 2],
    [45, -54, 0], [-45, 54, Math.PI], [225, -54, 0], [-225, 54, Math.PI],
  ]) {
    const pole = new THREE.Mesh(stopPoleGeo, stopPoleMat);
    pole.position.set(sx, 1.3, sz);
    group.add(pole);
    const sign = new THREE.Mesh(stopGeo, stopMat);
    sign.position.set(sx, 2.85, sz);
    sign.rotation.y = rotY;
    group.add(sign);
  }

  // Traffic lights at the major intersections. One head per corner pair:
  // the light guards the road along `axis`; both directions share its state.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const lightHeads = [];
  const MAJOR = [-135, -45, 45, 135];
  for (const ix of MAJOR) {
    for (const iz of MAJOR) {
      for (const axis of ['x', 'z']) {
        const cornerX = ix + (axis === 'x' ? 9 : -9);
        const cornerZ = iz + (axis === 'x' ? -9 : 9);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.4, 10), poleMat);
        pole.position.set(cornerX, 3.2, cornerZ);
        group.add(pole);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.5), poleMat);
        head.position.set(cornerX, 6.6, cornerZ);
        group.add(head);
        const lampGeo = new THREE.SphereGeometry(0.26, 8, 6);
        const red = new THREE.Mesh(lampGeo, new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0xff0000, emissiveIntensity: 0.1 }));
        red.position.set(cornerX, 7.15, cornerZ + 0.28);
        group.add(red);
        const yellow = new THREE.Mesh(lampGeo, new THREE.MeshLambertMaterial({ color: 0xcc9922, emissive: 0xffaa00, emissiveIntensity: 0.1 }));
        yellow.position.set(cornerX, 6.6, cornerZ + 0.28);
        group.add(yellow);
        const green = new THREE.Mesh(lampGeo, new THREE.MeshLambertMaterial({ color: 0x22aa44, emissive: 0x00cc44, emissiveIntensity: 0.1 }));
        green.position.set(cornerX, 6.05, cornerZ + 0.28);
        group.add(green);
        lightHeads.push({ axis, red, yellow, green });
      }
    }
  }

  // Buildings, lot by lot, so blocks read as a dense city rather than one
  // box in an empty field. Each district builds differently.
  const facadeTextures = FACADE_COLORS.map((c) => makeFacadeTexture(rng, c, false));
  // Beachfront facades lean warm — pink, peach, orange, cream — like
  // the HALCYON reference's pastel seafront: saturated warm pastels,
  // never cool grey-green or pale yellow.
  const warmFacadeTextures = ['#f2a0a8', '#f7b98a', '#f5a55c', '#e89aa8', '#f6e3c0', '#d98a63', '#f0c98a']
    .map((c) => makeFacadeTexture(rng, c, false, 0.42));
  const glassTextures = GLASS_COLORS.map((c) => makeFacadeTexture(rng, c, true));
  const roofColors = [0xb5654a, 0x8a5a3c, 0x6b7c8a, 0x9c8a6a];
  // Shopfront awnings: bright striped canopies over the ground floor, so
  // the streets read as shops at a glance, not blank facades.
  const awningMats = [
    new THREE.MeshLambertMaterial({ color: 0xff5e8a }),
    new THREE.MeshLambertMaterial({ color: 0x2ec4b6 }),
    new THREE.MeshLambertMaterial({ color: 0xffb13b }),
    new THREE.MeshLambertMaterial({ color: 0x4f9dff }),
    new THREE.MeshLambertMaterial({ color: 0xe8483f }),
    new THREE.MeshLambertMaterial({ color: 0xff7a3c }),
  ];
  const ranges = blockRanges();
  // Shared roof-feature geometries (unit size, scaled per building): a
  // barrel vault, a dome, a pyramid and a kiosk — so rooftops vary
  // instead of every building ending in the same flat slab.
  const barrelGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, 0, Math.PI);
  barrelGeo.rotateZ(Math.PI / 2); // half-shell, flat side down, axis along X
  const domeGeo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const pyramidGeo = new THREE.ConeGeometry(1, 1, 4);
  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const arcadeColGeo = new THREE.CylinderGeometry(0.22, 0.26, 3.4, 8);
  const balconySlabMat = new THREE.MeshLambertMaterial({ color: 0xd8d2c4 });
  const railMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const arcadeBandMat = new THREE.MeshLambertMaterial({ color: 0x6b6258 });
  const arcadeColMat = new THREE.MeshLambertMaterial({ color: 0xcfc8b8 });
  const NEON_SIGNS = [
    ['HOTEL', '#ff5e8a'], ['SOLMAR', '#4fd8ff'], ['PIZZA', '#ffb13b'],
    ['BAR', '#ff4f4f'], ['NEON', '#b46bff'], ['24H', '#7bff9e'],
    ['TACOS', '#ffe14f'], ['CINEMA', '#4f9dff'],
  ];

  // Rooftop dressing for a finished building: AC boxes and antennas on
  // mid-rise roofs so the skyline isn't flat slabs, a neon sign on tall
  // downtown / beachfront towers, and a bright shopfront awning over the
  // ground floor of low street-level buildings.
  function dressBuilding(cx, cz, w, d, h, district) {
    if (h > 18 && rng() < 0.55) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.6), new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }));
      ac.position.set(cx + w * 0.2, h + 0.55, cz - d * 0.15);
      ac.castShadow = true;
      group.add(ac);
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 5, 5), poleMat);
      antenna.position.set(cx - w * 0.25, h + 2.5, cz + d * 0.2);
      group.add(antenna);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.8 }));
      tip.position.set(cx - w * 0.25, h + 5.1, cz + d * 0.2);
      group.add(tip);
    }
    if ((district === 'downtown' || district === 'beachfront') && h > 30 && rng() < 0.45) {
      const [text, color] = pick(rng, NEON_SIGNS);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(11, 2.8),
        new THREE.MeshBasicMaterial({ map: makeSignTexture(text, color) }),
      );
      sign.position.set(cx, h * 0.72, cz + d / 2 + 0.35);
      group.add(sign);
    }
    // Low beachfront shopfronts get a glowing shop sign at street level,
    // so the ground floor reads as neon-lit shops like the reference —
    // not just the tall towers wearing signs.
    if (district === 'beachfront' && h < 18 && rng() < 0.5) {
      const [text, color] = pick(rng, NEON_SIGNS);
      const shop = new THREE.Mesh(
        new THREE.PlaneGeometry(6.5, 1.7),
        new THREE.MeshBasicMaterial({ map: makeSignTexture(text, color) }),
      );
      shop.position.set(cx, 4.4, cz + d / 2 + 0.3);
      group.add(shop);
    }
    if (district !== 'industrial' && h < 30 && rng() < (district === 'beachfront' ? 0.6 : 0.4)) {
      // Curved barrel awning (half-cylinder), not a flat box slab: it
      // bulges out over the shopfront and reads as a canopy.
      const awningLen = Math.min(w * 0.7, 14);
      const awningGeo = new THREE.CylinderGeometry(0.45, 0.45, awningLen, 10, 1, false, 0, Math.PI);
      awningGeo.rotateZ(Math.PI / 2);
      awningGeo.rotateX(Math.PI / 2);
      const awning = new THREE.Mesh(awningGeo, pick(rng, awningMats));
      awning.position.set(cx, 3.3, cz + d / 2);
      awning.castShadow = true;
      group.add(awning);
    }
  }

  // One roof feature on the topmost mass: barrel vault, dome, pyramid,
  // kiosk or a flat inset cap — the skyline steps and curves instead of
  // ending in one flat edge on every building.
  function addRoofFeature(cx, topY, cz, w, d, roofMat) {
    const roll = rng();
    const shortSide = Math.min(w, d);
    const longSide = Math.max(w, d);
    if (roll < 0.3) {
      // Barrel vault along the long side.
      const barrel = new THREE.Mesh(barrelGeo, roofMat);
      const radius = shortSide * 0.32;
      barrel.scale.set(longSide * 0.7, radius, radius);
      barrel.position.set(cx, topY, cz);
      if (d > w) barrel.rotation.y = Math.PI / 2;
      barrel.castShadow = true;
      group.add(barrel);
    } else if (roll < 0.5) {
      const dome = new THREE.Mesh(domeGeo, roofMat);
      const radius = shortSide * 0.36;
      dome.scale.set(radius, radius * 0.55, radius);
      dome.position.set(cx, topY, cz);
      dome.castShadow = true;
      group.add(dome);
    } else if (roll < 0.7) {
      const pyramid = new THREE.Mesh(pyramidGeo, roofMat);
      const radius = shortSide * 0.48;
      pyramid.scale.set(radius, 3.5, radius);
      pyramid.position.set(cx, topY + 1.75, cz);
      pyramid.rotation.y = Math.PI / 4;
      pyramid.castShadow = true;
      group.add(pyramid);
    } else if (roll < 0.85) {
      // Rooftop kiosk with a tiny dome on top.
      const kiosk = new THREE.Mesh(unitBoxGeo, roofMat);
      kiosk.scale.set(w * 0.24, 2.6, d * 0.24);
      kiosk.position.set(cx, topY + 1.3, cz);
      kiosk.castShadow = true;
      group.add(kiosk);
      const cap = new THREE.Mesh(domeGeo, roofMat);
      const radius = Math.min(w, d) * 0.14;
      cap.scale.set(radius, radius * 0.6, radius);
      cap.position.set(cx, topY + 2.6, cz);
      group.add(cap);
    } else {
      // Flat inset cap, the old stepped roofline.
      const cap = new THREE.Mesh(unitBoxGeo, roofMat);
      cap.scale.set(w * 0.8, 0.5, d * 0.8);
      cap.position.set(cx, topY + 0.25, cz);
      cap.castShadow = true;
      group.add(cap);
    }
  }

  // Balconies on the street face (+z): a slab and a railing, a couple of
  // floors up — the facade stops reading as one flat wall.
  function addBalconies(cx, cz, w, d, h, district) {
    if ((district !== 'beachfront' && district !== 'downtown' && district !== 'oldtown') || h < 14) return;
    if (rng() >= BUILDING_BALCONY_CHANCE) return;
    for (let k = 0; k < 2; k += 1) {
      const y = 6 + k * 4.5 + rng();
      if (y > h - 3) break;
      const bx = cx + range(rng, -w * 0.3, w * 0.3);
      const bz = cz + d / 2 + 0.5;
      const slab = new THREE.Mesh(unitBoxGeo, balconySlabMat);
      slab.scale.set(2.6, 0.16, 1.0);
      slab.position.set(bx, y, bz);
      slab.castShadow = true;
      group.add(slab);
      const rail = new THREE.Mesh(unitBoxGeo, railMat);
      rail.scale.set(2.6, 0.8, 0.06);
      rail.position.set(bx, y + 0.48, bz + 0.5);
      group.add(rail);
      for (const side of [-1, 1]) {
        const railSide = new THREE.Mesh(unitBoxGeo, railMat);
        railSide.scale.set(0.06, 0.8, 1.0);
        railSide.position.set(bx + side * 1.3, y + 0.48, bz);
        group.add(railSide);
      }
    }
  }

  // Ground-floor colonnade: a darker podium band with columns in front,
  // so low street buildings read as shops with an arcade, not a wall
  // that starts at the sidewalk.
  function addArcade(cx, cz, w, d, district) {
    if ((district !== 'beachfront' && district !== 'downtown') || rng() >= BUILDING_ARCADE_CHANCE) return;
    const band = new THREE.Mesh(unitBoxGeo, arcadeBandMat);
    band.scale.set(w + 0.3, 3.4, d + 0.3);
    band.position.set(cx, 1.7, cz);
    band.receiveShadow = true;
    group.add(band);
    for (let x = cx - w / 2 + 2; x <= cx + w / 2 - 2; x += 4) {
      const col = new THREE.Mesh(arcadeColGeo, arcadeColMat);
      col.position.set(x, 1.7, cz + d / 2 + 0.35);
      col.castShadow = true;
      group.add(col);
    }
  }

  function addBuilding(cx, cz, w, d, h, district) {
    const glass = district === 'downtown';
    // Clone the facade texture per building. The extruded mass takes UVs
    // in metres, so one repeat (1/20, 1/24) keeps windows the same size
    // on every facade instead of stretching into giant slabs.
    const baseTex = glass
      ? pick(rng, glassTextures)
      : district === 'beachfront' ? pick(rng, warmFacadeTextures) : pick(rng, facadeTextures);
    const tex = baseTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / 20, 1 / 24);
    const facade = new THREE.MeshLambertMaterial({
      // Beachfront facades glow faintly warm at sunset: the lit windows
      // in the texture emit, so the seafront reads lit-up, not flat.
      map: tex, emissive: 0xffd9a0, emissiveMap: tex, emissiveIntensity: district === 'beachfront' ? 0.18 : 0,
    });
    facadeMats.push(facade);
    const roofColor = district === 'industrial' ? 0x5a6068 : pick(rng, roofColors);
    const roof = new THREE.MeshLambertMaterial({ color: roofColor });
    // Rounded-corner mass with a bevelled edge — the silhouette is a
    // softened slab, never a sharp box.
    const cornerR = Math.min(BUILDING_CORNER_MAX, w * 0.1, d * 0.1);
    const building = new THREE.Mesh(extrudeMass(w, d, h, cornerR), [roof, facade]);
    building.position.set(cx, 0, cz);
    building.castShadow = true;
    building.receiveShadow = true;
    group.add(building);
    colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
    // Setback upper tier on tall buildings: a smaller rounded mass on
    // top, so the roofline steps instead of ending in one flat edge.
    let topW = w;
    let topD = d;
    let topY = h + BUILDING_BEVEL * 2;
    if (h >= 20 && rng() < BUILDING_SETBACK_CHANCE) {
      const w2 = w * range(rng, 0.55, 0.72);
      const d2 = d * range(rng, 0.55, 0.72);
      const h2 = h * range(rng, 0.16, 0.3);
      const tex2 = baseTex.clone();
      tex2.needsUpdate = true;
      tex2.wrapS = THREE.RepeatWrapping;
      tex2.wrapT = THREE.RepeatWrapping;
      tex2.repeat.set(1 / 20, 1 / 24);
      const facade2 = new THREE.MeshLambertMaterial({
        map: tex2, emissive: 0xffd9a0, emissiveMap: tex2, emissiveIntensity: 0,
      });
      facadeMats.push(facade2);
      const tier = new THREE.Mesh(
        extrudeMass(w2, d2, h2, Math.min(1.8, w2 * 0.1, d2 * 0.1)),
        [roof, facade2],
      );
      tier.position.set(cx + range(rng, -1, 1), topY, cz + range(rng, -1, 1));
      tier.castShadow = true;
      tier.receiveShadow = true;
      group.add(tier);
      topW = w2;
      topD = d2;
      topY += h2 + BUILDING_BEVEL * 2;
    }
    addRoofFeature(cx, topY, cz, topW, topD, roof);
    addBalconies(cx, cz, w, d, h, district);
    if (h < 30) addArcade(cx, cz, w, d, district);
    dressBuilding(cx, cz, w, d, h, district);
    return building;
  }

  // Trees and benches, shared by parks and streets.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2c });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4d9450 });
  function tree(x, z, scale) {
    const s = scale || 1;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.28 * s, 3 * s, 10), trunkMat);
    trunk.position.set(x, 1.5 * s, z);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9 * s, 1), leafMat);
    crown.position.set(x, 3.8 * s, z);
    crown.castShadow = true;
    group.add(crown);
  }
  function bench(x, z, rotY) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.18, 0.6), new THREE.MeshLambertMaterial({ color: 0x8a6a42 }));
    seat.position.set(x, 0.5, z);
    seat.rotation.y = rotY;
    group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 0.14), new THREE.MeshLambertMaterial({ color: 0x8a6a42 }));
    back.position.set(x - Math.sin(rotY) * 0.28, 0.85, z - Math.cos(rotY) * 0.28);
    back.rotation.y = rotY;
    group.add(back);
  }

  const parkMat = new THREE.MeshLambertMaterial({ color: 0x5d9448 });
  const pathMat = new THREE.MeshLambertMaterial({ color: 0xc9b896 });
  for (const [bx0, bx1] of ranges) {
    if (bx0 >= BEACH_X - 10) continue; // the beach stays open
    for (const [bz0, bz1] of ranges) {
      const cx = (bx0 + bx1) / 2;
      const cz = (bz0 + bz1) / 2;
      const district = districtOf(cx, cz);
      // A few blocks are parks: grass, paths, trees and benches. Never in
      // the industrial quarter — that stays warehouses and concrete.
      if (district !== 'downtown' && district !== 'industrial' && rng() < 0.13) {
        const park = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0, bz1 - bz0), parkMat);
        park.rotation.x = -Math.PI / 2;
        park.position.set(cx, 0.06, cz);
        park.receiveShadow = true;
        group.add(park);
        const path = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0, 4), pathMat);
        path.rotation.x = -Math.PI / 2;
        path.position.set(cx, 0.08, cz);
        group.add(path);
        const path2 = new THREE.Mesh(new THREE.PlaneGeometry(4, bz1 - bz0), pathMat);
        path2.rotation.x = -Math.PI / 2;
        path2.position.set(cx, 0.08, cz);
        group.add(path2);
        for (let i = 0; i < 6; i += 1) {
          tree(bx0 + 8 + rng() * (bx1 - bx0 - 16), bz0 + 8 + rng() * (bz1 - bz0 - 16), range(rng, 0.9, 1.4));
        }
        bench(cx - 6, cz + 3, 0);
        bench(cx + 6, cz - 3, Math.PI);
        continue;
      }
      // Subdivide the block into lots and fill each one.
      const cols = (bx1 - bx0) > 62 ? 2 : 1;
      const rows = (bz1 - bz0) > 62 ? 2 : 1;
      for (let ci = 0; ci < cols; ci += 1) {
        for (let ri = 0; ri < rows; ri += 1) {
          const lx0 = bx0 + (ci * (bx1 - bx0)) / cols;
          const lx1 = bx0 + ((ci + 1) * (bx1 - bx0)) / cols;
          const lz0 = bz0 + (ri * (bz1 - bz0)) / rows;
          const lz1 = bz0 + ((ri + 1) * (bz1 - bz0)) / rows;
          const w = (lx1 - lx0) - 8;
          const d = (lz1 - lz0) - 8;
          if (w < 10 || d < 10) continue;
          // Heights cluster around each district's middle (gauss) instead
          // of spreading flat, so the skyline varies without random
          // skyscrapers next to shacks. Beachfront mixes low 2-3 storey
          // shopfronts in with the mid-rise hotels, like the reference's
          // varied seafront — never one monotonous wall of towers.
          let h;
          if (district === 'downtown') h = clamp(58 + gauss(rng) * 14, 34, 82);
          else if (district === 'industrial') h = range(rng, 8, 15);
          else if (district === 'beachfront') h = rng() < 0.3 ? range(rng, 9, 16) : clamp(34 + gauss(rng) * 8, 22, 48);
          else if (district === 'marina') h = range(rng, 8, 18);
          else h = clamp(16 + gauss(rng) * 4, 9, 24); // old town: low and tight
          const bw = district === 'industrial' ? w : range(rng, w * 0.6, w);
          const bd = district === 'industrial' ? d : range(rng, d * 0.6, d);
          addBuilding((lx0 + lx1) / 2, (lz0 + lz1) / 2, bw, bd, h, district);
        }
      }
    }
  }

  // Landmarks ------------------------------------------------------------
  // Solmar Tower: the tallest building in the city, downtown — three
  // stacked rounded masses stepping up to the spire, not one slab.
  {
    const baseTex = pick(rng, glassTextures);
    const tex = baseTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / 20, 1 / 24);
    const facade = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffd9a0, emissiveMap: tex, emissiveIntensity: 0 });
    facadeMats.push(facade);
    const towerRoof = new THREE.MeshLambertMaterial({ color: 0x3a4a5a });
    const towerBase = new THREE.Mesh(extrudeMass(34, 34, 70, 3), [towerRoof, facade]);
    towerBase.position.set(0, 0, -90);
    towerBase.castShadow = true;
    towerBase.receiveShadow = true;
    group.add(towerBase);
    const towerMid = new THREE.Mesh(extrudeMass(26, 26, 26, 2.5), [towerRoof, facade]);
    towerMid.position.set(0, 71, -90);
    towerMid.castShadow = true;
    towerMid.receiveShadow = true;
    group.add(towerMid);
    const towerTop = new THREE.Mesh(extrudeMass(18, 18, 16, 2), [towerRoof, facade]);
    towerTop.position.set(0, 98, -90);
    towerTop.castShadow = true;
    group.add(towerTop);
    colliders.push({ x0: -17, x1: 17, z0: -107, z1: -73 });
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 22, 8), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    spire.position.set(0, 122, -90);
    group.add(spire);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 }));
    beacon.position.set(0, 134, -90);
    group.add(beacon);
    group.userData.towerBeacon = beacon;
  }

  // Lighthouse on the north-east beach, with a rotating beam at night.
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(9, 55, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  );
  {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 16, 10), new THREE.MeshLambertMaterial({ color: 0xe8e4da }));
    base.position.set(335, 8, -320);
    base.castShadow = true;
    group.add(base);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(3.45, 3.7, 4, 10), new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
    stripe.position.set(335, 10, -320);
    group.add(stripe);
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3, 8), new THREE.MeshLambertMaterial({ color: 0x222222, emissive: 0xffe9a0, emissiveIntensity: 1 }));
    lampRoom.position.set(335, 17.5, -320);
    group.add(lampRoom);
    beam.position.set(335, 17.5, -320);
    beam.rotation.z = Math.PI / 2;
    beam.visible = false;
    group.add(beam);
    colliders.push({ x0: 330, x1: 340, z0: -325, z1: -315 });
  }

  // Ferris wheel on the beachfront, slowly turning.
  const wheelSpin = new THREE.Group();
  const wheelCabins = [];
  {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(322, 0, 120);
    wheelGroup.rotation.y = Math.PI / 2;
    const legMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 26, 6), legMat);
      leg.position.set(0, 13, s * 7);
      leg.rotation.x = s * 0.28;
      leg.castShadow = true;
      wheelGroup.add(leg);
    }
    wheelSpin.position.set(0, 22, 0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(17, 0.5, 8, 40), new THREE.MeshLambertMaterial({ color: 0xff5e8a, emissive: 0xff2e6a, emissiveIntensity: 0.4 }));
    wheelSpin.add(rim);
    for (let i = 0; i < 8; i += 1) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.35, 34, 0.35), legMat);
      spoke.rotation.z = (i * Math.PI) / 8;
      wheelSpin.add(spoke);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2), new THREE.MeshLambertMaterial({ color: pick(rng, [0xffd23b, 0x4fd8ff, 0xff5e8a, 0x7bff9e]) }));
      const angle = (i * Math.PI) / 4;
      cabin.position.set(Math.sin(angle) * 17, Math.cos(angle) * 17, 0);
      cabin.castShadow = true;
      wheelSpin.add(cabin);
      wheelCabins.push(cabin);
    }
    wheelGroup.add(wheelSpin);
    group.add(wheelGroup);
    colliders.push({ x0: 316, x1: 328, z0: 112, z1: 128 });
  }

  // The pier: wooden deck out over the water, with lamps.
  {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(70, 0.6, 9), new THREE.MeshLambertMaterial({ color: 0x8a6a42 }));
    deck.position.set(392, 0.4, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);
    for (let x = 366; x <= 424; x += 14) {
      for (const dz of [-3.5, 3.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 6), poleMat);
        post.position.set(x, -0.6, dz);
        group.add(post);
      }
    }
    const pierBulbMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0 });
    for (let x = 370; x <= 420; x += 16) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 4.5, 6), poleMat);
      pole.position.set(x, 2.6, -3.5);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), pierBulbMat);
      bulb.position.set(x, 5, -3.5);
      group.add(bulb);
      lamps.push(bulb);
    }
  }

  // Industrial crane with a hanging load.
  {
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a83b });
    const legA = new THREE.Mesh(new THREE.BoxGeometry(2, 34, 2), craneMat);
    legA.position.set(196, 17, -200);
    legA.castShadow = true;
    group.add(legA);
    const legB = new THREE.Mesh(new THREE.BoxGeometry(2, 34, 2), craneMat);
    legB.position.set(208, 17, -200);
    legB.castShadow = true;
    group.add(legB);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(46, 2, 2), craneMat);
    jib.position.set(196, 34, -200);
    jib.castShadow = true;
    group.add(jib);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 12, 6), poleMat);
    cable.position.set(178, 27, -200);
    group.add(cable);
    const load = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), new THREE.MeshLambertMaterial({ color: 0x2e6fc2 }));
    load.position.set(178, 19.5, -200);
    load.castShadow = true;
    group.add(load);
    colliders.push({ x0: 194, x1: 210, z0: -202, z1: -198 });
  }

  // Boats bobbing off the beach.
  const boatMat = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
  const sailMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const [bx, bz] of [[372, -90], [392, 40], [368, 150], [398, -160]]) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 9), boatMat);
    hull.position.y = 0.2;
    hull.castShadow = true;
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), poleMat);
    mast.position.y = 4;
    boat.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 5, 3.4), sailMat);
    sail.position.set(0, 4.2, -1);
    boat.add(sail);
    boat.position.set(bx, 0, bz);
    group.add(boat);
    boats.push(boat);
  }

  // ---- Realistic palms -------------------------------------------------
  // A palm frond is a curved rib with leaflets fanning off it — never a
  // cone. Four shared frond geometries (deep droop / droop / mid /
  // upright arcs) are reused by every palm, so ~200 palms stay cheap:
  // shared geometry, one material, ~21 meshes per palm.
  //
  // Like the HALCYON reference, a crown must read as a dense, layered
  // mass: each frond carries TWO overlapping leaflet blades per station
  // per side, the blades long and wide enough to overlap their
  // neighbours, and the inner rings are shaded darker so the crown has
  // volume instead of reading as one thin spiky star.
  function makeFrondGeometry(len, rise, droop, leafLen, shade) {
    const positions = [];
    const colors = [];
    const indices = [];
    let vi = 0;
    // Round 13: 20 stations instead of 14 — denser stations mean shorter
    // segments, so the rib curve is smoother and the leaflets overlap
    // into a continuous feather instead of a row of separate triangles
    // with gaps (the serrated silhouette in the drive shot).
    const stations = 20;
    const rib = [];
    for (let i = 0; i <= stations; i += 1) {
      const t = i / stations;
      rib.push({ x: len * t, y: len * (rise * t - droop * t * t), t });
    }
    // Leaflet length: short at the base, widest just past the middle,
    // tapering to a point at the tip.
    const leafAt = (t) => leafLen * Math.sin(Math.PI * (0.06 + 0.94 * t)) * (1 - 0.25 * t);
    // Green gradient along the frond: deep dark green at the base (the
    // shaded inside of the crown), rich green mid-frond, sunlit
    // yellow-green at the tip. `shade` darkens whole inner rings.
    const colBase = [0.13, 0.34, 0.10];
    const colMid = [0.24, 0.52, 0.16];
    const colTip = [0.48, 0.72, 0.26];
    function leafColor(t) {
      let c;
      if (t < 0.5) c = colBase.map((v, k) => v + (colMid[k] - v) * (t / 0.5));
      else c = colMid.map((v, k) => v + (colTip[k] - v) * ((t - 0.5) / 0.5));
      return c.map((v) => v * shade);
    }
    function tri(a, b, c, color) {
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      for (let k = 0; k < 3; k += 1) colors.push(color[0], color[1], color[2]);
      indices.push(vi, vi + 1, vi + 2);
      vi += 3;
    }
    function quad(a, b, c, d, color) {
      tri(a, b, c, color);
      tri(a, c, d, color);
    }
    // Blunt tip for a leaflet blade: instead of one sharp apex (which
    // reads as a needle up close), the blade ends in a short tip edge
    // pulled back from the apex, so the tip is a soft rounded rectangle,
    // not a spike. `a`/`b` are the base edge on the rib, `apex` the old
    // sharp tip; returns the quad's four corners.
    function bluntBlade(a, b, apex, pullBack, tipHalf) {
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const mz = (a[2] + b[2]) / 2;
      let ax = apex[0] - mx;
      let ay = apex[1] - my;
      let az = apex[2] - mz;
      const alen = Math.hypot(ax, ay, az) || 1;
      ax /= alen;
      ay /= alen;
      az /= alen;
      // In-plane perpendicular to the blade axis.
      let px = (b[0] - a[0]);
      let py = (b[1] - a[1]);
      let pz = (b[2] - a[2]);
      // perp = normalize(cross(axis, baseEdge)) — lies in the blade plane.
      let qx = ay * pz - az * py;
      let qy = az * px - ax * pz;
      let qz = ax * py - ay * px;
      const qlen = Math.hypot(qx, qy, qz) || 1;
      qx /= qlen;
      qy /= qlen;
      qz /= qlen;
      const t1 = [
        apex[0] - ax * pullBack + qx * tipHalf,
        apex[1] - ay * pullBack + qy * tipHalf,
        apex[2] - az * pullBack + qz * tipHalf,
      ];
      const t2 = [
        apex[0] - ax * pullBack - qx * tipHalf,
        apex[1] - ay * pullBack - qy * tipHalf,
        apex[2] - az * pullBack - qz * tipHalf,
      ];
      return [a, b, t2, t1];
    }
    // Central rib: a thin dark-olive strip along the curve, the frond's
    // visible spine.
    const ribCol = [0.30, 0.42, 0.16].map((v) => v * shade);
    for (let i = 0; i < stations; i += 1) {
      const p0 = rib[i];
      const p1 = rib[i + 1];
      const w = 0.05;
      tri([p0.x, p0.y + 0.03, -w], [p1.x, p1.y + 0.03, -w], [p1.x, p1.y + 0.03, w], ribCol);
      tri([p0.x, p0.y + 0.03, -w], [p1.x, p1.y + 0.03, w], [p0.x, p0.y + 0.03, w], ribCol);
    }
    // Leaflets: THREE overlapping blades per side at each station. Blade A
    // sweeps back along the rib; blade B sits half a station further out
    // and hangs lower; blade C fills the gap between them, mid-length and
    // mid-droop — so the frond's edge reads as a full feather, not a row
    // of separate needles. Each blade is a blunt-tipped quad, not a sharp
    // triangle, so the leaflet tips read rounded up close.
    // Blunt-tip ratios, as fractions of the leaflet length L: how far
    // the tip edge is pulled back from the old sharp apex, and how wide
    // the tip edge is. Round 13: wider, shorter tips (more pullback,
    // wider tip edge) so the silhouette is soft and feathery, never a
    // serrated triangle.
    const BLADE_A_PULLBACK = 0.28;
    const BLADE_A_TIP_HALF = 0.2;
    const BLADE_B_PULLBACK = 0.24;
    const BLADE_B_TIP_HALF = 0.17;
    const BLADE_C_PULLBACK = 0.26;
    const BLADE_C_TIP_HALF = 0.18;
    for (let i = 1; i < stations; i += 1) {
      const p = rib[i];
      const pNext = rib[i + 1];
      const segLen = Math.hypot(pNext.x - p.x, pNext.y - p.y);
      const dirX = (pNext.x - p.x) / segLen;
      const dirY = (pNext.y - p.y) / segLen;
      const L = leafAt(p.t);
      const col = leafColor(p.t);
      for (const side of [-1, 1]) {
        // Blade A: wide, swept back, slightly drooping.
        const tipA = [
          p.x - dirX * L * 0.3,
          p.y + dirY * L * 0.1 - L * 0.2,
          side * L,
        ];
        const baseA0 = [p.x, p.y, 0];
        const baseA1 = [p.x + dirX * segLen * 0.6, p.y + dirY * segLen * 0.6, 0];
        quad(...bluntBlade(baseA0, baseA1, tipA, L * BLADE_A_PULLBACK, L * BLADE_A_TIP_HALF), col);
        // Blade B: shorter, steeper, hanging below blade A.
        const pB = { x: p.x + dirX * segLen * 0.5, y: p.y + dirY * segLen * 0.5 };
        const tipB = [
          pB.x - dirX * L * 0.55,
          pB.y - L * 0.45,
          side * L * 0.82,
        ];
        const baseB0 = [pB.x, pB.y, 0];
        const baseB1 = [pB.x + dirX * segLen * 0.45, pB.y + dirY * segLen * 0.45, 0];
        quad(...bluntBlade(baseB0, baseB1, tipB, L * BLADE_B_PULLBACK, L * BLADE_B_TIP_HALF), col);
        // Blade C: mid-length, mid-droop, a quarter station further out —
        // the filler that closes the gap between A and B so no sky shows
        // through the frond's edge.
        const pC = { x: p.x + dirX * segLen * 0.25, y: p.y + dirY * segLen * 0.25 };
        const tipC = [
          pC.x - dirX * L * 0.42,
          pC.y - L * 0.32,
          side * L * 0.92,
        ];
        const baseC0 = [pC.x, pC.y, 0];
        const baseC1 = [pC.x + dirX * segLen * 0.5, pC.y + dirY * segLen * 0.5, 0];
        quad(...bluntBlade(baseC0, baseC1, tipC, L * BLADE_C_PULLBACK, L * BLADE_C_TIP_HALF), col);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }
  // Longer, heavier fronds than before, darkest on the deep-droop ring
  // (the shaded underside of the crown) and brightest on the upright
  // ring catching the sun. Round 13: leaflets ~15% longer and tips
  // curling further down, so the crown reads as soft drooping feathers
  // like the reference palms, not stiff serrated fans.
  const palmFrondDeepGeo = makeFrondGeometry(6.6, 0.05, 0.85, 1.15, 0.62);
  const palmFrondDroopGeo = makeFrondGeometry(6.2, 0.12, 0.72, 1.1, 0.78);
  const palmFrondMidGeo = makeFrondGeometry(5.6, 0.3, 0.5, 1.0, 0.92);
  const palmFrondUpGeo = makeFrondGeometry(4.9, 0.55, 0.34, 0.82, 1.0);
  const palmFrondMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
  const palmNutGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const palmNutMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2c });
  // Ringed trunk texture: palm trunks are banded where old fronds fell.
  function makeTrunkTexture(base, band) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const g = canvas.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 64, 128);
    for (let y = 0; y < 128; y += 6) {
      g.fillStyle = band;
      g.fillRect(0, y, 64, 2);
    }
    for (let i = 0; i < 12; i += 1) {
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(rng01() * 64, 0, 2, 128);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  // Tall SLIM trunk, gently curved (bent in the geometry, not just leaned):
  // the reference palms are slender and arc, never straight columns.
  const palmTrunkGeo = (() => {
    const geo = new THREE.CylinderGeometry(0.16, 0.36, 8, 10, 8);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      const t = (y + 4) / 8;
      pos.setX(i, pos.getX(i) + 0.9 * t * t);
    }
    geo.computeVertexNormals();
    return geo;
  })();
  const palmFlareGeo = new THREE.CylinderGeometry(0.36, 0.58, 0.9, 10);
  // Beachfront palms wear the reference's tall RED trunks — vivid
  // red-orange like the HALCYON palms, not dark brown; avenue palms
  // wear ringed brown bark.
  const palmTrunkMatRed = new THREE.MeshLambertMaterial({ map: makeTrunkTexture('#b8442f', '#8e3222') });
  const palmTrunkMatBrown = new THREE.MeshLambertMaterial({ map: makeTrunkTexture('#6a4a2c', '#54371f') });
  // Coconut palms: a slender curved trunk, a root flare, a four-layer
  // crown of feathered fronds and a cluster of nuts under it — they must
  // read as palms at a glance, with shadows long enough to stripe the
  // road at golden hour.
  function palm(x, z, scale, trunkMaterial) {
    const s = scale || 1;
    const palmGroup = new THREE.Group();
    const lean = range(rng, -0.14, 0.14);
    const yaw = rng() * Math.PI * 2;
    const inner = new THREE.Group();
    inner.rotation.set(0, yaw, lean);
    const trunk = new THREE.Mesh(palmTrunkGeo, trunkMaterial || palmTrunkMatBrown);
    trunk.position.y = 4;
    trunk.castShadow = true;
    inner.add(trunk);
    const flare = new THREE.Mesh(palmFlareGeo, trunkMaterial || palmTrunkMatBrown);
    flare.position.y = 0.45;
    inner.add(flare);
    // Crown sits at the bent trunk top, so it follows the lean and the
    // curve instead of floating beside the trunk.
    const crown = new THREE.Group();
    crown.position.set(0.9, 8.0, 0);
    inner.add(crown);
    // One ring of fronds: each frond extends +X from the crown and is
    // yawed around it, with a tilt that raises (upper ring) or lowers
    // (drooping ring) the tip. Four rings make a full, layered crown:
    // the deep ring hangs well below the crown so the silhouette is a
    // dense drooping mass, like the reference, not a spiky star.
    function frondRing(geo, count, y, tilt, size, offset) {
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + offset + range(rng, -0.25, 0.25);
        const frond = new THREE.Mesh(geo, palmFrondMat);
        frond.scale.setScalar(size * range(rng, 0.92, 1.1));
        frond.position.y = y;
        frond.rotation.set(0, angle, tilt + range(rng, -0.08, 0.08));
        frond.castShadow = true;
        crown.add(frond);
      }
    }
    frondRing(palmFrondDeepGeo, 3, -0.35, -0.35, 0.95, 0.45);
    frondRing(palmFrondDroopGeo, 6, -0.15, -0.15, 1, 0);
    frondRing(palmFrondMidGeo, 5, 0.1, 0.05, 1, 0.65);
    frondRing(palmFrondUpGeo, 4, 0.35, 0.35, 0.9, 0.3);
    for (const [nx, nz] of [[0.45, 0.3], [-0.4, -0.25], [0.1, -0.5]]) {
      const nut = new THREE.Mesh(palmNutGeo, palmNutMat);
      nut.position.set(nx, -0.55, nz);
      crown.add(nut);
    }
    palmGroup.add(inner);
    palmGroup.scale.setScalar(s);
    palmGroup.position.set(x, 0, z);
    group.add(palmGroup);
  }

  // Beach umbrellas: striped domes on the sand, with a towel beside some
  // and a beach chair beside others — the sand must read populated.
  const umbrellaColors = [0xff5e8a, 0x4fd8ff, 0xffb13b, 0x7bff9e, 0xb46bff];
  function umbrella(x, z, color) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), poleMat);
    pole.position.set(x, 1.3, z);
    group.add(pole);
    // Domed canopy (squashed hemisphere), not a cone: the umbrella reads
    // round, like a real beach umbrella.
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(2.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color }),
    );
    canopy.scale.y = 0.55;
    canopy.position.set(x, 2.55, z);
    canopy.castShadow = true;
    group.add(canopy);
    if (rng() < 0.6) {
      const towel = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 2.1),
        new THREE.MeshLambertMaterial({ color: pick(rng, umbrellaColors) }),
      );
      towel.rotation.x = -Math.PI / 2;
      towel.rotation.z = rng() * Math.PI;
      towel.position.set(x + range(rng, -2.5, 2.5), 0.06, z + range(rng, -2, 2));
      group.add(towel);
    }
    if (rng() < 0.55) {
      const chair = new THREE.Group();
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.08, 1.1),
        new THREE.MeshLambertMaterial({ color: pick(rng, umbrellaColors) }),
      );
      seat.position.y = 0.35;
      seat.castShadow = true;
      chair.add(seat);
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.9, 0.08),
        new THREE.MeshLambertMaterial({ color: 0xe8e4da }),
      );
      back.position.set(0, 0.7, -0.55);
      back.rotation.x = -0.5;
      chair.add(back);
      chair.position.set(x + range(rng, 1.5, 3.2), 0, z + range(rng, -1.5, 1.5));
      chair.rotation.y = rng() * Math.PI;
      group.add(chair);
    }
  }
  // Dense umbrellas on the narrow sand east of the palm line, every ~26 m.
  for (let z = -330; z <= 330; z += 26) {
    umbrella(330 + range(rng, -4, 10), z + range(rng, -6, 6), pick(rng, umbrellaColors));
  }

  // Billboards: big glowing signs over the main avenues. A "big" board
  // stands taller with a wider panel, so it reads from down the street.
  function billboard(x, z, rotY, text, color, big) {
    const board = new THREE.Group();
    const postH = big ? 17 : 9;
    const panelW = big ? 22 : 15;
    const panelH = big ? 7 : 5;
    const panelY = big ? 19 : 11;
    for (const dx of [-panelW / 2, panelW / 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, postH, 10), poleMat);
      post.position.set(dx, postH / 2, 0);
      board.add(post);
    }
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(panelW, panelH),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(text, color) }),
    );
    panel.position.set(0, panelY, 0);
    board.add(panel);
    board.position.set(x, 0, z);
    board.rotation.y = rotY;
    group.add(board);
  }
  billboard(-45, -140, 0, 'SOLMAR BAY', '#4fd8ff');
  billboard(135, 140, Math.PI, 'CASINO', '#ff5e8a');
  billboard(45, 270, 0, 'PIZZA 24H', '#ffb13b');
  // The reference's giant pink radio billboard — as an OVERHEAD GANTRY
  // spanning the Ocean boulevard, not a roadside board. A roadside board
  // can never read clean here: the drive/chase cameras sit low on the
  // road, so their sightline to any distant panel crosses the palm
  // crowns (frond tips reach ~18 m) at every palm between camera and
  // board — moving it or skipping a few palms just hands the job to the
  // next palm down the line. The gantry panel hangs over the road
  // itself, 22–29 m up (above every frond tip), and only 16 m wide so
  // its text stays over the road centre, clear of both palm lines — with
  // nothing but open road between the cameras and the panel, SOLMAR FM
  // reads FULL and CLEAN in every beach-road shot. Our own station,
  // never the reference's brand. The panel faces north, toward the
  // southbound cameras.
  function gantry(z, text, color) {
    const span = 16;
    const panelH = 7;
    const panelY = 25.5;
    for (const px of [315 - span / 2, 315 + span / 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 29, 10), poleMat);
      post.position.set(px, 14.5, z);
      group.add(post);
    }
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(span, panelH),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(text, color) }),
    );
    panel.position.set(315, panelY, z);
    panel.rotation.y = Math.PI;
    group.add(panel);
  }
  gantry(77, 'SOLMAR FM', '#ff5e8a');
  // Beachfront palms: tall RED trunks (the reference's signature) lining
  // BOTH sides of the Ocean boulevard (x=315) — the sand edge east of the
  // road and the sidewalk west of it — every ~14 m, so the beach road
  // reads as a palm tunnel like the reference, not a few scattered trees.
  for (let z = -336; z <= 336; z += 14) palm(330 + range(rng, -2, 2), z, range(rng, 1.25, 1.6), palmTrunkMatRed);
  for (let z = -328; z <= 328; z += 16) palm(306 + range(rng, -1, 1), z, range(rng, 1.2, 1.55), palmTrunkMatRed);
  // Avenue palms: the four central avenues are lined on both sides, so
  // every drive down a main road is framed by palms, like the entries on
  // the feed. Offset 12 puts them on the outer sidewalk, clear of the
  // lamp poles at offset 10.
  for (const road of [-45, 45]) {
    for (let t = -264; t <= 264; t += 42) {
      for (const side of [-1, 1]) {
        palm(road + side * 12, t);
        palm(t, road + side * 12);
      }
    }
  }
  for (let i = 0; i < 30; i += 1) {
    tree(range(rng, -300, 280), range(rng, -300, 300), range(rng, 0.9, 1.3));
  }

  // Street lamps along the roads.
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 10);
  const bulbGeo = new THREE.SphereGeometry(0.35, 12, 8);
  for (const p of ROAD_POSITIONS) {
    for (let t = -320; t <= 320; t += 64) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(p + ROAD_WIDTH / 2 + 3, 3, t);
      group.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(p + ROAD_WIDTH / 2 + 3, 6.2, t);
      group.add(bulb);
      lamps.push(bulb);
    }
  }

  // Bus stop shelters on a few roads.
  const shelterMat = new THREE.MeshLambertMaterial({ color: 0x3a6a8a });
  for (const [sx, sz, rot] of [[-45, 100, 0], [45, -100, Math.PI], [135, 200, 0], [-225, -45, Math.PI / 2], [225, 45, -Math.PI / 2]]) {
    const shelter = new THREE.Group();
    const roofPanel = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 2), shelterMat);
    roofPanel.position.y = 2.6;
    shelter.add(roofPanel);
    for (const dx of [-2.2, 2.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), poleMat);
      post.position.set(dx, 1.3, 0);
      shelter.add(post);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(4, 0.16, 0.6), new THREE.MeshLambertMaterial({ color: 0x8a6a42 }));
    seat.position.y = 0.55;
    shelter.add(seat);
    shelter.position.set(sx, 0, sz);
    shelter.rotation.y = rot;
    group.add(shelter);
  }

  // Sun + sky. The sun follows the player so shadows stay crisp nearby.
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xd8c8e8, 0x8a8478, 0.7);
  scene.add(hemi);
  scene.fog = new THREE.Fog(PALETTE.fogDay, 150, 650);

  // The sun disc itself: a glowing ball low on the horizon at golden hour,
  // so sunset screenshots have a sun to look at. Amber, not pale — a pale
  // disc vanishes against the peach sky, so it has to be the brightest,
  // most saturated thing up there, with a strong orange halo.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(36, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9a1e, fog: false, transparent: true, opacity: 1 }),
  );
  scene.add(sunDisc);
  // Sun halo: a soft radial-gradient sprite, much bigger than the disc,
  // so the sun glows instead of sitting as a flat orange coin. The
  // gradient falls to transparent at the edge — no hard rim.
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = 256;
  haloCanvas.height = 256;
  const haloG = haloCanvas.getContext('2d');
  const haloGrad = haloG.createRadialGradient(128, 128, 4, 128, 128, 128);
  haloGrad.addColorStop(0, 'rgba(255, 190, 90, 0.85)');
  haloGrad.addColorStop(0.35, 'rgba(255, 140, 40, 0.45)');
  haloGrad.addColorStop(1, 'rgba(255, 120, 30, 0)');
  haloG.fillStyle = haloGrad;
  haloG.fillRect(0, 0, 256, 256);
  const haloTex = new THREE.CanvasTexture(haloCanvas);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
  sunGlow.scale.set(340, 340, 1);
  scene.add(sunGlow);

  // Gradient sky dome: violet overhead fading through pink to gold at
  // the horizon, like the new reference's pink-purple sunset — the sky
  // reads like a real sunset sky instead of a flat colour. It follows
  // the player and darkens at night.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const skyG = skyCanvas.getContext('2d');
  const skyGrad = skyG.createLinearGradient(0, 0, 0, 256);
  // Violet overhead -> pink-purple -> pink -> peach -> gold at the
  // horizon, no muddy band: the gradient stays bright at golden hour.
  skyGrad.addColorStop(0, '#8a6fd0');
  skyGrad.addColorStop(0.28, '#c77fb8');
  skyGrad.addColorStop(0.5, '#ff9eb0');
  skyGrad.addColorStop(0.72, '#ffb27a');
  skyGrad.addColorStop(1, '#ffd27a');
  skyG.fillStyle = skyGrad;
  skyG.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyDomeMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1100, 24, 16), skyDomeMat);
  skyDome.renderOrder = -1;
  scene.add(skyDome);
  const skyNightTint = new THREE.Color(0x1a2438);
  const skyWhite = new THREE.Color(0xffffff);

  // Thin pink sunset clouds: soft sprites drifting high above the city,
  // pink-tinted so the sky isn't one flat gradient. Sprites always face
  // the camera, so a handful of them reads as cloud cover from any angle.
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 256;
  cloudCanvas.height = 128;
  const cloudG = cloudCanvas.getContext('2d');
  for (const [cx, cy, r] of [[70, 70, 46], [120, 78, 52], [180, 70, 44], [100, 55, 34], [155, 55, 32]]) {
    const grad = cloudG.createRadialGradient(cx, cy, 4, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,214,232,0.9)');
    grad.addColorStop(0.5, 'rgba(255,214,232,0.45)');
    grad.addColorStop(1, 'rgba(255,214,232,0)');
    cloudG.fillStyle = grad;
    cloudG.fillRect(0, 0, 256, 128);
  }
  const cloudTex = new THREE.CanvasTexture(cloudCanvas);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  const clouds = [];
  for (let i = 0; i < 10; i += 1) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, color: 0xffd9e8, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
    const sprite = new THREE.Sprite(mat);
    const sx = -500 + (i * 113) % 1000;
    const sy = 95 + (i * 29) % 40;
    const sz = -480 + (i * 197) % 960;
    sprite.position.set(sx, sy, sz);
    sprite.scale.set(150 + (i % 3) * 55, 42 + (i % 2) * 18, 1);
    sprite.userData.baseOpacity = 0.65 + (i % 3) * 0.08;
    scene.add(sprite);
    clouds.push(sprite);
  }

  const skyDay = new THREE.Color(PALETTE.skyDay);
  const skySunset = new THREE.Color(PALETTE.skySunset);
  const skyGolden = new THREE.Color(PALETTE.skyGolden);
  const skyNight = new THREE.Color(PALETTE.skyNight);
  const fogSunset = new THREE.Color(PALETTE.fogSunset);
  const sunColor = new THREE.Color();
  let cycleTime = 0;
  let nightF = 0; // 0 day .. 1 night, kept for traffic headlights

  // Traffic light cycle: 12 s. North-south green 0-5, yellow 5-6, then
  // east-west green 6-11, yellow 11-12.
  function lightForAxis(axis) {
    const phase = cycleTime % 12;
    if (axis === 'z') {
      if (phase < 5) return 'green';
      if (phase < 6) return 'yellow';
      return 'red';
    }
    if (phase < 6) return 'red';
    if (phase < 11) return 'green';
    return 'yellow';
  }

  function update(dt, timeOfDay, playerPos) {
    cycleTime += dt;
    // Sun angle: 6:00 sunrise, 12:00 noon, 18:00 sunset, 0:00 midnight.
    const angle = ((timeOfDay - 6) / 12) * Math.PI;
    const elevation = Math.sin(angle);
    const azimuth = Math.cos(angle) * 0.6 + 0.4;
    const dayFactor = clamp(elevation * 2.2 + 0.25, 0, 1);
    // Bright golden hour: the sunset glow peaks while the sun is still
    // well up (elevation ~0.2), so the sky stays bright peach instead of
    // going muddy the moment the sun dips.
    const sunsetFactor = clamp(1 - Math.abs(elevation - 0.2) * 2.5, 0, 1) * (elevation > -0.15 ? 1 : 0);
    // Low golden-hour sun, far out to the south-west: long soft shadows
    // (a 7 m palm throws ~45 m of shadow) that stretch toward the camera
    // when driving south down the beach road, like the reference. The sun
    // dominates the hemisphere fill at golden hour, so shadows actually
    // read dark on the asphalt instead of washing out.
    sun.position.set(
      playerPos.x + azimuth * 190,
      Math.max(12, elevation * 140),
      playerPos.z + 120,
    );
    sun.target.position.copy(playerPos);
    sun.intensity = 0.3 + dayFactor * 1.7 + sunsetFactor * 0.5;
    sunColor.setRGB(1, lerp(0.7, 0.97, dayFactor), lerp(0.55, 0.93, dayFactor));
    sun.color.copy(sunColor);
    // Hemisphere fill lower than before, so shaded road and shaded
    // facades read as actual shadow (warm, not black) instead of
    // washing out to flat daylight — the long golden-hour shadows have
    // to stripe the road in the drive/chase frames.
    hemi.intensity = 0.29 + dayFactor * 0.35 + sunsetFactor * 0.09;
    const sky = new THREE.Color().copy(skyNight).lerp(skyDay, dayFactor);
    sky.lerp(skySunset, sunsetFactor * 0.8);
    sky.lerp(skyGolden, sunsetFactor * 0.35);
    scene.background = sky;
    scene.fog.color.copy(sky).lerp(new THREE.Color(PALETTE.fogDay), dayFactor * 0.4);
    scene.fog.color.lerp(fogSunset, sunsetFactor * 0.5);
    // The sky dome follows the player and tints with the same light.
    // Kept bright at golden hour: a dark tint would muddy the gradient.
    skyDome.position.set(playerPos.x, 0, playerPos.z);
    skyDomeMat.color.copy(skyNightTint).lerp(skyWhite, clamp(dayFactor * 0.95 + sunsetFactor * 0.35, 0.15, 1));
    // The sun disc hangs low in the south at golden hour, almost straight
    // down the beach road corridor — so it is actually IN the frame when
    // driving south, above the rooftops, in the same direction the
    // shadows fall away from. (The directional light sits a little west
    // of the disc; the ~15° difference is not something the eye measures,
    // and a disc hidden behind the west hotels would read far worse.)
    const discVisible = elevation < 0.45 && elevation > -0.12;
    sunDisc.visible = discVisible;
    sunGlow.visible = discVisible;
    if (discVisible) {
      // Low on the horizon, almost straight down the beach road corridor:
      // the sun sits IN the frame when driving south, big and amber.
      const dx = playerPos.x + 10;
      const dy = Math.max(14, elevation * 260 + 20);
      const dz = playerPos.z + 420;
      sunDisc.position.set(dx, dy, dz);
      sunDisc.lookAt(playerPos.x, dy, playerPos.z);
      sunGlow.position.set(dx, dy, dz - 2);
      sunDisc.material.opacity = 1;
      sunGlow.material.opacity = 0.55 + sunsetFactor * 0.35;
    }
    const night = 1 - dayFactor;
    nightF = night;
    // Windows and lamps glow at night — a little warm at sunset, so the
    // facades keep their pastel colours instead of washing orange.
    for (const bulb of lamps) bulb.material.emissiveIntensity = (night + sunsetFactor * 0.45) * 1.6;
    for (const mat of facadeMats) mat.emissiveIntensity = night * 0.85 + sunsetFactor * 0.15;
    // The sea catches the sunset — a warm glint on top of its own turquoise
    // glow, so the water stays bright instead of going muddy grey.
    waterMat.emissiveIntensity = 0.3 + sunsetFactor * 0.1;
    // The asphalt catches a little of it too — a small warm floor under
    // the sunset glow. Kept low now, so shadowed road stays visibly
    // darker than sunlit road instead of glowing through its own shadow.
    roadMat.emissiveIntensity = 0.03 + sunsetFactor * 0.04;
    // Clouds drift slowly across the sky and fade out at night.
    for (const cloud of clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 620) cloud.position.x = -620;
      cloud.material.opacity = cloud.userData.baseOpacity * clamp(dayFactor + sunsetFactor * 0.4, 0.08, 1);
    }
    // Traffic light lamps follow the cycle.
    for (const head of lightHeads) {
      const state = lightForAxis(head.axis);
      head.red.material.emissiveIntensity = state === 'red' ? 1.8 : 0.08;
      head.yellow.material.emissiveIntensity = state === 'yellow' ? 1.8 : 0.08;
      head.green.material.emissiveIntensity = state === 'green' ? 1.8 : 0.08;
    }
    // Ferris wheel turns; its cabins stay upright.
    wheelSpin.rotation.z += dt * 0.12;
    for (const cabin of wheelCabins) cabin.rotation.z = -wheelSpin.rotation.z;
    // Lighthouse beam sweeps at night.
    beam.visible = night > 0.5;
    beam.rotation.y += dt * 0.5;
    // Boats bob on the water: their hulls sit IN the water (y≈-0.45 base),
    // not hovering 0.7 m above it.
    for (let i = 0; i < boats.length; i += 1) {
      boats[i].position.y = -0.45 + Math.sin(cycleTime * 0.9 + i * 1.7) * 0.18;
      boats[i].rotation.z = Math.sin(cycleTime * 0.7 + i) * 0.03;
    }
    // Surf foam slides in and out with the swell.
    for (const f of foams) {
      f.mesh.position.x = f.baseX + Math.sin(cycleTime * 0.5 + f.phase) * 1.6;
    }
    // Gentle water shimmer.
    water.position.y = -0.5 + Math.sin(timeOfDay * 2.1) * 0.08;
  }

  // Push a circle (x, z, radius) out of every building box it overlaps.
  function resolveCircle(x, z, radius) {
    let px = x;
    let pz = z;
    for (const b of colliders) {
      const cx = clamp(px, b.x0, b.x1);
      const cz = clamp(pz, b.z0, b.z1);
      const dx = px - cx;
      const dz = pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          px = cx + (dx / d) * radius;
          pz = cz + (dz / d) * radius;
        } else {
          // Dead centre: push out along the smallest penetration axis.
          const pushLeft = px - (b.x0 - radius);
          const pushRight = b.x1 + radius - px;
          const pushUp = pz - (b.z0 - radius);
          const pushDown = b.z1 + radius - pz;
          const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
          if (min === pushLeft) px = b.x0 - radius;
          else if (min === pushRight) px = b.x1 + radius;
          else if (min === pushUp) pz = b.z0 - radius;
          else pz = b.z1 + radius;
        }
      }
    }
    px = clamp(px, -WORLD_HALF + 2, WORLD_HALF - 2);
    pz = clamp(pz, -WORLD_HALF + 2, WORLD_HALF - 2);
    return { x: px, z: pz };
  }

  function isOnRoad(x, z) {
    for (const p of ROAD_POSITIONS) {
      if (Math.abs(x - p) < ROAD_WIDTH / 2 + 1) return true;
      if (Math.abs(z - p) < ROAD_WIDTH / 2 + 1) return true;
    }
    return false;
  }

  return { colliders, lamps, update, resolveCircle, isOnRoad, sun, lightForAxis, nightFactor() { return nightF; }, setCycle(t) { cycleTime = t; } };
}
