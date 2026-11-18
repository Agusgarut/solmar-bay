// Solmar Bay — shared constants and world layout.
// One file, one job: every number the rest of the game agrees on lives here,
// so tuning the city, the cars or the police means editing this file only.

// World: a square coastal city, units are metres.
export const WORLD_HALF = 360; // city spans -360..360 on x and z
export const ROAD_SPACING = 90;
export const ROAD_WIDTH = 14;
export const ROAD_POSITIONS = [-315, -225, -135, -45, 45, 135, 225, 315];
export const BEACH_X = 300; // sand starts here, water further east
export const WATER_X = 360;
// Round 6: the beach is NARROW so the sea sits close to the road — sand
// 322..348, waterline at 348, so the ocean fills the left of the frame when
// driving south down Ocean boulevard instead of a thin strip.
export const SAND_X0 = 322;
export const WATERLINE_X = 348;

// Traffic & crowd density: the streets must read busy, like the entries on
// the feed — cars close together on the main roads, people on every sidewalk.
export const TRAFFIC_CARS = 80;
export const PARKED_CARS = 28;
export const PEDESTRIANS = 140;

// Player / on-foot tuning.
export const WALK_SPEED = 6;
export const RUN_SPEED = 11;
export const JUMP_SPEED = 8;
export const GRAVITY = 22;
export const PLAYER_RADIUS = 0.55;

// Arcade car tuning.
export const CAR_ACCEL = 26;
export const CAR_BRAKE = 46;
export const CAR_REVERSE_ACCEL = 16;
export const CAR_MAX_SPEED = 42;
export const CAR_MAX_REVERSE = 12;
export const CAR_TURN = 1.9;
export const CAR_DRAG = 0.55;

// Wanted system.
export const MAX_WANTED = 5;
export const WANTED_DECAY_SECONDS = 26; // hidden this long -> one star drops

// Money.
export const START_MONEY = 250;

// Day cycle: one full day per 6 minutes of play.
export const DAY_LENGTH_SECONDS = 360;

// Camera.
export const CAMERA_DISTANCE = 8.0;
export const CAMERA_HEIGHT = 3.4;
// Chase cam in a car: low and close, so the car fills the lower third of
// the frame like the entries on the feed (GTA-style), not small and far.
export const CAMERA_CAR_DISTANCE = 4.8;
export const CAMERA_CAR_HEIGHT = 1.9;

// Golden hour: the game opens at sunset, like the entries on the feed.
export const GOLDEN_HOUR = 17.4;
export const HELI_MIN_WANTED = 3;
export const SKID_MIN_SPEED = 15;

// District names, west to east, south to north, for flavour text.
export const DISTRICTS = [
  { name: 'Old Town', x0: -360, x1: -90, z0: -360, z1: 90 },
  { name: 'Downtown', x0: -90, x1: 90, z0: -180, z1: 180 },
  { name: 'Marina', x0: -360, x1: 90, z0: 180, z1: 360 },
  { name: 'Industrial', x0: 90, x1: 300, z0: -360, z1: -90 },
  { name: 'Beachfront', x0: 90, x1: 360, z0: -90, z1: 360 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
  }
  return 'Solmar Bay';
}

// Sun-soaked palette: bright golden-hour sky, warm sand, teal water,
// dark asphalt — the game should read as a bright afternoon in the sun,
// not a dim dusk. The asphalt value matches the road texture (round 6:
// dark, warm-grey, never wide brown).
export const PALETTE = {
  skyDay: 0x87bfe8,
  skySunset: 0xffb070,
  skyNight: 0x0e1a33,
  skyGolden: 0xffc27a,
  fogDay: 0xa8c8e0,
  fogSunset: 0xffd0a0,
  sunDisc: 0xffe9a8,
  water: 0x2e7f9e,
  sand: 0xe8d29a,
  grass: 0x7d9a62,
  asphalt: 0x38332d,
  sidewalk: 0xb0a894,
  buildingGlass: 0x9fc4d8,
};

// Street names for the HUD district label: one per road line, in the same
// order as ROAD_POSITIONS.
export const ROAD_NAMES = [
  'Jl. Kota Tua', 'Jl. Merdeka', 'Jl. Pelabuhan', 'Jl. Sudirman',
  'Jl. Marina', 'Jl. Pesisir', 'Jl. Pantai', 'Jl. Ocean',
];

// The nearest road line gives the street; the axis gives the suffix
// ("Utara" for a north-south road, "Timur" for an east-west one).
export function streetAt(x, z) {
  let bestIndex = 0;
  let bestAxis = 'x';
  let bestD = Infinity;
  for (let i = 0; i < ROAD_POSITIONS.length; i += 1) {
    const dx = Math.abs(x - ROAD_POSITIONS[i]);
    if (dx < bestD) {
      bestD = dx;
      bestIndex = i;
      bestAxis = 'x';
    }
    const dz = Math.abs(z - ROAD_POSITIONS[i]);
    if (dz < bestD) {
      bestD = dz;
      bestIndex = i;
      bestAxis = 'z';
    }
  }
  const name = ROAD_NAMES[bestIndex] || 'Jl. Solmar';
  return bestAxis === 'x' ? `${name} Utara` : `${name} Timur`;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest-arc interpolation between two angles, in radians.
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function distance2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
