import { fetchForecast } from './data.js';
import { describe, iconSvg, skyTheme, windName, uvLevel, rainIntensity } from './weather.js';
import { getPosition, geoErrorText, reverseName, searchPlaces } from './location.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const main = $('main');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf1 = new Intl.NumberFormat('ca', { maximumFractionDigits: 1 });
const deg = (v) => (v == null ? '—' : `${Math.round(v)}°`);

const REFRESH_MS = 15 * 60 * 1000;   // cada quant es renova mentre l'app és oberta
const STALE_MS = 3 * 60 * 60 * 1000; // a partir d'aquí les dades es marquen com a velles

let place = null;     // {id, name, sub, lat, lon}
let fc = null;        // previsió normalitzada
let offline = false;
let geoNote = '';
let tab = 'temp';
const openDays = new Set();
let ctl = null;
let TZ = 'Europe/Madrid';

// ---------- Format d'hores ----------
const fmt = (opts) => new Intl.DateTimeFormat('ca', { timeZone: TZ, ...opts });
const hhmm = (t) => fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t * 1000);
const hh = (t) => fmt({ hour: '2-digit', hourCycle: 'h23' }).format(t * 1000);
const weekday = (t, style = 'long') => fmt({ weekday: style }).format(t * 1000);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'ara mateix';
  if (m < 60) return `fa ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `fa ${h} h`;
  return `fa ${Math.round(h / 24)} dies`;
}

// ---------- Flux principal ----------
async function start() {
  const sel = store.get('selected', 'gps');
  if (sel !== 'gps') {
    const p = store.get('places', []).find((x) => x.id === sel);
    if (p) return show(p);
  }
  locate();
}

async function locate() {
  store.set('selected', 'gps');
  geoNote = '';
  const last = store.get('lastGps');
  if (last) show({ ...last, id: 'gps' }, { cacheOnly: true });
  else setLoading('Buscant on ets…');
  try {
    const pos = await getPosition();
    let named = last && last.lat === pos.lat && last.lon === pos.lon ? last : null;
    if (!named) {
      let info = { name: 'La meva ubicació', sub: '' };
      try { info = await reverseName(pos.lat, pos.lon); } catch { /* sense nom, no és greu */ }
      named = { ...pos, ...info };
      store.set('lastGps', named);
    }
    if (store.get('selected') !== 'gps') return;
    await show({ ...named, id: 'gps' });
  } catch (e) {
    if (store.get('selected') !== 'gps') return;
    const msg = geoErrorText(e);
    if (last) {
      geoNote = `${msg} Es mostra l'última ubicació coneguda.`;
      await show({ ...last, id: 'gps' });
    } else {
      renderEmpty(msg);
      openSheet(msg);
    }
  }
}

async function show(p, { cacheOnly = false } = {}) {
  place = p;
  renderHeader();
  const cached = store.cachedForecast(p);
  if (cached) { fc = cached; offline = false; render(); }
  else { fc = null; setLoading('Carregant el temps…'); }
  if (!cacheOnly) await refresh();
}

async function refresh() {
  if (!place) return;
  ctl?.abort();
  const mine = (ctl = new AbortController());
  const target = place;
  $('refreshBtn').classList.add('spin');
  try {
    const data = await fetchForecast(target.lat, target.lon, { signal: mine.signal });
    if (place !== target) return;
    fc = data;
    offline = false;
    store.cacheForecast(target, data);
    render();
  } catch (e) {
    if (e.name === 'AbortError' || place !== target) return;
    offline = true;
    if (fc) render(); else renderError(e);
  } finally {
    if (ctl === mine) $('refreshBtn').classList.remove('spin');
  }
}

function maybeRefresh() {
  if (document.visibilityState !== 'visible' || !place) return;
  if (!fc || offline || Date.now() - fc.fetchedAt > REFRESH_MS) refresh();
  renderUpdated();
}

