# Aplicació del temps: pla

Objectiu: una app per al mòbil, instal·lable, que mostri el temps de Catalunya amb dades **oficials**, **actualitzades sovint** i que digui sempre **d'on surten i de quan són**.

---

## 1. D'on traiem les dades

### Font principal: Meteocat (Servei Meteorològic de Catalunya)
És la font més fiable per a Catalunya: predicció feta pels predictors del SMC i observacions reals de la xarxa d'estacions automàtiques (XEMA).

| Què | Endpoint (GET, `https://api.meteo.cat`) | Freqüència real |
|---|---|---|
| Predicció horària 72 h per municipi | `/pronostic/v1/municipalHoraria/{codiMunicipi}` | ~2 cops al dia |
| Predicció 8 dies per municipi (tmax, tmin, % pluja, estat del cel) | `/pronostic/v1/municipal/{codiMunicipi}` | ~2 cops al dia |
| Índex UV (3 dies) | `/pronostic/v1/uvi/{codiMunicipi}` | diària |
| Observació real ara (estació XEMA més propera) | `/xema/v1/variables/mesurades/{codiVariable}/ultimes?codiEstacio={codi}` o `/xema/v1/estacions/mesurades/{codi}/{any}/{mes}/{dia}` | cada 30 min |
| Avisos (SMP, situació meteorològica de perill) | apartat SMP de la documentació (camí per confirmar) | quan n'hi ha |
| Consum de la quota | `/quotes/v1/consum-actual` | — |

Condicions importants (comprovades a apidocs.meteocat.gencat.cat):
- **Cal clau d'API** (gratuïta per a ús personal, pla "Accés ciutadà i administració"). Es demana al formulari de registre amb NIF i motiu; s'envia a la capçalera `x-api-key`.
- **CORS desactivat**: l'API no es pot cridar des del navegador ni des de l'app. Cal **un petit servidor intermediari** que guardi la clau i faci de memòria cau. El mateix Meteocat ho recomana.
- **Quota mensual** per pla (es reinicia el dia 1 a les 00:00 UTC; si es supera, error 429). La xifra exacta del pla gratuït no surt publicada: **la llegirem amb `/quotes/v1/consum-actual` un cop tinguem la clau** i ajustarem la freqüència.
- **Redistribució**: el pla ciutadà és per a ús personal. Es demana no difondre les dades a tercers; si mai es publica l'app per a altres persones, cal citar "Font: Meteocat" i informar-ne el SMC (o demanar un altre pla). Per a una app per a tu mateix, cap problema.

