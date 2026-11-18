// The chase director: the police helicopter's searchlight, and the live
// chase state the HUD reads. The light is a cone stretched from the
// helicopter down to the hero car, plus a bright pool on the road under
// the car — the "helicopter hunting the player" read from the reference
// frame. The "TERLIHAT · HERON-1" badge only lights up while the beam is
// actually on the player. This module never spawns police; the police
// system owns the force, this one only aims its light and reports what
// it sees.

import * as THREE from 'three';
import { clamp } from './config.js';

// The helicopter's callsign, shared with the dispatch list in police.js:
// one place for it, so the HUD badge and the dispatch row can never
// disagree with each other.
export const HELI_CALLSIGN = 'HERON-1';

// The cone's apex points down its local -Y (the geometry is flipped once
// over in police.js), so aiming it is a single quaternion: rotate -Y
// onto the direction helicopter -> player.
const DOWN = new THREE.Vector3(0, -1, 0);

export function createChase(scene) {
  // Ground pool: two flat circles under the player — a wide soft wash
  // and a hot core — so the beam lands visibly on the asphalt even
  // where the cone itself goes thin against the sunset sky.
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 24), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.06;
  pool.visible = false;
  scene.add(pool);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff6cc, transparent: true, opacity: 0, depthWrite: false });
  const core = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), coreMat);
  core.rotation.x = -Math.PI / 2;
  core.position.y = 0.08;
  core.visible = false;
  scene.add(core);

  let heliOut = false;
  let spotting = false;
  const tmpDir = new THREE.Vector3();
  const tmpMid = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();

  // Aim the beam and the pool once, from the current world state.
  // update() calls this every frame; the screenshot staging calls it
  // again after posing the helicopter, so the beam never lags one frame
  // behind the helicopter it belongs to.
  function sync(ctx) {
    const heli = ctx.police.heli;
    const player = ctx.player;
    if (!heli) {
      heliOut = false;
      spotting = false;
      pool.visible = false;
      core.visible = false;
      return;
    }
    heliOut = true;
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    const hx = heli.group.position.x;
    const hy = heli.group.position.y;
    const hz = heli.group.position.z;
    // Direction helicopter -> player, and the beam stretched to match:
    // the cone is 34 m long at rest, so scale it to the real distance.
    tmpDir.set(px - hx, 0 - hy, pz - hz);
    const dist = clamp(tmpDir.length(), 20, 90);
    tmpDir.normalize();
    tmpQuat.setFromUnitVectors(DOWN, tmpDir);
    const beam = heli.beam;
    beam.quaternion.copy(tmpQuat);
    tmpMid.set(hx, hy, hz).addScaledVector(tmpDir, dist / 2);
    beam.position.copy(tmpMid);
    beam.scale.set(1, dist / 34, 1);
    // The beam reads from dusk on: a faint wash at golden hour, a hard
    // cone at night. At 17:30 the night factor is about 0.47, so the
    // chase frame already gets a visible beam.
    const night = ctx.city.nightFactor();
    beam.material.opacity = 0.10 + night * 0.22;
    beam.visible = true;
    // Spotting is what the HUD badge and the dispatch row read: the beam
    // only counts as "on the player" once dusk makes it visible.
    heli.spotting = night > 0.25;
    spotting = heli.spotting;
    // The pool sits under the player and tightens as the helicopter
    // closes in — the closer the chopper, the hotter the light.
    const closeness = 1 - dist / 90;
    pool.position.set(px, 0.06, pz);
    core.position.set(px, 0.08, pz);
    poolMat.opacity = 0.14 + closeness * 0.22;
    coreMat.opacity = 0.22 + closeness * 0.3;
    pool.visible = true;
    core.visible = true;
  }

  return {
    sync,
    update(_dt, ctx) {
      sync(ctx);
    },
    // The helicopter's callsign while one is out, '' otherwise — the HUD
    // badge reads this, so it never names a helicopter that isn't there.
    heliUnit() {
      return heliOut ? HELI_CALLSIGN : '';
    },
    // True while the beam is on the player: the "TERLIHAT · HERON-1"
    // badge and the dispatch "SPOTLIGHT ON YOU" row read this.
    spotting() {
      return spotting;
    },
  };
}