// ---------- Pintar ----------
function setLoading(text) {
  main.innerHTML = `<div class="loading"><div class="spinner"></div><p>${esc(text)}</p></div>`;
  $('updated').innerHTML = '&nbsp;';
}

function renderEmpty(msg) {
  main.innerHTML = `<div class="error"><p>${esc(msg)}</p><button id="pickBtn">Cercar un lloc</button><button id="retryGeo" class="btn">Tornar a provar la ubicació</button></div>`;
  $('pickBtn').onclick = () => openSheet();
  $('retryGeo').onclick = () => locate();
}

function renderError(e) {
  main.innerHTML = `<div class="error"><p>No s'han pogut carregar les dades del temps.<br><small>${esc(e.message)}</small></p><button id="retry">Tornar-ho a provar</button></div>`;
  $('retry').onclick = () => refresh();
}

function renderHeader() {
  const gps = place?.id === 'gps';
  $('pin').innerHTML = gps
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3L3 10.5l7.5 2.9L13.5 21z"/></svg>'
    : '';
  $('pname').textContent = place?.name || 'El Temps';
  document.title = place ? `${place.name} · El Temps` : 'El Temps';
}

function renderUpdated() {
  const el = $('updated');
  if (!fc) return;
  const old = Date.now() - fc.fetchedAt > STALE_MS;
  el.classList.toggle('stale', old || offline);
  const when = `${hhmm(fc.fetchedAt / 1000)} (${ago(fc.fetchedAt)})`;
  el.textContent = offline ? `Sense connexió · dades de les ${when}` : `Actualitzat a les ${when} · ${fc.source}`;
}

function render() {
  if (!fc) return;
  TZ = fc.timezone || TZ;
  const c = fc.current;
  const today = fc.daily[0];
  document.body.dataset.sky = skyTheme(c.code, c.isDay);
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue('--sky1').trim() || '#3a86d9';

  const banners = [];
  if (geoNote) banners.push(banner(geoNote));
  if (offline) banners.push(banner(`<b>Sense connexió.</b> Es mostren les dades desades ${ago(fc.fetchedAt)}. <button data-act="retry">Tornar-ho a provar</button>`, true));

  main.innerHTML = `
    ${banners.join('')}
    <section class="now">
      <div>
        <div class="temp">${c.temp == null ? '—' : Math.round(c.temp)}<sup>°</sup></div>
        <div class="cond">${esc(describe(c.code))}</div>
        <div class="hilo">Màx. ${deg(today?.max)} · Mín. ${deg(today?.min)} · Sensació ${deg(c.feels)}</div>
        <div class="src">Previsió del model per a ara · ${esc(fc.source)}</div>
      </div>
      <div class="now-icon">${iconSvg(c.code, c.isDay, 112)}</div>
    </section>
    ${nowcastCard()}
    <section class="card">
      <h2>Pròximes 24 hores <span>${esc(fc.source)}</span></h2>
      <div class="tabs" role="tablist">
        ${[['temp', 'Temperatura'], ['rain', 'Pluja'], ['wind', 'Vent']].map(([k, l]) =>
          `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}
      </div>
      <div class="hours" id="hours">${hourChart()}</div>
    </section>
    <section class="card">
      <h2>Pròxims ${fc.daily.length} dies <span>${esc(fc.source)}</span></h2>
      <ul class="days">${dayRows()}</ul>
    </section>
    <div class="grid">${detailCards()}</div>`;

  $('foot').innerHTML = `Dades: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a> (CC BY 4.0) · model AROME de Météo-France a Catalunya<br>
    Noms de lloc: © OpenStreetMap · Les dades oficials de Meteocat s'hi afegiran quan arribi la clau`;
  renderUpdated();
}

function banner(html, raw = false) {
  return `<section class="card banner"><svg width="20" height="20" viewBox="0 0 24 24" fill="#ffcc33" style="flex:none"><path d="M12 2L1 21h22L12 2zm1 15h-2v2h2v-2zm0-7h-2v5h2v-5z"/></svg><div>${raw ? html : esc(html)}</div></section>`;
}

