// The minimap: a small 2D canvas in the HUD corner. Roads, water and the
// beach are drawn to scale, then the player (white arrow), police (red),
// traffic (grey dots) and the mission target (yellow diamond).

import { ROAD_POSITIONS, ROAD_WIDTH, WORLD_HALF, BEACH_X, WATER_X } from './config.js';

export function createMinimap() {
  const canvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');
  const SIZE = canvas.width;
  const SCALE = SIZE / (WORLD_HALF * 2);

  function toMap(x, z) {
    return [(x + WORLD_HALF) * SCALE, (z + WORLD_HALF) * SCALE];
  }

  return {
    draw(state) {
      // Sea and land.
      ctx.fillStyle = '#1d4e63';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = '#233020';
      ctx.fillRect(0, 0, (BEACH_X + WORLD_HALF) * SCALE, SIZE);
      ctx.fillStyle = '#c9b078';
      ctx.fillRect((BEACH_X + WORLD_HALF) * SCALE, 0, (WATER_X - BEACH_X) * SCALE, SIZE);
      // Roads.
      ctx.fillStyle = '#3a3d42';
      for (const p of ROAD_POSITIONS) {
        const [x] = toMap(p, 0);
        ctx.fillRect(x - (ROAD_WIDTH / 2) * SCALE, 0, ROAD_WIDTH * SCALE, SIZE);
        const [, z] = toMap(0, p);
        ctx.fillRect(0, z - (ROAD_WIDTH / 2) * SCALE, SIZE, ROAD_WIDTH * SCALE);
      }
      // Traffic dots.
      ctx.fillStyle = '#c8c8c8';
      for (const car of state.trafficCars) {
        const [x, z] = toMap(car.x, car.z);
        ctx.fillRect(x - 1, z - 1, 2, 2);
      }
      // Police dots.
      ctx.fillStyle = '#ff4444';
      for (const car of state.copCars) {
        const [x, z] = toMap(car.x, car.z);
        ctx.beginPath();
        ctx.arc(x, z, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Mission target diamond.
      if (state.missionTarget) {
        const [x, z] = toMap(state.missionTarget.x, state.missionTarget.z);
        ctx.fillStyle = '#ffd23b';
        ctx.beginPath();
        ctx.moveTo(x, z - 6);
        ctx.lineTo(x + 5, z);
        ctx.lineTo(x, z + 6);
        ctx.lineTo(x - 5, z);
        ctx.closePath();
        ctx.fill();
      }
      // Landmarks: Solmar Tower (gold square), lighthouse (white) and the
      // ferris wheel (pink) — the map reads as the city, not just roads.
      const [tx, tz] = toMap(0, -90);
      ctx.fillStyle = '#ffd23b';
      ctx.fillRect(tx - 3, tz - 3, 6, 6);
      const [lx, lz] = toMap(335, -320);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lx, lz, 3, 0, Math.PI * 2);
      ctx.fill();
      const [wx, wz] = toMap(322, 120);
      ctx.fillStyle = '#ff5e8a';
      ctx.beginPath();
      ctx.arc(wx, wz, 4, 0, Math.PI * 2);
      ctx.fill();
      // Compass: N at the top edge.
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', SIZE / 2, 12);
      // Player view cone: a faint wedge showing where Dani looks.
      const [px2, pz2] = toMap(state.playerX, state.playerZ);
      ctx.save();
      ctx.translate(px2, pz2);
      ctx.rotate(Math.PI - state.heading);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-14, -34);
      ctx.lineTo(14, -34);
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
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}
