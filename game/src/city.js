// Solmar Bay itself: ground, beach and water, the road grid, sidewalks,
// procedural buildings with lit windows, palms and street lamps, plus the sun
// and the day/night cycle. Also owns the collision boxes the rest of the
// game tests against, and the road helpers traffic and pedestrians use.

import * as THREE from 'three';
import { ROAD_POSITIONS, ROAD_WIDTH, WORLD_HALF, BEACH_X, WATER_X, PALETTE, clamp, lerp } from './config.js';
import { pick, range } from './random.js';

const FACADE_COLORS = ['#d9b48f', '#c98a6b', '#b8c4c4', '#e0cfa8', '#a8b8c4'];

function makeFacadeTexture(rng, base) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Window grid: some lit warm, most dark glass.
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const lit = rng() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : '#2e4250';
      g.fillRect(8 + col * 20, 10 + row * 20, 12, 14);
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

function blockRanges() {
  // Gaps between the roads (road width 14, so 7 each side) plus the edges.
  const edges = [-WORLD_HALF];
  for (const p of ROAD_POSITIONS) edges.push(p + ROAD_WIDTH / 2);
  const ranges = [];
  for (let i = 0; i < ROAD_POSITIONS.length; i += 1) {
    const x0 = i === 0 ? -WORLD_HALF : ROAD_POSITIONS[i - 1] + ROAD_WIDTH / 2;
    const x1 = ROAD_POSITIONS[i] - ROAD_WIDTH / 2;
    ranges.push([x0, x1]);
  }
  ranges.push([ROAD_POSITIONS[ROAD_POSITIONS.length - 1] + ROAD_WIDTH / 2, WORLD_HALF]);
  return ranges;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const lamps = [];
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

  // Buildings: one to three per block, taller downtown, terracotta roofs.
  const facadeTextures = FACADE_COLORS.map((c) => makeFacadeTexture(rng, c));
  const roofColors = [0xb5654a, 0x8a5a3c, 0x6b7c8a, 0x9c8a6a];
  const ranges = blockRanges();
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [bx0, bx1] of ranges) {
    if (bx0 >= BEACH_X - 10) continue; // the beach stays open
    for (const [bz0, bz1] of ranges) {
      const downtown = bx0 > -90 && bx1 < 90 && bz0 > -180 && bz1 < 180;
      const industrial = bx0 > 90 && bz0 < -90;
      const count = industrial ? 1 : 1 + Math.floor(rng() * (downtown ? 3 : 2));
      for (let i = 0; i < count; i += 1) {
        const w = range(rng, 18, Math.min(42, (bx1 - bx0) / count));
        const d = range(rng, 18, Math.min(42, bz1 - bz0));
        const h = downtown
          ? range(rng, 26, 68)
          : industrial ? range(rng, 8, 16) : range(rng, 10, 30);
        const cx = bx0 + ((i + 0.5) / count) * (bx1 - bx0) + range(rng, -4, 4);
        const cz = (bz0 + bz1) / 2 + range(rng, -8, 8);
        const facade = new THREE.MeshLambertMaterial({ map: pick(rng, facadeTextures) });
        const roof = new THREE.MeshLambertMaterial({ color: pick(rng, roofColors) });
        const building = new THREE.Mesh(buildingGeo, [facade, facade, roof, roof, facade, facade]);
        building.scale.set(w, h, d);
        building.position.set(cx, h / 2, cz);
        building.castShadow = true;
        building.receiveShadow = true;
        group.add(building);
        colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
      }
    }
  }

  // Palms along the beach and a few in the parks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a3a });
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
  for (let i = 0; i < 24; i += 1) {
    palm(range(rng, -300, 280), range(rng, -300, 300));
  }

  // Street lamps along the roads.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
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

  function update(dt, timeOfDay, playerPos) {
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

  return { colliders, lamps, update, resolveCircle, isOnRoad, sun };
}