// ---------- Pluja de les pròximes 12 hores ----------
// Les primeres ~2 hores en trams de 15 min (quan és útil saber quan comença o para) i la resta per hores,
// amb la probabilitat. Tot plegat en una sola barra de temps i una frase que ho resumeix.
const RAIN_HOURS = 12;

function rainTimeline() {
  const nc = fc.nowcast || [], hours = fc.hourly || [];
  const start = nc[0]?.t ?? hours[0]?.t;
  if (start == null) return null;
  const end = start + RAIN_HOURS * 3600;
  const popAt = (t) => hours.find((h) => t >= h.t && t < h.t + 3600)?.pop ?? null;
  // Fins a l'hora en punt que hi ha passades unes 2 hores (com a molt fins on arriben les dades de 15 min).
  const cut = nc.length ? Math.min(nc.at(-1).t + 900, Math.ceil((start + 2 * 3600) / 3600) * 3600) : start;
  const segs = [];
  for (const q of nc) if (q.t < cut) segs.push({ t: q.t, dur: 900, mmh: q.mm * 4, pop: popAt(q.t), fine: true });
  for (const h of hours) if (h.t >= cut && h.t < end) segs.push({ t: h.t, dur: 3600, mmh: h.mm, pop: h.pop, fine: false });
  // Pluja "segura": el model en dona en aquell tram (i, per hores, amb una probabilitat raonable).
  for (const g of segs) g.wet = g.fine ? g.mmh >= 0.4 : g.mmh >= 0.1 && (g.pop ?? 100) >= 40;
  return { segs, start, end: segs.length ? segs.at(-1).t + segs.at(-1).dur : end, cut };
}

// "a les 18:00", "cap a les 18:00", "demà a les 04:00", "demà cap a les 04:00"
function rainWhen(t, cap = false) {
  const day = (x) => fmt({ day: 'numeric' }).format(x * 1000);
  return `${day(t) !== day(Date.now() / 1000) ? 'demà ' : ''}${cap ? 'cap ' : ''}a les ${hhmm(t)}`;
}

function rainSentence(segs) {
  const i0 = segs.findIndex((g) => g.wet);
  if (i0 === -1) {
    let text = `Sense pluja les pròximes ${RAIN_HOURS} hores`;
    const top = segs.reduce((m, g) => ((g.pop ?? 0) > (m?.pop ?? 0) ? g : m), null);
    if (top && top.pop >= 20) text += `<small>Probabilitat màxima del ${top.pop} % ${rainWhen(top.t)}: com a molt, algun ruixat aïllat.</small>`;
    return text;
  }
  const j = segs.findIndex((g, k) => k > i0 && !g.wet);
  const run = segs.slice(i0, j === -1 ? undefined : j);
  const kind = rainIntensity(Math.max(...run.map((g) => g.mmh)) / 4);
  const pops = run.filter((g) => !g.fine && g.pop != null).map((g) => g.pop);
  const prob = pops.length ? ` (probabilitat ${Math.max(...pops)} %)` : '';
  const stop = j === -1 ? null : segs[j].t;
  const main = i0 === 0
    ? (stop ? `Pluja ${kind} ara; para ${rainWhen(stop, true)}` : `Pluja ${kind} durant les pròximes ${RAIN_HOURS} hores${prob}`)
    : `Sense pluja fins ${rainWhen(segs[i0].t)}. Després, pluja ${kind}${prob}${stop ? `, fins ${rainWhen(stop, true)}` : ''}`;
  // I després d'aquest episodi, torna a ploure?
  if (j === -1) return main;
  const rest = segs.slice(j);
  const again = rest.find((g) => g.wet);
  if (again) return `${main}<small>Torna a ploure ${rainWhen(again.t)}${again.pop != null && !again.fine ? ` (${again.pop} %)` : ''}.</small>`;
  const top = rest.reduce((m, g) => ((g.pop ?? 0) > (m?.pop ?? 0) ? g : m), null);
  if (top && top.pop >= 30) return `${main}<small>Més tard, possibles ruixats (probabilitat fins al ${top.pop} % ${rainWhen(top.t)}).</small>`;
  return main;
}