### Font complementària: Open-Meteo (sense clau)
Serveix per omplir el que Meteocat no dona o dona amb poca freqüència, i com a recanvi si Meteocat falla.
- Gratuït per a ús no comercial, sense clau, amb CORS (es pot cridar directament des de l'app).
- Fa servir el millor model disponible per a cada punt; per a Catalunya, el model **AROME de Météo-France** (alta resolució, actualitzat cada hora, passos de 15 min).
- Ens dona: sensació tèrmica, vent i ratxes, humitat, pressió, visibilitat, sortida i posta del sol, i **pluja a curt termini en passos de 15 minuts** ("començarà a ploure d'aquí 20 min").
- Atribució obligatòria: "Weather data by Open-Meteo.com" (CC BY 4.0).

### Opcional: AEMET OpenData
Clau gratuïta. Útil per als **avisos oficials** en format estàndard (CAP) si l'apartat SMP de Meteocat es complica, i com a segona opinió.

### Regla de fiabilitat
1. Previsió per dies i per hores: **Meteocat**. Si falla, Open-Meteo, amb un avís visible.
2. "Ara mateix": **observació real de l'estació XEMA més propera** (temperatura mesurada, no prevista). Si l'estació no envia dades, la previsió de l'hora actual.
3. Cada bloc ensenya **la font i fa quant s'ha actualitzat** ("Meteocat · fa 12 min"). Si una dada té més de 3 h, es veu en gris amb el rellotge.
4. Si no hi ha connexió, l'app ensenya les últimes dades desades i diu de quan són.

---

## 2. Arquitectura

```
 [Mòbil: app PWA] ──► [Cloudflare Worker (servidor intermediari)] ──► api.meteo.cat (amb la clau)
        │                       │ memòria cau (KV)
        └──────────────────────►  Open-Meteo (directe, sense clau)
```

- **App**: PWA (HTML + CSS + JS) publicada a GitHub Pages, al costat de l'índex de projectes.
  - "Descarregable": des de Chrome, *Afegeix a la pantalla d'inici* → s'obre a pantalla completa, amb icona, i funciona sense connexió.
  - Si més endavant vols un **APK** de veritat (per instal·lar fora de Chrome o tenir widget a la pantalla), s'embolica la mateixa PWA amb Capacitor o TWA. Res no es perd.
- **Servidor intermediari**: un Cloudflare Worker (pla gratuït, sense manteniment).
  - Guarda la clau de Meteocat com a secret (no és mai visible a l'app).
  - Una tasca programada baixa les dades dels municipis que facis servir i les desa a la memòria cau. L'app llegeix sempre de la memòria cau, així la quota de Meteocat no depèn de quants cops obris l'app.
  - Freqüència proposada (a ajustar amb la quota real):
    - Predicció horària i de 8 dies: cada 3 h (Meteocat les renova ~2 cops al dia, així no se'n perd cap).
    - Observació XEMA: cada 30 min.
    - Avisos: cada 30 min.
  - Exemple: 2 municipis → (2 × 2 × 8) + (2 × 48) + 48 ≈ 176 crides/dia ≈ 5.300/mes. Si la quota és més baixa, es redueix (per exemple, observació cada hora i predicció cada 6 h).
- **Actualització a l'app**: en obrir-la, i cada 15 min mentre és oberta; estirar cap avall per refrescar.

### Ubicació itinerant (la previsió segueix el mòbil)
L'app no té una ciutat fixa: en obrir-la, demana la ubicació del mòbil (API de geolocalització del navegador; GitHub Pages ja és HTTPS, que és el requisit) i hi adapta tota la pantalla.

1. **Coordenades → municipi**: el Worker té desat un cop el mapa de límits municipals de l'ICGC (GeoJSON) i mira dins de quin municipi cau el punt. Així surt el codi de municipi de Meteocat exacte (no el poble més proper "en línia recta", que a la frontera entre municipis es pot equivocar). Alternativa més senzilla: el centre de municipi més proper de `/referencia/v1/municipis`.
2. **Coordenades → estació XEMA més propera** (de les metadades d'estacions, `/xema/v1/estacions/metadades`), tenint en compte també l'altitud, per no donar la temperatura d'una estació de muntanya a la vall.
3. **Fora de Catalunya** (Meteocat només cobreix els 947 municipis catalans): l'app passa sola a Open-Meteo per coordenades i ho indica ("Fora de Catalunya · Open-Meteo").
4. **Sense permís d'ubicació o sense GPS**: es fa servir l'última ubicació coneguda, o un cercador de municipis. També es poden desar llocs favorits (casa, feina) per consultar-los encara que no hi siguis.
5. **Estalvi de quota**: el Worker ja no baixa municipis fixos cada poques hores, sinó **a demanda**: el primer cop que es consulta un municipi baixa la previsió i la guarda 3 h; l'observació XEMA, 30 min. Si et mous per molts pobles en un dia, cada poble nou costa 2–3 crides; si tornes a un poble, ja ve de la memòria cau.
6. **Privadesa**: la ubicació només s'envia al teu propi Worker, arrodonida (~1 km) i no es desa enlloc.

---

## 3. Disseny (inspirat en el temps de Google)

Vegeu la maqueta: [maqueta.html](maqueta.html).

**Estructura de la pantalla, de dalt a baix**
1. **Capçalera**: nom del municipi (toc → canviar o afegir municipis), icona de cercar, hora de l'última actualització.
2. **Ara**: temperatura gran (observada a l'estació), icona i estat del cel en català, màxima / mínima del dia, sensació tèrmica. A sota, petit: "Estació XEMA de … · fa 8 min".
3. **Avís** (només si n'hi ha): franja de color (groc / taronja / vermell) amb el text de l'avís.
4. **Pluja a curt termini**: una frase ("No es preveu pluja la pròxima hora" o "Pluja feble d'aquí 20 min") amb una barra de 2 h.
5. **Pròximes hores**: cinta horitzontal desplaçable de 24 h amb la **corba de temperatura**, icona per hora i % de pluja en blau. Pestanyes *Temperatura · Pluja · Vent* com a Google.
6. **Pròxims 8 dies**: llista amb dia, icona, % de pluja i una **barra de rang** min–max (de blau a taronja) com a Google/iOS.
7. **Targetes de detall** (graella de 2 columnes): vent i ratxes amb brúixola, humitat, índex UV amb escala de color, pressió, sortida i posta del sol amb arc, visibilitat.
8. **Peu**: "Dades: Meteocat · Open-Meteo" i data de cada font.

**Estil**
- Fons amb **degradat segons el temps i l'hora**: blau cel (sol de dia), gris blavós (núvols), gris fosc (pluja), blau nit (de nit). Les targetes, semitransparents per sobre.
- Tipografia: *Google Sans* o, com a alternativa lliure, *Inter* / *Outfit*. Temperatura principal molt gran i lleugera.
- Icones pròpies tipus Google (sol groc, núvol blanc, gotes blaves), en SVG perquè siguin nítides.
- Tot en **català**, unitats del SI (°C, km/h, mm, hPa).
- Mode fosc automàtic seguint el mòbil.
- Animacions suaus i curtes: la corba de temperatura es dibuixa en entrar, sense res que distregui.

**Pantalles addicionals**
- **Municipis**: llista amb cercador dels 947 municipis (amb el codi Meteocat) i "La meva ubicació" via GPS, que tria el municipi i l'estació XEMA més propers.
- **Detall d'un dia**: en tocar un dia de la llista, gràfic per hores d'aquell dia.

---

## 4. Fases

1. **Clau de Meteocat**: formulari preparat el 19/11/2026 (plans XEMA i Predicció, 1 any); falten les dades personals i enviar-lo. Meteocat respon per correu en un termini de 7 dies. Després, comprovar la quota real.
2. **Prototip només amb Open-Meteo** ✅ fet el 19/11/2026: ubicació GPS, cercador, llocs desats, gràfics per hores, 8 dies, targetes de detall, mode sense connexió i instal·lable. Falta publicar-lo amb HTTPS per provar-lo al mòbil.
3. **Worker + Meteocat**: posar el servidor intermediari, passar la previsió i l'observació a Meteocat, amb Open-Meteo de recanvi.
4. **Avisos** (SMP de Meteocat o AEMET).
5. **PWA instal·lable i sense connexió**, publicada a GitHub Pages i afegida a l'índex de projectes.
6. (Opcional) APK amb Capacitor, widget de pantalla d'inici, notificacions d'avís de pluja.

## 5. Decisions pendents
- ~~Quins municipis vols tenir de sèrie?~~ Decidit: ubicació del mòbil + favorits opcionals.
- PWA (recomanat) o APK des del començament?
- Notificacions d'avisos: sí o no? (Necessiten el Worker i un permís del mòbil.)
