// Missions: Dani Reyes' story in six jobs. Each mission is a list of
// objectives — go somewhere, pick something up, take a car, survive a
// shootout, lose the police — with a briefing, a 3D beacon over the target,
// a HUD arrow and a cash reward. Finishing one unlocks the next and saves.

import * as THREE from 'three';
import { distance2D } from './config.js';

// Target spots around the city (x, z, label).
const SPOTS = {
  marina: { x: -270, z: 270, label: 'Marina' },
  downtown: { x: 0, z: 0, label: 'Downtown' },
  oldTown: { x: -270, z: -270, label: 'Old Town' },
  beach: { x: 270, z: 180, label: 'Beachfront' },
  industrial: { x: 225, z: -270, label: 'Industrial' },
  garage: { x: 135, z: 225, label: "Rico's Garage" },
  safehouse: { x: -135, z: 135, label: 'Safehouse' },
  port: { x: 270, z: -180, label: 'Port Warehouse' },
};

export const MISSIONS = [
  {
    title: 'Kurir Pagi',
    briefing: 'Dani, bawa paket ini dari Marina ke Downtown. Jangan telat, jangan ditabrak.',
    intro: { speaker: 'Rico', line: 'Paketnya di Marina, Dani. Bawa ke Downtown, jangan telat.' },
    doneLine: { speaker: 'Rico', line: 'Bagus. Klien senang, duit jalan terus.' },
    reward: 400,
    objectives: [
      { type: 'goto', spot: 'marina', text: 'Ambil paket di Marina' },
      { type: 'goto', spot: 'downtown', text: 'Antar paket ke Downtown', say: { speaker: 'Dani', line: 'Paket di tangan. Sekarang ke Downtown.' } },
    ],
  },
  {
    title: 'Tagihan Lama',
    briefing: 'Si Beni ngutang dan pura-pura lupa. Pergi ke Old Town, tagih dengan tanganmu.',
    intro: { speaker: 'Rico', line: 'Beni ngutang dan pura-pura lupa. Tagih dia, pakai tangan kalau perlu.' },
    doneLine: { speaker: 'Beni', line: 'Oke oke! Duitnya ada, jangan pukul lagi!' },
    reward: 650,
    objectives: [
      { type: 'goto', spot: 'oldTown', text: 'Temui Beni di Old Town' },
      { type: 'punch', spot: 'oldTown', text: 'Tagih Beni (pukul dengan F)' },
    ],
  },
  {
    title: 'Balapan Liar',
    briefing: 'Balapan jalanan di Beachfront. Lewati semua checkpoint sebelum waktu habis.',
    intro: { speaker: 'Zara', line: 'Balapan liar di Beachfront. Jangan kalah sama mereka, Dani.' },
    doneLine: { speaker: 'Zara', line: 'Kamu yang tercepat di Solmar Bay. Gila!' },
    reward: 900,
    objectives: [
      { type: 'goto', spot: 'beach', text: 'Ke garis start di Beachfront' },
      { type: 'race', spots: ['industrial', 'downtown', 'marina', 'beach'], time: 150, text: 'Lewati 4 checkpoint!' },
    ],
  },
  {
    title: 'Barang Panas',
    briefing: 'Ada coupe merah parkir di Industrial. Bawa ke garasi Rico — dan jangan sampai polisi lihat.',
    intro: { speaker: 'Rico', line: 'Coupe merah di Industrial. Bawa ke garasiku, jangan sampai polisi lihat.' },
    doneLine: { speaker: 'Rico', line: 'Mobilnya mulus. Kamu memang bisa diandalkan.' },
    reward: 1200,
    objectives: [
      { type: 'goto', spot: 'industrial', text: 'Temukan coupe merah' },
      { type: 'steal', spot: 'industrial', text: 'Curi coupe-nya (E di dekat mobil)' },
      { type: 'deliver', spot: 'garage', text: 'Antar ke garasi Rico', say: { speaker: 'Dani', line: 'Coupe didapat. Sekarang kabur ke garasi Rico.' } },
    ],
  },
  {
    title: 'Gudang Pelabuhan',
    briefing: 'Geng Pelabuhan nahan barang kita. Bersihkan gudang itu — pistolmu sudah terisi.',
    intro: { speaker: 'Rico', line: 'Geng Pelabuhan nahan barang kita. Bersihkan gudang itu.' },
    doneLine: { speaker: 'Dani', line: 'Gudang bersih. Barang kita kembali.' },
    reward: 1800,
    objectives: [
      { type: 'goto', spot: 'port', text: 'Ke gudang pelabuhan' },
      { type: 'kill', spot: 'port', count: 5, text: 'Habisi 5 penjaga gudang' },
    ],
  },
  {
    title: 'Pelarian Terakhir',
    briefing: 'Polisi sudah di mana-mana. Kabur dari kejaran mereka dan sampai ke safehouse.',
    intro: { speaker: 'Zara', line: 'Polisi di mana-mana! Bertahan 60 detik, lalu ke safehouse!' },
    doneLine: { speaker: 'Zara', line: 'Kamu lolos. Solmar Bay sekarang milik kita.' },
    reward: 3000,
    objectives: [
      { type: 'survive', seconds: 60, text: 'Bertahan dari kejaran polisi (60 detik)' },
      { type: 'goto', spot: 'safehouse', text: 'Kabur ke safehouse' },
    ],
  },
];