function nowcastCard() {
  const tl = rainTimeline();
  if (!tl || !tl.segs.length) return '';
  const { segs, start, end, cut } = tl;
  const span = end - start;
  const bars = segs.map((g) => {
    const h = g.mmh > 0 ? Math.max(8, Math.min(100, (g.mmh / 4) * 100)) : 0;
    const pop = !g.fine && g.pop ? `<em style="height:${g.pop}%"></em>` : '';
    const tip = `${hhmm(g.t)} · ${nf1.format(g.mmh)} mm/h${g.pop != null && !g.fine ? ` · ${g.pop} %` : ''}`;
    return `<span style="flex:${g.dur / 900}" title="${tip}">${pop}<b style="height:${h}%;opacity:${g.wet ? 0.95 : 0.45}"></b></span>`;
  }).join('');
  // Etiquetes: "Ara" i cada 3 hores en punt.
  const labs = [`<span style="left:0">Ara</span>`];
  for (let t = Math.ceil((start + 1800) / 10800) * 10800; t < end - 1800; t += 10800) {
    labs.push(`<span style="left:${((t - start) / span) * 100}%">${hhmm(t)}</span>`);
  }
  const cutPct = ((cut - start) / span) * 100;
  return `<section class="card nowcast">
    <h2>Pluja pròximes ${RAIN_HOURS} h <span>${cut > start ? '15 min, després hores' : 'per hores'}</span></h2>
    <p>${rainSentence(segs)}</p>
    <div class="ncbar">${bars}${cut > start && cut < end ? `<i class="nccut" style="left:${cutPct}%"></i>` : ''}</div>
    <div class="nclab">${labs.join('')}</div>
    <div class="nckey"><span><b></b>Pluja prevista (mm/h)</span><span><em></em>Probabilitat (per hores)</span></div>
  </section>`;
}

function hourLabel(h, i) {
  if (i === 0) return 'Ara';
  const H = hh(h.t);
  return H === '00' ? cap(weekday(h.t, 'short')) : H;
}

