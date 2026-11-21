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
    forecast_days: '8', past_hours: '3', forecast_hours: '28',
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

  // Open-Meteo dona la pluja de cada hora (quantitat i probabilitat) com la de l'hora que ACABA en aquell moment:
  // el valor de les 18:00 és el de 17 a 18 h. A l'app, cada hora vol dir l'hora que comença (18:00 = de 18 a 19 h),
  // així que agafem el valor de l'hora següent (també el codi del temps, que es calcula amb aquesta pluja).
  const hourly = H.time.map((t, i) => ({
    t, temp: n(H.temperature_2m[i]), pop: n(H.precipitation_probability?.[i + 1]), mm: n(H.precipitation[i + 1]) ?? 0,
    code: H.weather_code[i + 1] ?? H.weather_code[i], isDay: !!H.is_day[i], wind: n(H.wind_speed_10m[i]), gust: n(H.wind_gusts_10m[i]),
    dir: n(H.wind_direction_10m[i]), pressure: n(H.pressure_msl[i]),
  }));
  let idx = hourly.findLastIndex((h) => h.t <= now);
  if (idx < 0) idx = 0;
  const pNow = hourly[idx]?.pressure, pPrev = hourly[idx - 3]?.pressure;
  const pressureTrend = pNow != null && pPrev != null ? pNow - pPrev : null;

  // Igual amb els trams de 15 min: el valor de les 18:45 és el de 18:30 a 18:45. Guardem l'hora d'inici del tram
  // i només els trams que encara no s'han acabat.
  const nowcast = (M?.time || [])
    .map((t, i) => ({ t: t - 900, mm: n(M.precipitation[i]) ?? 0 }))
    .filter((s) => s.t + 900 > now)
    .slice(0, 8);

  const daily = D.time.map((t, i) => ({
    t, code: D.weather_code[i], max: n(D.temperature_2m_max[i]), min: n(D.temperature_2m_min[i]),
    pop: n(D.precipitation_probability_max?.[i]), mm: n(D.precipitation_sum[i]) ?? 0,
    sunrise: D.sunrise[i], sunset: D.sunset[i], uv: n(D.uv_index_max[i]),
    windMax: n(D.wind_speed_10m_max[i]), gustMax: n(D.wind_gusts_10m_max[i]),
  }));

  // "Avui": la probabilitat i la pluja de la resta del dia, no de les hores que ja han passat.
  if (daily.length > 1) {
    const rest = hourly.slice(idx).filter((h) => h.t < daily[1].t && h.pop != null);
    if (rest.length) {
      daily[0].pop = Math.max(...rest.map((h) => h.pop));
      daily[0].mm = rest.reduce((a, h) => a + h.mm, 0);
      daily[0].code = Math.max(...rest.map((h) => h.code)); // el més sever, com fa Open-Meteo per al dia
    }
  }

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
