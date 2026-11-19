# El Temps (Aplicació del temps)

App web instal·lable (PWA) que mostra el temps allà on ets, fent servir la ubicació del mòbil.

- **Ara (prototip)**: dades d'Open-Meteo (model AROME de Météo-France a Catalunya), cercador de llocs, llocs desats, funciona sense connexió amb les últimes dades i l'hora en què es van baixar.
- **Després**: Meteocat (predicció municipal + observació XEMA) a través d'un Cloudflare Worker, quan arribi la clau. Vegeu [PLA.md](PLA.md).

## Provar-la a l'ordinador
```
node dev-server.js
```
i obrir http://localhost:5180

## Al mòbil
La ubicació només funciona amb HTTPS, així que cal publicar la carpeta (per exemple a GitHub Pages). Després, des de Chrome: menú ⋮ → *Afegeix a la pantalla d'inici* (o el botó de descàrrega de la capçalera de l'app).

## Fitxers
- `index.html`, `css/style.css`: pantalla
- `js/app.js`: lògica i pintat
- `js/data.js`: fonts de dades (format normalitzat; aquí s'afegirà Meteocat)
- `js/weather.js`: codis del temps → text en català, icones i fons
- `js/location.js`: GPS, nom del municipi i cercador
- `js/store.js`: desament local
- `sw.js`, `manifest.webmanifest`, `icons/`: instal·lació i mode sense connexió
- `tools/make-icons.js`: regenera les icones
