// Codis meteorològics WMO → text en català, tipus d'icona i fons.

const TEXT = {
  0: 'Cel serè', 1: 'Majoritàriament serè', 2: 'Parcialment ennuvolat', 3: 'Cobert',
  45: 'Boira', 48: 'Boira gebradora',
  51: 'Plugim feble', 53: 'Plugim', 55: 'Plugim intens', 56: 'Plugim gelat', 57: 'Plugim gelat intens',
  61: 'Pluja feble', 63: 'Pluja moderada', 65: 'Pluja forta', 66: 'Pluja gelada', 67: 'Pluja gelada forta',
  71: 'Neu feble', 73: 'Neu moderada', 75: 'Neu forta', 77: 'Neu granulada',
  80: 'Ruixats febles', 81: 'Ruixats', 82: 'Ruixats forts', 85: 'Ruixats de neu', 86: 'Ruixats de neu forts',
  95: 'Tempesta', 96: 'Tempesta amb calamarsa', 99: 'Tempesta amb calamarsa forta',
};

export const describe = (code) => TEXT[code] ?? '—';

export function kindOf(code) {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return code === 65 || code === 82 || code === 67 ? 'heavy' : 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

export function skyTheme(code, isDay) {
  const k = kindOf(code);
  if (k === 'storm') return 'storm';
  if (k === 'rain' || k === 'heavy' || k === 'drizzle') return 'rain';
  if (k === 'snow') return 'snow';
  if (k === 'fog') return 'fog';
  if (k === 'cloudy') return isDay ? 'cloudy' : 'night-cloudy';
  if (k === 'partly') return isDay ? 'partly' : 'night';
  return isDay ? 'clear' : 'night';
}

// ---- Icones SVG (viewBox 64×64) ----
const SUN = '#FFC93C', CLOUD = '#FFFFFF', CLOUD2 = '#DCE4EE', DARK = '#AEB8C6', DROP = '#8FD0FF', MOON = '#EEF2FB';

const sun = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${SUN}"/>`;
const moon = (cx, cy, r) =>
  `<path d="M${cx + r * 0.35} ${cy - r}a${r} ${r} 0 1 0 ${r * 0.65} ${r * 1.55}a${r * 0.8} ${r * 0.8} 0 0 1 ${-r * 0.65} ${-r * 1.55}z" fill="${MOON}"/>`;
const cloud = (dx, dy, s, fill) =>
  `<g transform="translate(${dx} ${dy}) scale(${s})" fill="${fill}"><circle cx="24" cy="34" r="11"/><circle cx="36" cy="28" r="13"/><circle cx="47" cy="36" r="9"/><rect x="13" y="34" width="43" height="11" rx="5.5"/></g>`;
const drops = (count, color = DROP) => {
  const xs = count === 2 ? [26, 38] : count === 3 ? [22, 32, 42] : [18, 27, 36, 45];
  return xs.map((x) => `<path d="M${x} 50l-3 8" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`).join('');
};
const flakes = () => [22, 32, 42].map((x, i) => `<circle cx="${x}" cy="${53 + (i % 2) * 4}" r="2.6" fill="#fff"/>`).join('');

export function iconSvg(code, isDay = true, size = 48, x, y) {
  const k = kindOf(code);
  const pos = x !== undefined ? ` x="${x}" y="${y}"` : '';
  const body = (() => {
    switch (k) {
      case 'clear': return isDay ? sun(32, 32, 16) : moon(28, 32, 16);
      case 'partly': return (isDay ? sun(25, 24, 13) : moon(22, 22, 11)) + cloud(6, 6, 1, CLOUD);
      case 'cloudy': return cloud(-6, -6, 0.9, CLOUD2) + cloud(4, 4, 1, CLOUD);
      case 'fog': return cloud(2, -4, 1, CLOUD2) + [48, 54].map((yy) => `<path d="M14 ${yy}h36" stroke="${CLOUD}" stroke-width="3" stroke-linecap="round"/>`).join('');
      case 'drizzle': return cloud(2, -6, 1, CLOUD2) + drops(2);
      case 'rain': return cloud(2, -6, 1, CLOUD2) + drops(3);
      case 'heavy': return cloud(2, -6, 1, DARK) + drops(4);
      case 'snow': return cloud(2, -6, 1, CLOUD2) + flakes();
      case 'storm': return cloud(2, -6, 1, DARK) + `<path d="M34 42l-7 11h6l-4 9 11-13h-6l4-7z" fill="${SUN}"/>`;
      default: return cloud(2, 0, 1, CLOUD);
    }
  })();
  return `<svg${pos} width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
}

export function windName(deg) {
  if (deg == null) return '';
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8];
}

export function uvLevel(uv) {
  if (uv == null) return '—';
  if (uv < 3) return 'Baix';
  if (uv < 6) return 'Moderat';
  if (uv < 8) return 'Alt';
  if (uv < 11) return 'Molt alt';
  return 'Extrem';
}

export function rainIntensity(mmPer15) {
  const mmh = mmPer15 * 4;
  if (mmh < 2.5) return 'feble';
  if (mmh < 7.6) return 'moderada';
  return 'forta';
}
