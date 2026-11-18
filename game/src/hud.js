// The HUD: health, money, wanted stars, speed, the mission objective, the
// district and clock, toasts and briefings, and the title / pause /
// game-over screens. All DOM, updated from the game state each frame.

export function createHud() {
  const root = document.getElementById('hud');
  const healthFill = document.getElementById('health-fill');
  const healthText = document.getElementById('health-text');
  const moneyText = document.getElementById('money');
  const wantedEl = document.getElementById('wanted');
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

  let toastTimer = null;
  let briefingTimer = null;
  let lastHealth = 100;

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
      speedEl.textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 3.6)} km/h` : '';
      objectiveEl.textContent = state.objective || 'Bebas — jalan-jalan, cari mobil, atau mulai misi (M).';
      districtEl.textContent = state.district;
      crosshair.classList.toggle('hidden', !state.showCrosshair);
      const hours = Math.floor(state.timeOfDay);
      const minutes = Math.floor((state.timeOfDay - hours) * 60);
      clockEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      // Red flash when the player just took damage.
      if (state.health < lastHealth) {
        damageEl.classList.remove('hidden');
        window.setTimeout(() => damageEl.classList.add('hidden'), 180);
      }
      lastHealth = state.health;
    },
  };
}