export function createMissions(scene) {
  // The beacon: a glowing pillar and a ring over the current target.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.45, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beaconMat);
  beacon.visible = false;
  scene.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3, 0.25, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23b }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  let current = null; // { mission, objectiveIndex, state... }
  let raceIndex = 0;
  let killCount = 0;
  let surviveTimer = 0;
  let objectiveTimer = 0;

  function startMission(index, ctx) {
    const mission = MISSIONS[index];
    if (!mission) return false;
    current = { mission, index, objectiveIndex: 0 };
    raceIndex = 0;
    killCount = 0;
    surviveTimer = 0;
    objectiveTimer = 0;
    ctx.save.missionIndex = index;
    // The big banner carries the briefing — no second box on top of it.
    ctx.hud.showMissionBanner(`MISI ${index + 1} — ${mission.title}`, mission.briefing);
    if (mission.intro) ctx.hud.showDialogue(mission.intro.speaker, mission.intro.line, 5);
    ctx.audio.pickup();
    // Mission 4 needs its special car parked at the spot.
    if (index === 3) ctx.spawnMissionCar();
    // Mission 5 needs its guards.
    if (index === 4) ctx.spawnMissionEnemies();
    // Mission 6 starts hot.
    if (index === 5) ctx.police.setWanted(4);
    return true;
  }

  function currentObjective() {
    if (!current) return null;
    return current.mission.objectives[current.objectiveIndex] || null;
  }

  function objectiveSpot(objective) {
    if (!objective) return null;
    if (objective.type === 'race') return SPOTS[objective.spots[raceIndex]];
    if (objective.spot) return SPOTS[objective.spot];
    return null;
  }

  function advance(ctx) {
    const next = current.mission.objectives[current.objectiveIndex + 1];
    current.objectiveIndex += 1;
    ctx.audio.pickup();
    if (next && next.say) ctx.hud.showDialogue(next.say.speaker, next.say.line, 5);
    if (current.objectiveIndex >= current.mission.objectives.length) {
      complete(ctx);
    }
  }

  function complete(ctx) {
    const mission = current.mission;
    ctx.save.money += mission.reward;
    ctx.save.missionsDone += 1;
    ctx.save.missionIndex = Math.min(current.index + 1, MISSIONS.length - 1);
    ctx.hud.showToast(`Misi selesai: ${mission.title} — +$${mission.reward}`);
    if (mission.doneLine) ctx.hud.showDialogue(mission.doneLine.speaker, mission.doneLine.line, 5);
    ctx.audio.missionDone();
    ctx.saveData();
    current = null;
    beacon.visible = false;
    ring.visible = false;
  }

  function fail(ctx, reason) {
    ctx.hud.showToast(`Misi gagal: ${reason}. Coba lagi dari awal misi.`);
    current = null;
    beacon.visible = false;
    ring.visible = false;
    ctx.combat.clearAll();
  }

  return {
    get current() {
      return current;
    },
    startMission,
    objectiveSpot,
    currentObjective,
    fail,
    isActive() {
      return current !== null;
    },
    // Called when the player punches (mission 2) or kills (mission 5).
    onPunch(ctx) {
      const objective = currentObjective();
      if (!current || !objective || objective.type !== 'punch') return;
      const spot = SPOTS[objective.spot];
      const player = ctx.player;
      if (distance2D(player.x, player.z, spot.x, spot.z) < 14) advance(ctx);
    },
    onKill(ctx) {
      const objective = currentObjective();
      if (!current || !objective) return;
      if (objective.type === 'kill') {
        killCount += 1;
        if (killCount >= objective.count) advance(ctx);
      }
    },
    onSteal(ctx) {
      const objective = currentObjective();
      if (current && objective && objective.type === 'steal') advance(ctx);
    },
    update(dt, ctx) {
      if (!current) {
        beacon.visible = false;
        ring.visible = false;
        return;
      }
      const objective = currentObjective();
      const player = ctx.player;
      const px = player.inCar ? player.inCar.x : player.x;
      const pz = player.inCar ? player.inCar.z : player.z;

      if (objective.type === 'goto' || objective.type === 'deliver') {
        const spot = SPOTS[objective.spot];
        beacon.position.set(spot.x, 30, spot.z);
        ring.position.set(spot.x, 0.3, spot.z);
        beacon.visible = true;
        ring.visible = true;
        if (distance2D(px, pz, spot.x, spot.z) < 7) advance(ctx);
      } else if (objective.type === 'race') {
        objectiveTimer += dt;
        const spot = SPOTS[objective.spots[raceIndex]];
        beacon.position.set(spot.x, 30, spot.z);
        ring.position.set(spot.x, 0.3, spot.z);
        beacon.visible = true;
        ring.visible = true;
        if (distance2D(px, pz, spot.x, spot.z) < 8) {
          raceIndex += 1;
          ctx.audio.pickup();
          if (raceIndex >= objective.spots.length) advance(ctx);
        } else if (objectiveTimer > objective.time) {
          fail(ctx, 'waktu balapan habis');
        }
      } else if (objective.type === 'survive') {
        surviveTimer += dt;
        beacon.visible = false;
        ring.visible = false;
        if (ctx.police.wanted < 2) ctx.police.setWanted(3);
        if (surviveTimer >= objective.seconds) advance(ctx);
      } else {
        // punch / kill / steal: the beacon stays on the spot.
        const spot = SPOTS[objective.spot];
        beacon.position.set(spot.x, 30, spot.z);
        ring.position.set(spot.x, 0.3, spot.z);
        beacon.visible = true;
        ring.visible = true;
      }
      // Beacon pulse.
      beacon.rotation.y += dt * 1.2;
      ring.scale.setScalar(1 + Math.sin(Date.now() * 0.004) * 0.12);
    },
    // Text for the HUD objective line, with live progress.
    objectiveText() {
      const objective = currentObjective();
      if (!current || !objective) return '';
      let text = objective.text;
      if (objective.type === 'race') text += ` (${raceIndex}/${objective.spots.length}) — ${Math.max(0, Math.ceil(objective.time - objectiveTimer))} dtk`;
      if (objective.type === 'kill') text += ` (${killCount}/${objective.count})`;
      if (objective.type === 'survive') text += ` (${Math.ceil(objective.seconds - surviveTimer)} dtk)`;
      return `${current.mission.title}: ${text}`;
    },
    // Everything the mission panel in the HUD needs, in one object.
    missionInfo() {
      const objective = currentObjective();
      if (!current || !objective) return null;
      const next = current.mission.objectives[current.objectiveIndex + 1];
      let timer = '';
      if (objective.type === 'race') timer = `${Math.max(0, Math.ceil(objective.time - objectiveTimer))} dtk`;
      if (objective.type === 'survive') timer = `${Math.ceil(objective.seconds - surviveTimer)} dtk`;
      let progress = '';
      if (objective.type === 'race') progress = `${raceIndex}/${objective.spots.length}`;
      if (objective.type === 'kill') progress = `${killCount}/${objective.count}`;
      return {
        index: current.index + 1,
        total: MISSIONS.length,
        chapter: `BAB ${current.index + 1}`,
        title: current.mission.title,
        objective: this.objectiveText(),
        next: next ? `NEXT: ${next.text}` : 'Terakhir — selesaikan!',
        timer,
        progress,
        reward: current.mission.reward,
      };
    },
    // The next mission when none is active, so the HUD tracker never goes
    // blank in free-roam: it always shows what comes next.
    nextMissionInfo(index) {
      const mission = MISSIONS[index];
      if (!mission) return null;
      return {
        index: index + 1,
        total: MISSIONS.length,
        chapter: `BAB ${index + 1}`,
        title: mission.title,
        objective: `Tekan M untuk mulai — ${mission.objectives[0].text}`,
        next: `Hadiah $${mission.reward.toLocaleString('en-US')}`,
        timer: '',
        progress: '',
        reward: mission.reward,
      };
    },
  };
}
