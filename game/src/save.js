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
    return { ...defaultSave(), ...parsed };
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
