(() => {
  const $ = s => document.querySelector(s);

  // Cities are grouped into 3 colours (the exact type stays in the popup)
  const CITY_CAT = {
    'Federal Capital':'capital', 'Provincial Capital':'capital', 'Regional Capital':'capital',
    'Major City':'commercial', 'Industrial City':'commercial', 'Port City':'commercial',
    'Hill Station':'tourism', 'Tourism Hub':'tourism'
  };
  const CITY_STYLE = {
    capital:    {c:'#c1121f', s:16, label:'Capital cities'},
    commercial: {c:'#1d4e89', s:12, label:'Commercial and industrial cities'},
    tourism:    {c:'#2a9d4b', s:12, label:'Hill and tourism cities'}
  };
  const cityStyle = t => CITY_STYLE[CITY_CAT[t]] || CITY_STYLE.commercial;

  // Temperature colours: cool to hot
  const TEMP = [[22,'#3b82c4','Below 22 °C'],[28,'#63b3a5','22 to 27 °C'],[33,'#f2c94c','28 to 32 °C'],[37,'#ef7d2d','33 to 36 °C'],[Infinity,'#c62828','37 °C and above']];
  const tempColor = t => TEMP.find(b => t < b[0])[1];
  const BOUNDS = [[23.5, 60.8], [37.2, 77.9]];

  $('#cityLegend').innerHTML = Object.values(CITY_STYLE).map(s => `<li><i class="dot" style="--c:${s.c};--s:${s.s}px"></i>${s.label}</li>`).join('');
  $('#tempLegend').innerHTML = TEMP.map(b => `<li><i class="dia" style="--c:${b[1]}"></i>${b[2]}</li>`).join('');

  // Map and basemaps (OpenStreetMap and Satellite Imagery with place labels)
  const map = L.map('map', {zoomSnap:.25, maxBounds:[[15, 52], [44, 88]], maxBoundsViscosity:1}).setView([30.4, 69.3], 5);
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© OpenStreetMap contributors'}).addTo(map);
  const sat = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:19, maxNativeZoom:17, attribution:'Tiles © Esri, Maxar, Earthstar Geographics'}),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {maxZoom:19, maxNativeZoom:17})
  ]);
  const cityLayer = L.layerGroup().addTo(map);
  const stationLayer = L.layerGroup().addTo(map);
  L.control.layers(
    {'OpenStreetMap':osm, 'Satellite Imagery':sat},
    {'Cities':cityLayer, 'Weather Stations':stationLayer},
    {collapsed: matchMedia('(max-width:820px)').matches}
  ).addTo(map);
  L.control.scale({imperial:false}).addTo(map);

  // Fit Pakistan once the layout has its final size
  setTimeout(() => { map.invalidateSize(); map.fitBounds(BOUNDS, {padding:[24, 24]}); map.setMinZoom(Math.max(4, map.getZoom() - 1)); }, 100);

  // City names appear when zoomed in
  const zoomClass = () => $('#map').classList.toggle('z-high', map.getZoom() >= 7);
  map.on('zoomend', zoomClass); zoomClass();

  // Live coordinates
  map.on('mousemove click', e => { $('#coords').textContent = `Lat ${e.latlng.lat.toFixed(4)}  |  Lon ${e.latlng.lng.toFixed(4)}  |  Zoom ${map.getZoom()}`; });

  // Keep the map correct when the window is resized or the phone is rotated
  window.addEventListener('resize', () => map.invalidateSize());

  // Mobile panel button
  $('#panelBtn').onclick = () => $('#panel').classList.toggle('open');
  map.on('click', () => $('#panel').classList.remove('open'));

  const INFO_DEFAULT = $('#info').innerHTML;
  const showInfo = html => { $('#info').innerHTML = html; };

  // Load the GeoJSON data
  Promise.all(['data/cities.geojson', 'data/stations.geojson'].map(u =>
    fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); })
  )).then(([c, s]) => start(c.features, s.features))
    .catch(() => { $('#error').hidden = false; });

  function start(cities, stations) {
    const ll = f => [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    const cityMarkers = {};
    const sel = $('#province');

    [...new Set(cities.concat(stations).map(f => f.properties.province))].sort()
      .forEach(p => sel.add(new Option(p, p)));
    cities.map(f => f.properties.name).sort()
      .forEach(n => { const o = document.createElement('option'); o.value = n; $('#cityList').appendChild(o); });

    // Analysis: nearest feature from a list, calculated in the browser
    function nearest(f, list) {
      const a = L.latLng(ll(f)); let best = null, d = Infinity;
      list.forEach(x => { const k = a.distanceTo(L.latLng(ll(x))) / 1000; if (k < d) { d = k; best = x; } });
      return {f:best, km:d};
    }

    function cityPopup(p) {
      return `<div class="pop"><h3>${p.name}</h3><span class="badge" style="--c:${cityStyle(p.type).c}">City</span>
        <dl><dt>Name</dt><dd>${p.name}</dd><dt>Province</dt><dd>${p.province}</dd><dt>Type</dt><dd>${p.type}</dd></dl></div>`;
    }
    function stationPopup(p) {
      return `<div class="pop"><h3>${p.station_name}</h3><span class="badge" style="--c:${tempColor(p.temperature)}">Weather station</span>
        <dl><dt>Station name</dt><dd>${p.station_name}</dd><dt>Temperature</dt><dd>${p.temperature} °C</dd>
        <dt>Rainfall</dt><dd>${p.rainfall} mm</dd><dt>Province</dt><dd>${p.province}</dd></dl></div>`;
    }
    function cityInfo(f) {
      const p = f.properties, n = nearest(f, stations), sp = n.f.properties;
      return `<h3>${p.name}</h3><span class="tag" style="--c:${cityStyle(p.type).c}">${p.type}</span>
        <ul class="kv"><li><span>Province</span><b>${p.province}</b></li>
        <li><span>Nearest station</span><b>${sp.station_name}</b></li>
        <li><span>Distance</span><b>${n.km.toFixed(0)} km</b></li>
        <li><span>Temperature</span><b>${sp.temperature} °C</b></li>
        <li><span>Rainfall</span><b>${sp.rainfall} mm</b></li></ul>`;
    }
    function stationInfo(f) {
      const p = f.properties, n = nearest(f, cities), cp = n.f.properties;
      return `<h3>${p.station_name}</h3><span class="tag" style="--c:${tempColor(p.temperature)}">Weather station</span>
        <ul class="kv"><li><span>Province</span><b>${p.province}</b></li>
        <li><span>Temperature</span><b>${p.temperature} °C</b></li>
        <li><span>Rainfall</span><b>${p.rainfall} mm</b></li>
        <li><span>Nearest city</span><b>${cp.name}</b></li>
        <li><span>Distance</span><b>${n.km.toFixed(0)} km</b></li></ul>`;
    }

    function render(prov) {
      cityLayer.clearLayers(); stationLayer.clearLayers();
      Object.keys(cityMarkers).forEach(k => delete cityMarkers[k]);
      const pts = []; let nc = 0, ns = 0, sum = 0;

      cities.filter(f => !prov || f.properties.province === prov).forEach(f => {
        const p = f.properties, st = cityStyle(p.type), box = st.s + 6;
        const icon = L.divIcon({className:'mk', html:`<span class="dot" style="--c:${st.c};--s:${st.s}px"></span>`, iconSize:[box, box], iconAnchor:[box / 2, box / 2], popupAnchor:[0, -box / 2]});
        cityMarkers[p.name] = L.marker(ll(f), {icon, title:p.name}).bindPopup(cityPopup(p), {maxWidth:260})
          .bindTooltip(p.name, {permanent:true, direction:'right', offset:[st.s / 2 + 3, 0], className:'lbl'})
          .on('click', () => showInfo(cityInfo(f))).addTo(cityLayer);
        pts.push(ll(f)); nc++;
      });

      stations.filter(f => !prov || f.properties.province === prov).forEach(f => {
        const p = f.properties;
        // the diamond sits slightly to the side so it never hides the city dot
        const icon = L.divIcon({className:'mk', html:`<span class="dia" style="--c:${tempColor(p.temperature)}"></span>`, iconSize:[22, 22], iconAnchor:[-1, 11], popupAnchor:[10, -10]});
        L.marker(ll(f), {icon, title:`${p.station_name}: ${p.temperature} °C`}).bindPopup(stationPopup(p), {maxWidth:260})
          .on('click', () => showInfo(stationInfo(f))).addTo(stationLayer);
        pts.push(ll(f)); ns++; sum += p.temperature;
      });

      $('#nCities').textContent = nc;
      $('#nStations').textContent = ns;
      $('#avgTemp').textContent = ns ? (sum / ns).toFixed(1) + ' °C' : 'n/a';
      return pts;
    }

    function applyFilter() {
      const pts = render(sel.value);
      showInfo(INFO_DEFAULT);
      if (sel.value && pts.length) map.flyToBounds(L.latLngBounds(pts).pad(.5), {maxZoom:9});
      else map.flyToBounds(BOUNDS, {padding:[24, 24]});
    }
    sel.onchange = applyFilter;

    $('#reset').onclick = () => { sel.value = ''; $('#search').value = ''; $('#hint').textContent = ''; map.closePopup(); applyFilter(); };

    // Search a city
    function findCity() {
      const q = $('#search').value.trim().toLowerCase();
      const f = cities.find(c => c.properties.name.toLowerCase() === q) || (q && cities.find(c => c.properties.name.toLowerCase().startsWith(q)));
      if (!f) { $('#hint').textContent = q ? 'No city found with that name.' : 'Type a city name first.'; return; }
      $('#hint').textContent = '';
      if (sel.value && sel.value !== f.properties.province) { sel.value = ''; render(''); }
      if (!map.hasLayer(cityLayer)) cityLayer.addTo(map);
      $('#panel').classList.remove('open');
      map.flyTo(ll(f), 9);
      map.once('moveend', () => { const m = cityMarkers[f.properties.name]; if (m) m.fire('click'); });
    }
    $('#searchForm').onsubmit = e => { e.preventDefault(); findCity(); };
    $('#search').oninput = e => { if (cities.some(c => c.properties.name.toLowerCase() === e.target.value.trim().toLowerCase())) findCity(); };

    render('');
  }
})();