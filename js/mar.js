import { BEACHES, TZ, fetchMarine, cachedMarine, analyze, bestWindow, LEVELS, localParts, dayKeyOffset, swimWindow } from './marine.js';
import { windName } from './weather.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const nf1 = new Intl.NumberFormat('ca', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt = (o) => new Intl.DateTimeFormat('ca', { timeZone: TZ, ...o });
const hh = (t) => fmt({ hour: '2-digit', hourCycle: 'h23' }).format(t * 1000);
const hhmm = (t) => fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t * 1000);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const m = (v) => (v == null ? '—' : nf1.format(v));
const REL = { terra: 'de terra', mar: 'de mar', lateral: 'lateral' };

let data = null;
let idx = 0;       // hora seleccionada (índex dins de data.times)
let nowIdx = 0;
let offline = false;
let map = null;
const markers = {};
let selected = null;

function dayLabel(t) {
  const d = localParts(t).day;
  if (d === dayKeyOffset(0)) return 'Avui';
  if (d === dayKeyOffset(1)) return 'Demà';
  return cap(fmt({ weekday: 'long' }).format(t * 1000));
}
const winText = (w) => `${hh(w.start)}–${hh(w.end)} h`;
function ago(ms) {
  const mn = Math.round((Date.now() - ms) / 60000);
  return mn < 1 ? 'ara mateix' : mn < 60 ? `fa ${mn} min` : `fa ${Math.floor(mn / 60)} h`;
}

// ---------- Càrrega ----------
async function load(force = false) {
  const first = !data;
  data = data || cachedMarine();
  if (data && first) { setNow(); renderAll(); }
  $('refreshBtn').classList.add('spin');
  try {
    data = await fetchMarine({ force });
    offline = false;
    const keep = idx > nowIdx ? data.times[idx] : null;
    setNow();
    if (keep) { const k = data.times.indexOf(keep); if (k >= 0) idx = k; }
    renderAll();
  } catch (e) {
    offline = true;
    if (data) renderAll();
    else $('beaches').innerHTML = `<li class="brow">No s'han pogut carregar les dades del mar. ${e.message}</li>`;
  } finally {
    $('refreshBtn').classList.remove('spin');
  }
}

function setNow() {
  const now = Date.now() / 1000;
  nowIdx = Math.max(0, data.times.findLastIndex((t) => t <= now));
  idx = nowIdx;
}

// ---------- Pintar ----------
function renderAll() {
  const slider = $('time');
  slider.min = nowIdx;
  slider.max = data.times.length - 1;
  slider.value = idx;
  $('updated').textContent = offline
    ? `Sense connexió · dades de les ${hhmm(data.fetchedAt / 1000)} (${ago(data.fetchedAt)})`
    : `Actualitzat a les ${hhmm(data.fetchedAt / 1000)} (${ago(data.fetchedAt)}) · ${data.source}`;
  $('updated').classList.toggle('stale', offline);
  const sw = swimWindow();
  $('listHint').textContent = `millor franja entre les ${sw.from} i les ${sw.to} h`;
  initMap();
  renderTime();
  if (selected) renderDetail();
}

function renderTime() {
  const t = data.times[idx];
  $('timeLabel').textContent = `${dayLabel(t)} · ${hhmm(t)}`;
  renderMarkers();
  renderList();
}