function hourChart() {
  const hrs = fc.hourly;
  const W = 56, H = 150, width = hrs.length * W;
  const xs = hrs.map((_, i) => i * W + W / 2);
  const label = (h, i) => `<text x="${xs[i]}" y="146" fill="rgba(255,255,255,.78)" font-size="12" text-anchor="middle">${hourLabel(h, i)}</text>`;
  let out = '';

  if (tab === 'temp') {
    const ts = hrs.map((h) => h.temp ?? 0);
    let lo = Math.min(...ts), hi = Math.max(...ts);
    if (hi - lo < 4) { const m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
    const y = (t) => 76 - ((t - lo) / (hi - lo)) * 46;
    const pts = hrs.map((h, i) => [xs[i], y(h.temp ?? 0)]);
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2;
      d += ` C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`;
    }
    out += `<defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffd34d" stop-opacity=".42"/><stop offset="1" stop-color="#ffd34d" stop-opacity="0"/></linearGradient></defs>`;
    out += `<path d="${d} L${pts.at(-1)[0]} 84 L${pts[0][0]} 84Z" fill="url(#tg)"/><path class="draw" d="${d}" fill="none" stroke="#ffd34d" stroke-width="2.5"/>`;
    hrs.forEach((h, i) => {
      out += `<text x="${xs[i]}" y="${pts[i][1] - 10}" fill="#fff" font-size="14" text-anchor="middle">${deg(h.temp)}</text>`;
      out += iconSvg(h.code, h.isDay, 28, xs[i] - 14, 88);
      if (h.pop >= 10) out += `<text x="${xs[i]}" y="128" fill="#a8dcff" font-size="11" text-anchor="middle">${h.pop}%</text>`;
      out += label(h, i);
    });
  } else if (tab === 'rain') {
    out += `<line x1="0" y1="104" x2="${width}" y2="104" stroke="rgba(255,255,255,.25)"/>`;
    hrs.forEach((h, i) => {
      const p = h.pop ?? 0, bh = (p / 100) * 66;
      out += `<rect x="${xs[i] - 12}" y="${104 - bh}" width="24" height="${Math.max(bh, 1)}" rx="4" fill="#a8dcff" opacity="${p ? 0.9 : 0.3}"/>`;
      out += `<text x="${xs[i]}" y="${98 - bh}" fill="#fff" font-size="12" text-anchor="middle">${h.pop == null ? '—' : p + '%'}</text>`;
      if (h.mm >= 0.1) out += `<text x="${xs[i]}" y="122" fill="#a8dcff" font-size="11" text-anchor="middle">${nf1.format(h.mm)} mm</text>`;
      out += label(h, i);
    });
  } else {
    hrs.forEach((h, i) => {
      const x = xs[i], rot = ((h.dir ?? 0) + 180) % 360;
      out += `<text x="${x}" y="40" fill="#fff" font-size="15" text-anchor="middle">${h.wind == null ? '—' : Math.round(h.wind)}</text>`;
      out += `<text x="${x}" y="54" fill="rgba(255,255,255,.6)" font-size="10" text-anchor="middle">km/h</text>`;
      out += `<g transform="rotate(${rot} ${x} 80)"><path d="M${x} 68 l7 16 l-7 -4 l-7 4z" fill="#fff"/></g>`;
      out += `<text x="${x}" y="114" fill="rgba(255,255,255,.75)" font-size="11" text-anchor="middle">${windName(h.dir)}</text>`;
      if (h.gust != null) out += `<text x="${x}" y="128" fill="#a8dcff" font-size="10.5" text-anchor="middle">ratxa ${Math.round(h.gust)}</text>`;
      out += label(h, i);
    });
  }
  return `<svg width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="Gràfic per hores">${out}</svg>`;
}

function dayRows() {
  const days = fc.daily;
  const lo = Math.min(...days.map((d) => d.min ?? 99)), hi = Math.max(...days.map((d) => d.max ?? -99));
  const pct = (v) => ((v - lo) / Math.max(hi - lo, 1)) * 100;
  return days.map((d, i) => {
    const name = i === 0 ? 'Avui' : cap(weekday(d.t));
    const more = openDays.has(i) ? `<div class="day-more">
        <span>${esc(describe(d.code))}</span>
        <span>Pluja: ${nf1.format(d.mm)} mm</span>
        <span>Vent màx.: ${d.windMax == null ? '—' : Math.round(d.windMax)} km/h${d.gustMax != null ? ` (ratxes ${Math.round(d.gustMax)})` : ''}</span>
        <span>UV màx.: ${d.uv == null ? '—' : nf1.format(d.uv)}</span>
        <span>Sol: ${hhmm(d.sunrise)} – ${hhmm(d.sunset)}</span>
      </div>` : '';
    return `<li><button class="day" data-day="${i}" aria-expanded="${openDays.has(i)}">
        <span>${name}</span>${iconSvg(d.code, true, 28)}
        <span class="p">${d.pop ? d.pop + '%' : ''}</span>
        <span class="lo">${deg(d.min)}</span>
        <span class="range"><i style="left:${pct(d.min)}%;right:${100 - pct(d.max)}%"></i></span>
        <span class="hi">${deg(d.max)}</span>
      </button>${more}</li>`;
  }).join('');
}

