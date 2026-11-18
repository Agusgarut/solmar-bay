// The HUD: health, money, wanted stars, speed, the mission tracker panel,
// the police dispatch list, the radio card, dialogue subtitles, the mission
// banner, and the title / pause / game-over screens. All DOM, updated from
// the game state each frame.

export function createHud() {
  const root = document.getElementById('hud');
  const healthFill = document.getElementById('health-fill');
  const healthText = document.getElementById('health-text');
  const armorFill = document.getElementById('armor-fill');
  const armorText = document.getElementById('armor-text');
  const moneyText = document.getElementById('money');
  const wantedEl = document.getElementById('wanted');
  const weaponEl = document.getElementById('weapon');
  const speedEl = document.getElementById('speed');
  const objectiveEl = document.getElementById('objective');
  const clockEl = document.getElementById('clock');
  const toastEl = document.getElementById('toast');
  const briefingEl = document.getElementById('briefing');
  const briefingTitle = document.getElementById('briefing-title');
  const briefingText = document.getElementById('briefing-text');
  const crosshair = document.getElementById('crosshair');
  const damageEl = document.getElementById('damage');
  const screenTitle = document.getElementById('screen-title');
  const screenPause = document.getElementById('screen-pause');
  const screenOver = document.getElementById('screen-over');
  const overTitle = document.getElementById('over-title');
  const overText = document.getElementById('over-text');
  const statusEl = document.getElementById('status');
  // New panels.
  const missionPanel = document.getElementById('mission-panel');
  const missionIndex = document.getElementById('mission-index');
  const missionTimer = document.getElementById('mission-timer');
  const missionChapter = document.getElementById('mission-chapter');
  const missionTitle = document.getElementById('mission-title');
  const missionObjective = document.getElementById('mission-objective');
  const missionNext = document.getElementById('mission-next');
  const dispatchEl = document.getElementById('dispatch');
  const dispatchRows = document.getElementById('dispatch-rows');
  const radioEl = document.getElementById('radio');
  const radioStation = document.getElementById('radio-station');
  const radioTrack = document.getElementById('radio-track');
  const radioCar = document.getElementById('radio-car');
  const minimapLabel = document.getElementById('minimap-label');
  const dialogueEl = document.getElementById('dialogue');
  const dialogueAvatar = document.getElementById('dialogue-avatar');
  const dialogueSpeaker = document.getElementById('dialogue-speaker');
  const dialogueRole = document.getElementById('dialogue-role');
  const dialogueText = document.getElementById('dialogue-text');
  const bannerEl = document.getElementById('mission-banner');
  const bannerIndex = document.getElementById('mission-banner-index');
  const bannerTitle = document.getElementById('mission-banner-title');
  const bannerText = document.getElementById('mission-banner-text');

  let toastTimer = null;
  let briefingTimer = null;
  let dialogueTimer = null;
  let bannerTimer = null;
  let lastHealth = 100;
  let lastDispatchKey = '';

  // Character portraits: a simple low-poly face drawn as inline SVG, one
  // palette per character, so the dialogue card shows a face, not a letter.
  const PORTRAITS = {
    Rico: { skin: '#c98a5f', hair: '#1c1410', shirt: '#ff5e8a', bg: '#5e2a3a' },
    Zara: { skin: '#e8b88a', hair: '#3a2a1a', shirt: '#2ec4b6', bg: '#123f3a' },
    Beni: { skin: '#8a5a38', hair: '#101010', shirt: '#ff7a1a', bg: '#4a2c12' },
    Dani: { skin: '#c98a5f', hair: '#1c1410', shirt: '#2e6fc2', bg: '#1c2f4a' },
  };
  // Character roles for the dialogue card, like the reference's
  // "JUNO REYES / WHEELWOMAN" line under the portrait.
  const ROLES = {
    Rico: 'TANGAN KANAN',
    Zara: 'PEMBALAP',
    Beni: 'DEBITUR',
    Dani: 'KURIR',
  };
  function portraitSvg(speaker) {
    const p = PORTRAITS[speaker] || { skin: '#c98a5f', hair: '#333333', shirt: '#8a4fc2', bg: '#2a2a3a' };
    return `<svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">`
      + `<rect width="44" height="44" fill="${p.bg}"/>`
      + `<path d="M6 44 Q10 28 22 28 Q34 28 38 44 Z" fill="${p.shirt}"/>`
      + `<circle cx="22" cy="20" r="10" fill="${p.skin}"/>`
      + `<path d="M12 18 Q12 8 22 8 Q32 8 32 18 Q32 12 22 12 Q12 12 12 18 Z" fill="${p.hair}"/>`
      + `<circle cx="18" cy="20" r="1.4" fill="#141414"/><circle cx="26" cy="20" r="1.4" fill="#141414"/>`
      + `<path d="M18 26 Q22 29 26 26" stroke="#141414" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
      + `</svg>`;
  }

  function showOnly(screen) {
    screenTitle.classList.toggle('hidden', screen !== 'title');
    screenPause.classList.toggle('hidden', screen !== 'pause');
    screenOver.classList.toggle('hidden', screen !== 'over');
    root.classList.toggle('hidden', screen === 'title');
    crosshair.classList.toggle('hidden', screen !== 'play');
  }

  return {
    announce(message) {
      statusEl.textContent = message;
    },
    showToast(message, seconds) {
      toastEl.textContent = message;
      toastEl.classList.remove('hidden');
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.add('hidden'), (seconds || 4) * 1000);
    },
    showBriefing(title, text) {
      briefingTitle.textContent = title;
      briefingText.textContent = text;
      briefingEl.classList.remove('hidden');
      if (briefingTimer) window.clearTimeout(briefingTimer);
      briefingTimer = window.setTimeout(() => briefingEl.classList.add('hidden'), 7000);
    },
    // Big centre banner when a mission starts: MISI 1 — KURIR PAGI.
    showMissionBanner(title, text) {
      bannerIndex.textContent = title.split('—')[0].trim();
      bannerTitle.textContent = title.split('—')[1] ? title.split('—')[1].trim() : title;
      bannerText.textContent = text;
      bannerEl.classList.remove('hidden');
      if (bannerTimer) window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => bannerEl.classList.add('hidden'), 4200);
    },
    // Dialogue subtitle with a character card, bottom-centre.
    showDialogue(speaker, text, seconds) {
      dialogueAvatar.innerHTML = portraitSvg(speaker);
      dialogueSpeaker.textContent = speaker || '';
      dialogueRole.textContent = ROLES[speaker] || '';
      dialogueText.textContent = text;
      dialogueEl.classList.remove('hidden');
      if (dialogueTimer) window.clearTimeout(dialogueTimer);
      dialogueTimer = window.setTimeout(() => dialogueEl.classList.add('hidden'), (seconds || 5) * 1000);
    },
    showTitle() {
      showOnly('title');
      this.announce('AshboelPunks. Tekan Enter atau klik untuk mulai.');
    },
    showPlay() {
      showOnly('play');
    },
    showPause() {
      showOnly('pause');
      this.announce('Jeda. Tekan P untuk lanjut.');
    },
    showOver(title, text) {
      overTitle.textContent = title;
      overText.textContent = text;
      showOnly('over');
      this.announce(`${title}. ${text}`);
    },
    update(state) {
      healthFill.style.width = `${Math.max(0, state.health)}%`;
      healthFill.classList.toggle('low', state.health < 30);
      healthText.textContent = `${Math.ceil(state.health)}`;
      // Armor bar, earned from missions: absorbs damage before health.
      armorFill.style.width = `${Math.max(0, state.armor || 0)}%`;
      armorText.textContent = `${Math.ceil(state.armor || 0)}`;
      moneyText.textContent = `$${state.money.toLocaleString('en-US')}`;
      // Wanted stars: filled for the current level.
      let stars = '';
      for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
      wantedEl.textContent = stars;
      wantedEl.classList.toggle('hot', state.wanted > 0);
      // Weapon slot, GTA-style: name + ammo, on foot only.
      if (!state.inCar && state.weapon) {
        weaponEl.textContent = state.weapon.name === 'pistol'
          ? `PISTOL — ${state.weapon.ammo} PELURU` : 'TINJU';
        weaponEl.classList.remove('hidden');
      } else {
        weaponEl.classList.add('hidden');
      }
      // Speed, big, with km/h.
      speedEl.innerHTML = state.inCar
        ? `${Math.round(Math.abs(state.speed) * 3.6)} <small>km/h</small>` : '';
      // The top-centre objective pill is retired: the always-on mission
      // tracker panel now carries the objective (active or next mission).
      objectiveEl.classList.add('hidden');
      minimapLabel.textContent = state.street ? `${state.district.toUpperCase()} · ${state.street}` : state.district;
      crosshair.classList.toggle('hidden', !state.showCrosshair);
      const hours = Math.floor(state.timeOfDay);
      const minutes = Math.floor((state.timeOfDay - hours) * 60);
      clockEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      // Mission tracker panel: always visible, like the reference's
      // always-on mission panel. During a mission it shows the active job;
      // in free-roam it shows the next job; when all are done, the legend.
      const mission = state.mission || null;
      const next = !mission ? state.nextMission : null;
      missionPanel.classList.remove('hidden');
      if (mission) {
        missionIndex.textContent = `MISI ${mission.index}/${mission.total}`;
        missionIndex.classList.remove('next');
        missionTimer.textContent = mission.timer || '';
        missionChapter.textContent = mission.chapter || '';
        missionTitle.textContent = mission.title;
        missionObjective.textContent = mission.objective;
        missionNext.textContent = mission.next || '';
      } else if (next) {
        missionIndex.textContent = 'BERIKUTNYA';
        missionIndex.classList.add('next');
        missionTimer.textContent = '';
        missionChapter.textContent = next.chapter || '';
        missionTitle.textContent = next.title;
        missionObjective.textContent = next.objective;
        missionNext.textContent = next.next || '';
      } else {
        missionIndex.textContent = 'SELESAI';
        missionIndex.classList.add('next');
        missionTimer.textContent = '';
        missionChapter.textContent = 'SOLMAR BAY';
        missionTitle.textContent = 'Legenda Solmar Bay';
        missionObjective.textContent = 'Semua misi selesai! Kamu legenda kota ini.';
        missionNext.textContent = '';
      }
      // Police dispatch list, only while wanted.
      const dispatch = state.dispatch || [];
      if (state.wanted > 0 && dispatch.length > 0) {
        dispatchEl.classList.remove('hidden');
        const key = dispatch.map((d) => `${d.unit}:${d.dist}:${d.status}`).join('|');
        if (key !== lastDispatchKey) {
          lastDispatchKey = key;
          dispatchRows.innerHTML = '';
          // At most 3 units, then a "+N more" line — the list must never
          // grow down into the minimap.
          for (const d of dispatch.slice(0, 3)) {
            const row = document.createElement('div');
            row.className = 'dispatch-row';
            const statusClass = d.status === 'RAMMING' || d.status === 'ROADBLOCK'
              ? 'dispatch-status ramming' : d.status === 'AIR SUPPORT' ? 'dispatch-status air'
              : d.status === 'FOOT' ? 'dispatch-status foot' : 'dispatch-status pursuit';
            row.innerHTML = `<span>${d.unit}</span><span class="dispatch-dist">${d.dist} m</span><span class="${statusClass}">${d.status}</span>`;
            dispatchRows.appendChild(row);
          }
          if (dispatch.length > 3) {
            const more = document.createElement('div');
            more.className = 'dispatch-more';
            more.textContent = `+${dispatch.length - 3} unit lagi di lokasi`;
            dispatchRows.appendChild(more);
          }
        }
      } else {
        dispatchEl.classList.add('hidden');
        lastDispatchKey = '';
      }
      // Radio card: station + track, and the car being driven.
      if (state.radio) {
        radioEl.classList.remove('hidden');
        radioStation.textContent = `${state.radio.name} ${state.radio.freq}`;
        radioTrack.textContent = state.radio.track;
      }
      radioCar.textContent = state.vehicle ? `${state.vehicle.name} · Kondisi ${Math.max(0, Math.round(state.vehicle.condition))}%` : '';
      // Red flash when the player just took damage.
      if (state.health < lastHealth) {
        damageEl.classList.remove('hidden');
        window.setTimeout(() => damageEl.classList.add('hidden'), 180);
      }
      lastHealth = state.health;
    },
  };
}
