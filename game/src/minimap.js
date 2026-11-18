// The minimap: a large 2D canvas in the HUD corner, GTA-style. Roads,
// water and the beach are drawn to scale, district names are labelled, then
// the player (white arrow), police (red), traffic (grey dots) and the
// mission target (yellow diamond). The same drawing, scaled up, powers the
// full-screen map (Tab) — drawOn takes any canvas, so the big map is the
// minimap at 720 px, not a second implementation to keep in sync.

import { ROAD_POSITIONS, ROAD_WIDTH, WORLD_HALF, SAND_X0, WATERLINE_X, DISTRICTS } from './config.js';

export function createMinimap() {
  const canvas = document.getElementById('minimap');
  const bigCanvas = document.getElementById('bigmap');

  function drawOn(cv, state) {
    const ctx = cv.getContext('2d');
    const SIZE = cv.width;
    const SCALE = SIZE / (WORLD_HALF * 2);
    const F = SIZE / 240; // symbol/font scale vs the 240 px HUD minimap

    function toMap(x, z) {
      return [(x + WORLD_HALF) * SCALE, (z + WORLD_HALF) * SCALE];
    }

    // Sea and land.
    ctx.fillStyle = '#1d4e63';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#233020';
    ctx.fillRect(0, 0, (SAND_X0 + WORLD_HALF) * SCALE, SIZE);
    ctx.fillStyle = '#c9b078';
    ctx.fillRect((SAND_X0 + WORLD_HALF) * SCALE, 0, (WATERLINE_X - SAND_X0) * SCALE, SIZE);
    // Roads.
    ctx.fillStyle = '#3a3d42';
    for (const p of ROAD_POSITIONS) {
      const [x] = toMap(p, 0);
      ctx.fillRect(x - (ROAD_WIDTH / 2) * SCALE, 0, ROAD_WIDTH * SCALE, SIZE);
      const [, z] = toMap(0, p);
      ctx.fillRect(0, z - (ROAD_WIDTH / 2) * SCALE, SIZE, ROAD_WIDTH * SCALE);
    }
    // District names, so the map reads as the city, not a bare grid.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `bold ${Math.round(10 * F)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const d of DISTRICTS) {
      const [x, z] = toMap((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2);
      ctx.fillText(d.name.toUpperCase(), x, z);
    }
    // Traffic dots.
    ctx.fillStyle = '#c8c8c8';
    const dot = Math.max(2, Math.round(2 * F));
    for (const car of state.trafficCars) {
      const [x, z] = toMap(car.x, car.z);
      ctx.fillRect(x - dot / 2, z - dot / 2, dot, dot);
    }
    // Police dots.
    ctx.fillStyle = '#ff4444';
    for (const car of state.copCars) {
      const [x, z] = toMap(car.x, car.z);
      ctx.beginPath();
      ctx.arc(x, z, 3 * F, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mission target diamond.
    if (state.missionTarget) {
      const [x, z] = toMap(state.missionTarget.x, state.missionTarget.z);
      ctx.fillStyle = '#ffd23b';
      ctx.beginPath();
      ctx.moveTo(x, z - 8 * F);
      ctx.lineTo(x + 7 * F, z);
      ctx.lineTo(x, z + 8 * F);
      ctx.lineTo(x - 7 * F, z);
      ctx.closePath();
      ctx.fill();
    }
    // Landmarks: Solmar Tower (gold square), lighthouse (white) and the
    // ferris wheel (pink) — the map reads as the city, not just roads.
    const [tx, tz] = toMap(0, -90);
    ctx.fillStyle = '#ffd23b';
    ctx.fillRect(tx - 3 * F, tz - 3 * F, 6 * F, 6 * F);
    const [lx, lz] = toMap(335, -320);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lx, lz, 3 * F, 0, Math.PI * 2);
    ctx.fill();
    const [wx, wz] = toMap(322, 120);
    ctx.fillStyle = '#ff5e8a';
    ctx.beginPath();
    ctx.arc(wx, wz, 4 * F, 0, Math.PI * 2);
    ctx.fill();
    // Compass: N at the top edge.
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(13 * F)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('N', SIZE / 2, 14 * F);
    // Player view cone: a faint wedge showing where Dani looks.
    const [px2, pz2] = toMap(state.playerX, state.playerZ);
    ctx.save();
    ctx.translate(px2, pz2);
    ctx.rotate(Math.PI - state.heading);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-18 * F, -44 * F);
    ctx.lineTo(18 * F, -44 * F);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Player arrow, rotated to the heading.
    const [px, pz] = toMap(state.playerX, state.playerZ);
    ctx.save();
    ctx.translate(px, pz);
    // Canvas Y points down, so the arrow needs PI - heading to point
    // along the world forward vector (sin h, cos h).
    ctx.rotate(Math.PI - state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8 * F);
    ctx.lineTo(5 * F, 6 * F);
    ctx.lineTo(0, 3 * F);
    ctx.lineTo(-5 * F, 6 * F);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    draw(state) {
      drawOn(canvas, state);
    },
    drawBig(state) {
      if (bigCanvas) drawOn(bigCanvas, state);
    },
  };
}