function detailCards() {
  const c = fc.current;
  const rot = ((c.dir ?? 0) + 180) % 360;
  const trend = c.pressureTrend == null ? '' : c.pressureTrend > 1 ? 'pujant' : c.pressureTrend < -1 ? 'baixant' : 'estable';
  const vis = c.visibility == null ? null : c.visibility / 1000;
  const feelsDiff = c.feels != null && c.temp != null ? c.feels - c.temp : 0;
  const feelsTxt = feelsDiff <= -2 ? 'Sembla més fred que la temperatura real' : feelsDiff >= 2 ? 'Sembla més calor que la temperatura real' : 'Similar a la temperatura real';

  return `
    <section class="card"><h2>Vent</h2>
      <div style="display:flex;align-items:center;gap:10px">
        <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="24" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/>
          <text x="27" y="11" fill="#fff" font-size="8" text-anchor="middle">N</text>
          <g transform="rotate(${rot} 27 27)"><path d="M27 12 L32 32 L27 27 L22 32Z" fill="#fff"/></g></svg>
        <div><div class="big">${c.wind == null ? '—' : Math.round(c.wind)}</div><div class="sub">km/h</div></div>
      </div>
      <div class="sub">Del ${windName(c.dir) || '—'} · ratxes de ${c.gust == null ? '—' : Math.round(c.gust)} km/h</div>
    </section>
    <section class="card"><h2>Humitat</h2><div class="big">${c.humidity == null ? '—' : Math.round(c.humidity) + '%'}</div><div class="sub">Punt de rosada ${deg(c.dew)}</div></section>
    <section class="card"><h2>Índex UV</h2><div class="big">${c.uv == null ? '—' : Math.round(c.uv)}</div><div class="sub">${uvLevel(c.uv)}</div>
      <div class="uvbar"><i style="left:${Math.min((c.uv ?? 0) / 11, 1) * 100}%"></i></div></section>
    <section class="card"><h2>Pressió</h2><div class="big">${c.pressure == null ? '—' : Math.round(c.pressure)}</div><div class="sub">hPa${trend ? ' · ' + trend : ''}</div></section>
    <section class="card"><h2>Sensació</h2><div class="big">${deg(c.feels)}</div><div class="sub">${feelsTxt}</div></section>
    <section class="card"><h2>Visibilitat</h2><div class="big">${vis == null ? '—' : vis >= 10 ? Math.round(vis) : nf1.format(vis)} <small style="font-size:16px">km</small></div><div class="sub">${vis == null ? '' : vis >= 10 ? 'Bona' : vis >= 4 ? 'Moderada' : 'Reduïda'}</div></section>
    ${sunCard()}`;
}

function duration(sec) {
  const m = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}

