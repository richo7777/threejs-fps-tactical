// Dustline — seeded RNG. mulberry32 is small, fast, deterministic.
// `rand()` is the shared draw: Math.random-backed live, seeded in shot mode.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _draw = Math.random;

export function seedRand(seed) {
  _draw = mulberry32(seed);
}

export function rand() {
  return _draw();
}

// Integer in [min, max). Uses the shared draw so shot mode stays deterministic.
export function randInt(min, max) {
  return min + Math.floor(_draw() * (max - min));
}

// Pick one element of an array using the shared draw.
export function pick(arr) {
  return arr[Math.floor(_draw() * arr.length)];
}
