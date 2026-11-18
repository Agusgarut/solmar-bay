// Save and load (localStorage, this browser only): money, mission progress,
// best stats and settings. Storage can be off (private windows) — then the
// game simply keeps everything for this visit only and never throws.

const SAVE_KEY = 'solmar-bay.save.v1';

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

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    return { ...defaultSave(), ...parsed };
  } catch {
    return defaultSave();
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable: play on without saving.
  }
}

// Wipe the save (used from the title screen's reset, and by tests).
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to wipe.
  }
  return defaultSave();
}