// Icona de sortida (fletxa amunt) o posta (fletxa avall): mig sol sobre l'horitzó.
function sunEventIcon(up) {
  const col = up ? '#ffd34d' : '#ff9a4d';
  const arrow = up ? 'M12 2v6M9 5l3-3 3 3' : 'M12 2v6M9 5l3 3 3-3';
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 18a7 7 0 0 1 14 0z" fill="${col}"/><path d="M2 18h20" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
    <path d="${arrow}" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function sunCard() {
  const d0 = fc.daily[0], d1 = fc.daily[1];
  if (!d0) return '';
  const now = Date.now() / 1000;
  const before = now < d0.sunrise, after = now > d0.sunset, during = !before && !after;
  const p = Math.max(0, Math.min(1, (now - d0.sunrise) / (d0.sunset - d0.sunrise)));

  // Arc del sol: de l'horitzó esquerre (sortida) al dret (posta)
  const X0 = 34, X1 = 266, Y = 84, TOP = -6;
  const P = (t) => {
    const a = (1 - t) ** 2, b = 2 * (1 - t) * t, c = t * t;
    return [a * X0 + b * 150 + c * X1, a * Y + b * TOP + c * Y];
  };
  const steps = Math.max(1, Math.round(p * 40));
  const done = Array.from({ length: steps + 1 }, (_, i) => P((i / steps) * p).map((v) => v.toFixed(1)).join(' ')).join(' L');
  const [sx, sy] = P(p);

  let status;
  if (during) status = `La posta serà d'aquí <b>${duration(d0.sunset - now)}</b>`;
  else if (before) status = `El sol sortirà d'aquí <b>${duration(d0.sunrise - now)}</b>`;
  else status = `El sol es va pondre fa ${duration(now - d0.sunset)}${d1 ? ` · demà surt a les <b>${hhmm(d1.sunrise)}</b>` : ''}`;

  const dayLen = Math.round((d0.sunset - d0.sunrise) / 60);
  const nextIsRise = before, nextIsSet = during;

  return `<section class="card wide sun"><h2>Sol <span>${Math.floor(dayLen / 60)} h ${dayLen % 60} min de llum</span></h2>
    <p class="sun-status">${status}</p>
    <svg viewBox="0 0 300 96" style="display:block;width:100%;height:auto;max-height:150px" aria-hidden="true">
      <defs><linearGradient id="sunArc" x1="0" x2="1"><stop offset="0" stop-color="#ffd34d"/><stop offset="1" stop-color="#ff9a4d"/></linearGradient></defs>
      <path d="M${X0} ${Y} Q150 ${TOP} ${X1} ${Y}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-dasharray="4 5"/>
      ${p > 0 ? `<path d="M${done}" fill="none" stroke="url(#sunArc)" stroke-width="3.5" stroke-linecap="round"/>` : ''}
      <line x1="6" y1="${Y}" x2="294" y2="${Y}" stroke="rgba(255,255,255,.4)"/>
      <circle cx="${X0}" cy="${Y}" r="5" fill="#ffd34d" ${before ? '' : 'opacity=".55"'}/>
      <circle cx="${X1}" cy="${Y}" r="5" fill="#ff9a4d" ${after ? 'opacity=".55"' : ''}/>
      ${during ? `<circle cx="${sx}" cy="${sy}" r="12" fill="#ffd34d" opacity=".25"/><circle cx="${sx}" cy="${sy}" r="7.5" fill="#ffd34d"/>` : ''}
    </svg>
    <div class="sun-times">
      <div class="${nextIsRise ? 'next' : ''}">${sunEventIcon(true)}<div><small>Sortida</small><strong>${hhmm(d0.sunrise)}</strong></div></div>
      <div class="${nextIsSet ? 'next' : ''}"><div><small>Posta</small><strong>${hhmm(d0.sunset)}</strong></div>${sunEventIcon(false)}</div>
    </div>
  </section>`;
}

// ---------- Interaccions ----------
main.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab],[data-day],[data-act]');
  if (!t) return;
  if (t.dataset.tab) {
    tab = t.dataset.tab;
    main.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    $('hours').innerHTML = hourChart();
  } else if (t.dataset.day) {
    const i = Number(t.dataset.day);
    openDays.has(i) ? openDays.delete(i) : openDays.add(i);
    main.querySelector('.days').innerHTML = dayRows();
  } else if (t.dataset.act === 'retry') refresh();
});

$('refreshBtn').onclick = () => (store.get('selected') === 'gps' ? locate() : refresh());
$('placeBtn').onclick = () => openSheet();

// ---------- Full de llocs ----------
const sheet = $('sheet');
let searchCtl = null, searchTimer = null;

function openSheet(msg = '') {
  $('sheetMsg').hidden = !msg;
  $('sheetMsg').textContent = msg;
  $('search').value = '';
  $('results').innerHTML = '';
  renderPlaces();
  sheet.hidden = false;
  setTimeout(() => $('search').focus(), 50);
}
function closeSheet() { sheet.hidden = true; }

