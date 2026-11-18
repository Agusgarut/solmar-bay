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
