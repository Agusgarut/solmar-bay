// Seeded random numbers (mulberry32): the same seed builds the same city,
// which is what makes the screenshot scenes repeatable.

export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one entry of `list` with the seeded generator.
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// A number in [lo, hi).
export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// A shuffled copy of `list` (Fisher-Yates), same seed, same order.
export function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Pick one entry of `entries` ([value, weight]) by weight.
export function weighted(rng, entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rng() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
