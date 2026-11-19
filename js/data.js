// Capa de dades. Totes les fonts retornen el mateix format normalitzat,
// així quan arribi la clau de Meteocat només caldrà afegir-hi un proveïdor nou.

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

const CURRENT = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'precipitation',
  'weather_code', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'dew_point_2m',
  'visibility', 'uv_index'];
const HOURLY = ['temperature_2m', 'precipitation_probability', 'precipitation', 'weather_code', 'is_day',
  'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'pressure_msl'];
const DAILY = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max',
  'precipitation_sum', 'sunrise', 'sunset', 'uv_index_max', 'wind_speed_10m_max', 'wind_gusts_10m_max'];

/**
 * Previsió d'Open-Meteo per a unes coordenades.
 * Fa servir el millor model per al punt (a Catalunya, AROME de Météo-France, actualitzat cada hora).
 */
export async function fetchOpenMeteo(lat, lon, { signal } = {}) {
  const p = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    timezone: 'auto', timeformat: 'unixtime', wind_speed_unit: 'kmh',
    forecast_days: '8', past_hours: '3', forecast_hours: '27',
    past_minutely_15: '1', forecast_minutely_15: '10',
    current: CURRENT.join(','), minutely_15: 'precipitation',
    hourly: HOURLY.join(','), daily: DAILY.join(','),
  });
  const r = await fetch(`${OPEN_METEO}?${p}`, { signal });
  if (!r.ok) throw new Error(`Open-Meteo ha respost ${r.status}`);
  return normalize(await r.json());
}

const n = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : v);

function normalize(j) {
  const now = Date.now() / 1000;
  const c = j.current, H = j.hourly, D = j.daily, M = j.minutely_15;

  const hourly = H.time.map((t, i) => ({
    t, temp: n(H.temperature_2m[i]), pop: n(H.precipitation_probability?.[i]), mm: n(H.precipitation[i]) ?? 0,
    code: H.weather_code[i], isDay: !!H.is_day[i], wind: n(H.wind_speed_10m[i]), gust: n(H.wind_gusts_10m[i]),
    dir: n(H.wind_direction_10m[i]), pressure: n(H.pressure_msl[i]),
  }));
  let idx = hourly.findLastIndex((h) => h.t <= now);
  if (idx < 0) idx = 0;
  const pNow = hourly[idx]?.pressure, pPrev = hourly[idx - 3]?.pressure;
  const pressureTrend = pNow != null && pPrev != null ? pNow - pPrev : null;

  const nowcast = (M?.time || [])
    .map((t, i) => ({ t, mm: n(M.precipitation[i]) ?? 0 }))
    .filter((s) => s.t > now - 900)
    .slice(0, 8);

  const daily = D.time.map((t, i) => ({
    t, code: D.weather_code[i], max: n(D.temperature_2m_max[i]), min: n(D.temperature_2m_min[i]),
    pop: n(D.precipitation_probability_max?.[i]), mm: n(D.precipitation_sum[i]) ?? 0,
    sunrise: D.sunrise[i], sunset: D.sunset[i], uv: n(D.uv_index_max[i]),
    windMax: n(D.wind_speed_10m_max[i]), gustMax: n(D.wind_gusts_10m_max[i]),
  }));

  return {
    source: 'Open-Meteo',
    kind: 'model', // 'model' = previsió del model; 'observacio' = estació real (Meteocat XEMA, més endavant)
    timezone: j.timezone,
    elevation: j.elevation,
    fetchedAt: Date.now(),
    current: {
      t: c.time, temp: n(c.temperature_2m), feels: n(c.apparent_temperature), humidity: n(c.relative_humidity_2m),
      dew: n(c.dew_point_2m), pressure: n(c.pressure_msl), pressureTrend, wind: n(c.wind_speed_10m),
      dir: n(c.wind_direction_10m), gust: n(c.wind_gusts_10m), code: c.weather_code, isDay: !!c.is_day,
      uv: n(c.uv_index), visibility: n(c.visibility), precip: n(c.precipitation) ?? 0,
    },
    nowcast,
    hourly: hourly.slice(idx, idx + 25),
    daily,
  };
}

/** Punt d'entrada únic per a l'app. Més endavant: Meteocat (via Worker) primer, Open-Meteo de recanvi. */
export async function fetchForecast(lat, lon, opts) {
  return fetchOpenMeteo(lat, lon, opts);
}