function initMap() {
  if (map || !window.L) {
    if (!window.L) $('map').innerHTML = '<p style="padding:20px;color:#0b1d2c">El mapa necessita connexió.</p>';
    return;
  }
  map = L.map('map', { zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.25 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  map.fitBounds(L.latLngBounds(BEACHES.map((b) => [b.lat, b.lon])), { padding: [20, 20] });
  for (const b of BEACHES) {
    markers[b.id] = L.marker([b.lat, b.lon], { keyboard: true, title: b.name, riseOnHover: true })
      .on('click', () => openDetail(b.id))
      .addTo(map);
  }
}

function renderMarkers() {
  if (!map) return;
  for (const b of BEACHES) {
    const h = data.beaches[b.id][idx];
    const a = analyze(b, h);
    const rot = ((h.windDir ?? 0) + 180) % 360;
    const html = `<div class="bm ${selected === b.id ? 'sel' : ''}" style="--c:${LEVELS[a.level].color}">
        <svg class="arr" viewBox="0 0 18 18" style="transform:rotate(${rot}deg)"><path d="M9 1l5 12-5-3-5 3z" fill="#fff" stroke="#0b1d2c" stroke-width="1"/></svg>
        ${a.beachHs == null ? '—' : m(a.beachHs)}</div>`;
    markers[b.id].setIcon(L.divIcon({ className: 'bm-wrap', html, iconSize: [34, 34], iconAnchor: [17, 17] }));
  }
}

function sortedBeaches() {
  const favs = store.get('favBeaches', []);
  return [...BEACHES].sort((x, y) => (favs.includes(y.id) - favs.includes(x.id)) || (BEACHES.indexOf(x) - BEACHES.indexOf(y)));
}

function bestOf(b) {
  const hours = data.beaches[b.id];
  const today = bestWindow(b, hours, dayKeyOffset(0));
  if (today) return { w: today, label: 'avui' };
  const tom = bestWindow(b, hours, dayKeyOffset(1));
  return tom ? { w: tom, label: 'demà' } : null;
}

function renderList() {
  const favs = store.get('favBeaches', []);
  $('beaches').innerHTML = sortedBeaches().map((b) => {
    const h = data.beaches[b.id][idx];
    const a = analyze(b, h);
    const best = bestOf(b);
    const bestTxt = best ? `<span class="best"><i class="dot-s" style="color:${LEVELS[best.w.level].color}">●</i> Millor ${best.label} ${winText(best.w)}</span>` : '';
    return `<li>
      <button class="brow" data-b="${b.id}">
        <i class="dot" style="background:${LEVELS[a.level].color}"></i>
        <span class="bname">${b.name}<small>${bestTxt || b.town}</small></span>
        <span class="bvals">${m(a.beachHs)} m<small>${h.wind == null ? '—' : Math.round(h.wind)} km/h ${REL[a.rel]}</small></span>
      </button>
      <button class="star ${favs.includes(b.id) ? 'on' : ''}" data-star="${b.id}" aria-label="${favs.includes(b.id) ? 'Treure de preferides' : 'Marcar com a preferida'}: ${b.name}">${starSvg(favs.includes(b.id))}</button>
    </li>`;
  }).join('');
}

const starSvg = (on) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>`;

function toggleFav(id) {
  const favs = store.get('favBeaches', []);
  store.set('favBeaches', favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]);
  renderList();
  if (selected === id) renderDetail();
}

// ---------- Fitxa de platja ----------
function openDetail(id) {
  selected = id;
  $('detail').hidden = false;
  renderDetail();
  renderMarkers();
  if (map) { const b = BEACHES.find((x) => x.id === id); map.panTo([b.lat, b.lon]); }
}
function closeDetail() { $('detail').hidden = true; selected = null; renderMarkers(); }

function sentence(b, h, a) {
  const parts = [];
  parts.push(a.beachHs == null ? 'Sense dada d\'onada' : `Onada estimada de ${m(a.beachHs)} m a la platja`);
  if (h.wind != null) parts.push(`vent ${REL[a.rel]} de ${Math.round(h.wind)} km/h${h.gust != null ? ` (ratxes de ${Math.round(h.gust)})` : ''}`);
  return parts.join(', ') + '.';
}

function renderDetail() {
  const b = BEACHES.find((x) => x.id === selected);
  if (!b || !data) return;
  const hours = data.beaches[b.id];
  const h = hours[idx];
  const a = analyze(b, h);
  const favs = store.get('favBeaches', []);
  $('dTitle').textContent = b.name;
  $('dTown').textContent = `${b.town} · mira al ${windName(b.facing)}`;
  $('dStar').innerHTML = starSvg(favs.includes(b.id));
  $('dStar').style.color = favs.includes(b.id) ? '#ffd34d' : '';
  $('dStar').onclick = () => toggleFav(b.id);

  const wins = [0, 1].map((off) => {
    const w = bestWindow(b, hours, dayKeyOffset(off));
    const lbl = off ? 'Demà' : 'Avui';
    if (!w) return `<div>${lbl}<b>Franja passada</b></div>`;
    return `<div><i style="background:${LEVELS[w.level].color}"></i>${lbl}, millor<b>${winText(w)}</b>${LEVELS[w.level].short} · ${m(w.hs)} m · ${w.wind == null ? '—' : Math.round(w.wind)} km/h</div>`;
  }).join('');

  const swDir = h.swDir ?? h.dir;
  const facts = [
    ['Mar obert (model)', `${m(h.hs)} m del ${windName(h.dir)}${h.per ? `, ${Math.round(h.per)} s` : ''}`],
    ['Mar de fons', h.sw == null ? '—' : `${m(h.sw)} m del ${windName(swDir)}${h.swPer ? `, ${Math.round(h.swPer)} s` : ''}`],
    ['Mar de vent', h.ww == null ? '—' : `${m(h.ww)} m del ${windName(h.wwDir)}`],
    ['Vent', h.wind == null ? '—' : `${Math.round(h.wind)} km/h del ${windName(h.windDir)} (${REL[a.rel]}) · ratxes ${Math.round(h.gust ?? 0)}`],
    ['Aigua', h.sst == null ? '—' : `${nf1.format(h.sst)} °C`],
    ['Aire', h.air == null ? '—' : `${Math.round(h.air)} °C`],
  ];

  $('dBody').innerHTML = `
    <div class="d-now">
      <div class="lvl" style="background:${LEVELS[a.level].color}">${a.beachHs == null ? '—' : m(a.beachHs)}</div>
      <p><b>${LEVELS[a.level].label}</b> · ${dayLabel(h.t)} ${hhmm(h.t)}<br>${sentence(b, h, a)}
        ${a.why.length ? `<small>Per: ${a.why.join(', ')}.</small>` : ''}</p>
    </div>
    <div class="d-windows">${wins}</div>
    <div class="d-h">Pròximes 48 hores</div>
    <div class="d-chart" id="dChart">${chart(b, hours)}</div>
    <div class="d-h">Detall a les ${hhmm(h.t)}</div>
    <ul class="d-facts">${facts.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('')}</ul>
    <p class="d-note">L'onada a la platja s'estima a partir de la previsió mar endins (el model té cel·les de diversos km) i de cap on mira la platja: el mar que ve de fora del seu sector obert arriba molt reduït. Vent "de terra" vol dir que bufa cap al mar: aigua plana a la vora, però et pot allunyar.</p>`;

  const sc = $('dChart');
  const x = (idx - nowIdx) * 34 - sc.clientWidth / 2 + 17;
  sc.scrollLeft = Math.max(0, x);
}

function chart(b, hours) {
  const from = nowIdx, to = Math.min(hours.length, nowIdx + 48);
  const hs = hours.slice(from, to);
  const W = 34, H = 200, base = 112, maxM = Math.max(1, ...hs.map((h) => h.hs ?? 0));
  const sc = (v) => (v / maxM) * 76;
  let out = '';
  hs.forEach((h, i) => {
    const x = i * W, cx = x + W / 2, a = analyze(b, h), lv = LEVELS[a.level].color;
    const p = localParts(h.t);
    if (from + i === idx) out += `<rect x="${x + 1}" y="0" width="${W - 2}" height="${H}" rx="6" fill="rgba(255,255,255,.1)"/>`;
    if (p.hour === 0 && i) out += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3"/>`;
    out += `<rect x="${x + 2}" y="4" width="${W - 4}" height="8" rx="3" fill="${lv}"/>`;
    // onada mar endins (contorn) i a la platja (ple)
    if (h.hs != null) out += `<rect x="${cx - 9}" y="${base - sc(h.hs)}" width="18" height="${sc(h.hs)}" rx="3" fill="none" stroke="rgba(168,220,255,.45)" stroke-dasharray="2 2"/>`;
    if (a.beachHs != null) {
      out += `<rect x="${cx - 9}" y="${base - sc(a.beachHs)}" width="18" height="${Math.max(sc(a.beachHs), 1)}" rx="3" fill="#a8dcff"/>`;
      out += `<text x="${cx}" y="${base - Math.max(sc(a.beachHs), sc(h.hs ?? 0)) - 5}" fill="#fff" font-size="10.5" text-anchor="middle">${m(a.beachHs)}</text>`;
    }
    // vent
    const rot = ((h.windDir ?? 0) + 180) % 360;
    const wc = a.rel === 'mar' ? '#ffb46b' : a.rel === 'terra' ? '#9be7b4' : '#fff';
    out += `<g transform="rotate(${rot} ${cx} 134)"><path d="M${cx} 125 l6 14 l-6 -4 l-6 4z" fill="${wc}"/></g>`;
    out += `<text x="${cx}" y="158" fill="#fff" font-size="11" text-anchor="middle">${h.wind == null ? '—' : Math.round(h.wind)}</text>`;
    out += `<text x="${cx}" y="172" fill="rgba(255,255,255,.5)" font-size="9.5" text-anchor="middle">${h.gust == null ? '' : Math.round(h.gust)}</text>`;
    out += `<text x="${cx}" y="192" fill="rgba(255,255,255,.75)" font-size="11" text-anchor="middle">${p.hour === 0 ? cap(fmt({ weekday: 'short' }).format(h.t * 1000)) : String(p.hour).padStart(2, '0')}</text>`;
  });
  return `<svg width="${hs.length * W}" height="${H}" viewBox="0 0 ${hs.length * W} ${H}" role="img" aria-label="Onada i vent per hores">${out}</svg>
    <div class="legend" style="padding:6px 8px 0">
      <span><i style="background:#a8dcff"></i>Onada a la platja (m)</span>
      <span><i style="background:none;border:1px dashed rgba(168,220,255,.7)"></i>Mar obert</span>
      <span>Fletxa: vent <b style="color:#9be7b4">de terra</b> / <b style="color:#ffb46b">de mar</b> · km/h i ratxes</span>
    </div>`;
}

// ---------- Interaccions ----------
$('time').addEventListener('input', (e) => {
  idx = Number(e.target.value);
  renderTime();
  if (selected) renderDetail();
});

document.querySelector('.chips').addEventListener('click', (e) => {
  const j = e.target.closest('[data-jump]')?.dataset.jump;
  if (!j || !data) return;
  if (j === 'now') idx = nowIdx;
  else {
    const day = dayKeyOffset(1);
    const k = data.times.findIndex((t) => { const p = localParts(t); return p.day === day && p.hour === 7; });
    if (k >= 0) idx = k;
  }
  $('time').value = idx;
  renderTime();
  if (selected) renderDetail();
});

$('beaches').addEventListener('click', (e) => {
  const star = e.target.closest('[data-star]');
  if (star) return toggleFav(star.dataset.star);
  const row = e.target.closest('[data-b]');
  if (row) openDetail(row.dataset.b);
});

$('dClose').onclick = closeDetail;
$('detail').addEventListener('click', (e) => { if (e.target === $('detail')) closeDetail(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('detail').hidden) closeDetail(); });
$('refreshBtn').onclick = () => load(true);

setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

load();
