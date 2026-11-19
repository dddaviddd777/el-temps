// Desament local (al mòbil). Si el navegador no deixa desar, l'app funciona igual sense memòria.
const KEY = 'temps.v1';
const MAX_CACHED = 6;

let state = {};
try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { state = {}; }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sense espai o bloquejat */ }
}

export const get = (k, d) => state[k] ?? d;
export function set(k, v) { state[k] = v; save(); }

const placeKey = (p) => `${p.lat},${p.lon}`;

export function cachedForecast(place) {
  return state.cache?.[placeKey(place)] || null;
}

export function cacheForecast(place, fc) {
  const cache = state.cache || {};
  cache[placeKey(place)] = fc;
  const keys = Object.keys(cache).sort((a, b) => cache[b].fetchedAt - cache[a].fetchedAt);
  for (const k of keys.slice(MAX_CACHED)) delete cache[k];
  state.cache = cache;
  save();
}
