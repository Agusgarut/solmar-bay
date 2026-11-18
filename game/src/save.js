// Save and load (localStorage, this browser only): money, mission progress,
// best stats and settings. Storage can be off (private windows) — then the
// game simply keeps everything for this visit only and never throws, so
// every save call goes through the guarded `store` wrapper below.

const SAVE_KEY = 'solmar-bay.save.v1';

// One guarded doorway to localStorage: every read/write/remove swallows
// its own errors, so the rest of the game never has to think about it.
const store = {
  get() {
    try {
      return window.localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  },
  set(raw) {
    try {
      window.localStorage.setItem(SAVE_KEY, raw);
      return true;
    } catch {
      return false;
    }
  },
  remove() {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // Nothing to wipe.
    }
  },
};

export function defaultSave() {
  return {
    money: 250,
    missionIndex: 0,
    missionsDone: 0,
    carsStolen: 0,
    bestWanted: 0,
    bestSpeed: 0, // fastest km/h ever driven, shown on the title screen
    radioStation: 0, // index into the radio stations in audio.js
    muted: false,
  };
}

// Load, merging over the defaults so an old or partial save can never
// leave a field undefined for the game.
export function loadSave() {
  const raw = store.get();
  if (!raw) return defaultSave();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultSave();
    // Coerce every field: a hand-edited or older save with a string
    // where a number belongs must never poison the game state.
    const merged = { ...defaultSave(), ...parsed };
    const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    // Counters are floored at 0: a hand-edited negative money or mission
    // index must not put the game in a state it can never leave.
    merged.money = Math.max(0, num(merged.money, 250));
    merged.missionIndex = Math.max(0, num(merged.missionIndex, 0));
    merged.missionsDone = Math.max(0, num(merged.missionsDone, 0));
    merged.carsStolen = num(merged.carsStolen, 0);
    merged.bestWanted = num(merged.bestWanted, 0);
    merged.bestSpeed = num(merged.bestSpeed, 0);
    merged.radioStation = num(merged.radioStation, 0);
    merged.muted = merged.muted === true;
    return merged;
  } catch {
    return defaultSave();
  }
}

export function writeSave(data) {
  store.set(JSON.stringify(data));
}

// Wipe the save (used from the title screen's reset, and by tests).
export function clearSave() {
  store.remove();
  return defaultSave();
}
