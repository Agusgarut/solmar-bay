// Solmar Bay itself: ground, beach and water, the road grid with traffic
// lights and crosswalks, sidewalks, parks, and district-by-district
// buildings — glass towers downtown, low terracotta Old Town, warehouses in
// Industrial, hotels on Beachfront — plus the landmarks (Solmar Tower, the
// lighthouse, the ferris wheel, the pier), neon signs, palms and street
// lamps, and the sun and day/night cycle. Also owns the collision boxes the
// rest of the game tests against, and the road helpers traffic uses.

import * as THREE from 'three';
import { ROAD_POSITIONS, ROAD_WIDTH, WORLD_HALF, BEACH_X, WATER_X, PALETTE, clamp, lerp } from './config.js';
import { pick, range } from './random.js';

const FACADE_COLORS = ['#d9b48f', '#c98a6b', '#b8c4c4', '#e0cfa8', '#a8b8c4'];
const GLASS_COLORS = ['#7fa8c4', '#5f8aa8', '#8fb4c8'];

function makeFacadeTexture(rng, base, glass) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Window grid: some lit warm, most dark glass; glass towers get denser,
  // bluer windows.
  const rows = glass ? 16 : 12;
  const cols = glass ? 8 : 6;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lit = rng() < (glass ? 0.2 : 0.28);
      g.fillStyle = lit ? '#ffd98a' : glass ? '#274b63' : '#2e4250';
      g.fillRect(6 + col * (128 / cols), 8 + row * (256 / rows), 128 / cols - 6, 256 / rows - 7);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeRoadTexture() {
  // Canvas is wide: the dashes run along U, the road's long axis.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#33363b';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#d8d8c8';
  g.fillRect(20, 30, 90, 4);
  g.fillRect(150, 30, 90, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(90, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

  // Ground: city slab, then sand, then water to the east.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 80, WORLD_HALF * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x6f7f5a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF - BEACH_X + 60, WORLD_HALF * 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(BEACH_X + (WORLD_HALF - BEACH_X) / 2, 0.03, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(560, WORLD_HALF * 2 + 400),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WATER_X + 280, -0.5, 0);
  group.add(water);

  // Roads with dashed centre lines, and sidewalks along their edges.
  // Geometries are pre-rotated flat (rotateY turns a road along X into one
  // along Z), so no per-mesh Euler guesswork is needed.
  const roadTexture = makeRoadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTexture });
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

  // Crosswalks at the four central intersections: striped planes.
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 128;
  stripeCanvas.height = 64;
  const sg = stripeCanvas.getContext('2d');
  sg.fillStyle = '#33363b';
  sg.fillRect(0, 0, 128, 64);
  sg.fillStyle = '#e8e8dc';
  for (let i = 0; i < 6; i += 1) sg.fillRect(6 + i * 21, 6, 10, 52);
  const stripeTex = new THREE.CanvasTexture(stripeCanvas);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  const crossGeo = new THREE.PlaneGeometry(14, 7);
  crossGeo.rotateX(-Math.PI / 2);
  const crossGeoZ = crossGeo.clone();
  crossGeoZ.rotateY(Math.PI / 2);
  const crossMat = new THREE.MeshLambertMaterial({ map: stripeTex });
  for (const ix of [-45, 45]) {
    for (const iz of [-45, 45]) {
      for (const [dx, dz, geo] of [[-11, 0, crossGeoZ], [11, 0, crossGeoZ], [0, -11, crossGeo], [0, 11, crossGeo]]) {
        const cross = new THREE.Mesh(geo, crossMat);
        cross.position.set(ix + dx, 0.04, iz + dz);
        cross.receiveShadow = true;
        group.add(cross);
      }
    }
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
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.4, 6), poleMat);
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
  const glassTextures = GLASS_COLORS.map((c) => makeFacadeTexture(rng, c, true));
  const roofColors = [0xb5654a, 0x8a5a3c, 0x6b7c8a, 0x9c8a6a];
  const ranges = blockRanges();
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const NEON_SIGNS = [
    ['HOTEL', '#ff5e8a'], ['SOLMAR', '#4fd8ff'], ['PIZZA', '#ffb13b'],
    ['BAR', '#ff4f4f'], ['NEON', '#b46bff'], ['24H', '#7bff9e'],
    ['TACOS', '#ffe14f'], ['CINEMA', '#4f9dff'],
  ];

  function addBuilding(cx, cz, w, d, h, district) {
    const glass = district === 'downtown';
    // Clone the facade texture per building and repeat it to the building's
    // size, so windows stay the same size on every facade instead of
    // stretching into giant slabs on wide towers.
    const baseTex = glass ? pick(rng, glassTextures) : pick(rng, facadeTextures);
    const tex = baseTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, Math.round(w / 20)), Math.max(1, Math.round(h / 24)));
    const facade = new THREE.MeshLambertMaterial({
      map: tex, emissive: 0xffb45e, emissiveMap: tex, emissiveIntensity: 0,
    });
    facadeMats.push(facade);
    const roofColor = district === 'industrial' ? 0x5a6068 : pick(rng, roofColors);
    const roof = new THREE.MeshLambertMaterial({ color: roofColor });
    const building = new THREE.Mesh(buildingGeo, [facade, facade, roof, roof, facade, facade]);
    building.scale.set(w, h, d);
    building.position.set(cx, h / 2, cz);
    building.castShadow = true;
    building.receiveShadow = true;
    group.add(building);
    colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
    // Rooftop box on tall towers.
    if (h > 42) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 3, d * 0.3), roof);
      box.position.set(cx, h + 1.5, cz);
      box.castShadow = true;
      group.add(box);
    }
    // Neon sign on some tall downtown / beachfront buildings.
    if ((district === 'downtown' || district === 'beachfront') && h > 30 && rng() < 0.45) {
      const [text, color] = pick(rng, NEON_SIGNS);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(11, 2.8),
        new THREE.MeshBasicMaterial({ map: makeSignTexture(text, color) }),
      );
      sign.position.set(cx, h * 0.72, cz + d / 2 + 0.35);
      group.add(sign);
    }
    return building;
  }

  // Trees and benches, shared by parks and streets.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2c });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a3a });
  function tree(x, z, scale) {
    const s = scale || 1;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.28 * s, 3 * s, 6), trunkMat);
    trunk.position.set(x, 1.5 * s, z);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9 * s, 0), leafMat);
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

  const parkMat = new THREE.MeshLambertMaterial({ color: 0x4d7a3c });
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
          let h;
          if (district === 'downtown') h = range(rng, 34, 82);
          else if (district === 'industrial') h = range(rng, 8, 15);
          else if (district === 'beachfront') h = range(rng, 22, 48);
          else if (district === 'marina') h = range(rng, 8, 18);
          else h = range(rng, 9, 24); // old town: low and tight
          const bw = district === 'industrial' ? w : range(rng, w * 0.6, w);
          const bd = district === 'industrial' ? d : range(rng, d * 0.6, d);
          addBuilding((lx0 + lx1) / 2, (lz0 + lz1) / 2, bw, bd, h, district);
        }
      }
    }
  }

  // Landmarks ------------------------------------------------------------
  // Solmar Tower: the tallest building in the city, downtown.
  {
    const baseTex = pick(rng, glassTextures);
    const tex = baseTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 5);
    const facade = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffb45e, emissiveMap: tex, emissiveIntensity: 0 });
    facadeMats.push(facade);
    const tower = new THREE.Mesh(buildingGeo, [facade, facade, new THREE.MeshLambertMaterial({ color: 0x3a4a5a }), new THREE.MeshLambertMaterial({ color: 0x3a4a5a }), facade, facade]);
    tower.scale.set(30, 112, 30);
    tower.position.set(0, 56, -90);
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);
    colliders.push({ x0: -15, x1: 15, z0: -105, z1: -75 });
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
  for (const [bx, bz] of [[400, -90], [430, 40], [395, 150], [450, -160]]) {
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

  // Palms along the beach and street trees.
  function palm(x, z) {
    const palmGroup = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
    trunk.position.y = 3.5;
    trunk.castShadow = true;
    palmGroup.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 0), leafMat);
    crown.position.y = 7.6;
    crown.scale.y = 0.7;
    crown.castShadow = true;
    palmGroup.add(crown);
    palmGroup.position.set(x, 0, z);
    group.add(palmGroup);
  }
  for (let z = -340; z <= 340; z += 28) palm(BEACH_X - 8 + range(rng, -3, 3), z);
  for (let i = 0; i < 30; i += 1) {
    tree(range(rng, -300, 280), range(rng, -300, 300), range(rng, 0.9, 1.3));
  }

  // Street lamps along the roads.
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const bulbGeo = new THREE.SphereGeometry(0.35, 8, 6);
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
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.7);
  scene.add(hemi);
  scene.fog = new THREE.Fog(PALETTE.fogDay, 180, 700);

  const skyDay = new THREE.Color(PALETTE.skyDay);
  const skySunset = new THREE.Color(PALETTE.skySunset);
  const skyNight = new THREE.Color(PALETTE.skyNight);
  const sunColor = new THREE.Color();
  let cycleTime = 0;

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
    const dayFactor = clamp(elevation * 2.2, 0, 1);
    const sunsetFactor = clamp(1 - Math.abs(elevation) * 3.2, 0, 1) * (elevation > -0.15 ? 1 : 0);
    sun.position.set(
      playerPos.x + azimuth * 140,
      Math.max(18, elevation * 160),
      playerPos.z + 90,
    );
    sun.target.position.copy(playerPos);
    sun.intensity = 0.12 + dayFactor * 1.3;
    sunColor.setRGB(1, lerp(0.55, 0.95, dayFactor), lerp(0.35, 0.9, dayFactor));
    sun.color.copy(sunColor);
    hemi.intensity = 0.25 + dayFactor * 0.5;
    const sky = new THREE.Color().copy(skyNight).lerp(skyDay, dayFactor);
    sky.lerp(skySunset, sunsetFactor * 0.65);
    scene.background = sky;
    scene.fog.color.copy(sky).lerp(new THREE.Color(PALETTE.fogDay), dayFactor * 0.4);
    const night = 1 - dayFactor;
    for (const bulb of lamps) bulb.material.emissiveIntensity = night * 1.6;
    // Windows glow at night.
    for (const mat of facadeMats) mat.emissiveIntensity = night * 0.85;
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
    // Boats bob on the water.
    for (let i = 0; i < boats.length; i += 1) {
      boats[i].position.y = Math.sin(cycleTime * 0.9 + i * 1.7) * 0.18;
      boats[i].rotation.z = Math.sin(cycleTime * 0.7 + i) * 0.03;
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

  return { colliders, lamps, update, resolveCircle, isOnRoad, sun, lightForAxis, setCycle(t) { cycleTime = t; } };
}
