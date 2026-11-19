// Ubicació: GPS del mòbil, nom del lloc i cercador.
// Per privadesa, les coordenades s'arrodoneixen a ~1 km abans d'enviar-les a cap servei.

export const round = (v) => Math.round(v * 100) / 100;

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(Object.assign(new Error('Aquest navegador no permet la ubicació'), { code: 0 }));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lon: round(p.coords.longitude) }),
      (e) => reject(e),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export function geoErrorText(e) {
  if (e?.code === 1) return "No hi ha permís per saber la ubicació. Pots activar-lo a la configuració del navegador o cercar un lloc.";
  if (e?.code === 2) return "No s'ha pogut trobar la ubicació (sense GPS ni xarxa).";
  if (e?.code === 3) return 'La ubicació tarda massa a respondre.';
  return e?.message || "No s'ha pogut obtenir la ubicació.";
}

/** Nom del municipi a partir de coordenades (OpenStreetMap). Més endavant: límits municipals de l'ICGC al Worker. */
export async function reverseName(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=ca`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Nominatim ' + r.status);
  const j = await r.json();
  const a = j.address || {};
  return {
    name: a.city || a.town || a.village || a.municipality || a.hamlet || j.name || 'La meva ubicació',
    sub: [a.county, a.state].filter(Boolean).join(', '),
  };
}

/** Cercador de llocs (geocodificador d'Open-Meteo). */
export async function searchPlaces(q, { signal } = {}) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=25&language=ca&format=json`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error('Cercador ' + r.status);
  const j = await r.json();
  // Primer Catalunya, després la resta d'Espanya i Andorra, després la resta del món.
  const rank = (p) => (p.admin1 === 'Catalunya' || p.admin1 === 'Catalonia' ? 0 : p.country_code === 'ES' || p.country_code === 'AD' ? 1 : 2);
  const list = (j.results || []).map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p).slice(0, 8);
  return list.map((p) => ({
    id: `p${p.id}`,
    name: p.name,
    sub: [p.admin2 && p.admin2 !== p.name ? p.admin2 : null, p.admin1, p.country_code !== 'ES' ? p.country : null].filter(Boolean).join(', '),
    lat: round(p.latitude),
    lon: round(p.longitude),
  }));
}
