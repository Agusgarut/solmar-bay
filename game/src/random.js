// Seeded random numbers for AshboelPunks: one seed builds the same city,
// the same traffic and the same screenshot scenes every time, which is what
// makes the staged screenshots repeatable. The generator is mulberry32 —
// tiny, fast, and good enough for placement, colours and shuffling.

export function createRandom(seed) {
  // Force the seed into an unsigned 32-bit integer; 0 is a degenerate
  // state for this generator, so fall back to 1.
  let state = (seed >>> 0) || 1;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// One entry of `list`, picked with the seeded generator.
export function pick(rng, list) {
  if (!list || list.length === 0) return undefined;
  return list[Math.floor(rng() * list.length)];
}

// A float in [lo, hi).
export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// An integer in [lo, hi] (both ends inclusive).
export function int(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// True with probability `p` (0..1).
export function chance(rng, p) {
  return rng() < p;
}

// A shuffled copy of `list` (Fisher-Yates); same seed, same order.
export function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// Pick one entry of `entries`, where each entry is [value, weight].
export function weighted(rng, entries) {
  if (!entries || entries.length === 0) return undefined;
  let total = 0;
  for (let i = 0; i < entries.length; i += 1) total += entries[i][1];
  let roll = rng() * total;
  for (let i = 0; i < entries.length; i += 1) {
    roll -= entries[i][1];
    if (roll <= 0) return entries[i][0];
  }
  return entries[entries.length - 1][0];
}