function renderPlaces() {
  const sel = store.get('selected', 'gps');
  const last = store.get('lastGps');
  const gpsIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="flex:none"><path d="M21 3L3 10.5l7.5 2.9L13.5 21z"/></svg>';
  const dot = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex:none"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  const items = [`<li><button class="pick ${sel === 'gps' ? 'on' : ''}" data-pick="gps">${gpsIcon}<span>La meva ubicació<small>${esc(last ? last.name : 'Fes servir el GPS del mòbil')}</small></span></button></li>`];
  for (const p of store.get('places', [])) {
    items.push(`<li><button class="pick ${sel === p.id ? 'on' : ''}" data-pick="${esc(p.id)}">${dot}<span>${esc(p.name)}<small>${esc(p.sub)}</small></span></button>
      <button class="del" data-del="${esc(p.id)}" aria-label="Treure ${esc(p.name)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>`);
  }
  $('places').innerHTML = items.join('');
}

$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = $('search').value.trim();
  if (q.length < 2) { $('results').innerHTML = ''; return; }
  searchTimer = setTimeout(async () => {
    searchCtl?.abort();
    searchCtl = new AbortController();
    try {
      const res = await searchPlaces(q, { signal: searchCtl.signal });
      $('results').innerHTML = res.length
        ? res.map((p) => `<li><button class="pick" data-result='${esc(JSON.stringify(p))}'><span>${esc(p.name)}<small>${esc(p.sub)}</small></span></button></li>`).join('')
        : '<li><span class="pick">Cap resultat</span></li>';
    } catch (e) {
      if (e.name !== 'AbortError') $('results').innerHTML = '<li><span class="pick">No s\'ha pogut cercar (sense connexió?)</span></li>';
    }
  }, 300);
});

sheet.addEventListener('click', (e) => {
  if (e.target === sheet) return closeSheet();
  const pick = e.target.closest('[data-pick]');
  const del = e.target.closest('[data-del]');
  const res = e.target.closest('[data-result]');
  if (del) {
    store.set('places', store.get('places', []).filter((p) => p.id !== del.dataset.del));
    if (store.get('selected') === del.dataset.del) { closeSheet(); locate(); return; }
    renderPlaces();
  } else if (pick) {
    closeSheet();
    if (pick.dataset.pick === 'gps') return locate();
    const p = store.get('places', []).find((x) => x.id === pick.dataset.pick);
    if (p) { store.set('selected', p.id); geoNote = ''; show(p); }
  } else if (res) {
    const p = JSON.parse(res.dataset.result);
    const list = [p, ...store.get('places', []).filter((x) => x.id !== p.id)].slice(0, 10);
    store.set('places', list);
    store.set('selected', p.id);
    geoNote = '';
    closeSheet();
    show(p);
  }
});
$('closeSheet').onclick = closeSheet;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

// ---------- Estirar per actualitzar ----------
const ptr = $('ptr');
let y0 = null, dy = 0;
window.addEventListener('touchstart', (e) => { y0 = window.scrollY <= 0 && sheet.hidden ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (y0 == null) return;
  dy = e.touches[0].clientY - y0;
  if (dy > 0) ptr.style.transform = `translateY(${Math.min(dy / 2, 80) - 60}px) rotate(${dy * 2}deg)`;
}, { passive: true });
window.addEventListener('touchend', () => {
  if (y0 != null && dy > 140) $('refreshBtn').click();
  ptr.style.transform = '';
  y0 = null;
});

// ---------- Actualització automàtica ----------
setInterval(maybeRefresh, 60 * 1000);
document.addEventListener('visibilitychange', maybeRefresh);
window.addEventListener('online', () => offline && refresh());

// ---------- Instal·lar l'app ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
$('installBtn').onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice;
  installEvt = null;
  $('installBtn').hidden = true;
};
window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Les dades del mar ara són de l'app Estat del Mar: n'esborrem la còpia antiga per no ocupar espai.
if (store.get('marine')) store.set('marine', undefined);

start();
