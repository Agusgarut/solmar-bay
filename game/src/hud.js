// The HUD: health, money, wanted stars, speed, the mission tracker panel,
// the police dispatch list, the radio card, dialogue subtitles, the mission
// banner, and the title / pause / game-over screens. All DOM, updated from
// the game state each frame.

export function createHud() {
  const root = document.getElementById('hud');
  const healthFill = document.getElementById('health-fill');
  const healthText = document.getElementById('health-text');
  const moneyText = document.getElementById('money');
  const wantedEl = document.getElementById('wanted');
  const weaponEl = document.getElementById('weapon');
  const speedEl = document.getElementById('speed');
  const objectiveEl = document.getElementById('objective');
  const districtEl = document.getElementById('district');
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
      dialogueAvatar.textContent = speaker ? speaker.charAt(0).toUpperCase() : '?';
      dialogueSpeaker.textContent = speaker || '';
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
      moneyText.textContent = `$${state.money.toLocaleString('en-US')}`;
      // Wanted stars: filled for the current level.
      let stars = '';
      for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
      wantedEl.textContent = stars;
      wantedEl.classList.toggle('hot', state.wanted > 0);
      // Weapon + ammo, on foot only.
      if (!state.inCar && state.weapon) {
        weaponEl.textContent = state.weapon.name === 'pistol'
          ? `PISTOL · ${state.weapon.ammo}` : 'TINJU';
        weaponEl.classList.remove('hidden');
      } else {
        weaponEl.classList.add('hidden');
      }
      // Speed, big, with km/h.
      speedEl.innerHTML = state.inCar
        ? `${Math.round(Math.abs(state.speed) * 3.6)} <small>km/h</small>` : '';
      objectiveEl.textContent = state.objective || 'Bebas — jalan-jalan, cari mobil, atau mulai misi (M).';
      districtEl.textContent = state.district;
      minimapLabel.textContent = state.street ? `${state.district.toUpperCase()} · ${state.street}` : state.district;
      crosshair.classList.toggle('hidden', !state.showCrosshair);
      const hours = Math.floor(state.timeOfDay);
      const minutes = Math.floor((state.timeOfDay - hours) * 60);
      clockEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      // Mission tracker panel.
      if (state.mission) {
        missionPanel.classList.remove('hidden');
        missionIndex.textContent = `MISI ${state.mission.index}/${state.mission.total}`;
        missionTimer.textContent = state.mission.timer || '';
        missionTitle.textContent = state.mission.title;
        missionObjective.textContent = state.mission.objective;
        missionNext.textContent = state.mission.next || '';
      } else {
        missionPanel.classList.add('hidden');
      }
      // Police dispatch list, only while wanted.
      const dispatch = state.dispatch || [];
      if (state.wanted > 0 && dispatch.length > 0) {
        dispatchEl.classList.remove('hidden');
        const key = dispatch.map((d) => `${d.unit}:${d.dist}:${d.status}`).join('|');
        if (key !== lastDispatchKey) {
          lastDispatchKey = key;
          dispatchRows.innerHTML = '';
          for (const d of dispatch) {
            const row = document.createElement('div');
            row.className = 'dispatch-row';
            const statusClass = d.status === 'RAMMING' || d.status === 'ROADBLOCK'
              ? 'dispatch-status ramming' : d.status === 'AIR SUPPORT' ? 'dispatch-status air' : 'dispatch-status';
            row.innerHTML = `<span>${d.unit}</span><span class="dispatch-dist">${d.dist} m</span><span class="${statusClass}">${d.status}</span>`;
            dispatchRows.appendChild(row);
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
