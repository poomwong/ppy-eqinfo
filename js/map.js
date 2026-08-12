// Leaflet map: markers with a popup-first flow (click shows the popup;
// the popup's own "View Details" link opens the in-app detail tab).

let map;
let markersLayer;

// Fixed zoom level 2 already shows the entire globe, so zooming in/out only
// adds confusion (and lets the map drift out of sync with the always-global
// table/search below it) without adding any real information - locked to a
// single zoom level via minZoom === maxZoom, with every zoom-triggering
// interaction disabled. Panning/dragging is left on so overlapping markers
// near the edges are still reachable.
const FIXED_ZOOM = 2;

function initMap() {
  map = L.map("map", {
    worldCopyJump: true,
    zoomControl: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false,
    minZoom: FIXED_ZOOM,
    maxZoom: FIXED_ZOOM,
  }).setView([15, 0], FIXED_ZOOM);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 10,
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function markerRadius(mag) {
  return Math.max(4, (mag - UsgsApi.MIN_MAGNITUDE + 1) * 4);
}

const RECENT_COLOR = "#ff6b4a";
const STALE_COLOR = "#9aa4b2";
const STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Recent (<=7 days old) quakes keep the usual accent color; older ones fade
// to gray so the map reads at a glance as "what's currently active" rather
// than an undifferentiated pile of every event in the loaded time range.
function markerColor(timeMs) {
  return Date.now() - timeMs > STALE_AGE_MS ? STALE_COLOR : RECENT_COLOR;
}

function renderMap(quakes, onSelect) {
  markersLayer.clearLayers();
  quakes.forEach((q) => {
    const color = markerColor(q.time);
    const marker = L.circleMarker([q.latitude, q.longitude], {
      radius: markerRadius(q.mag),
      color,
      weight: 1,
      fillColor: color,
      fillOpacity: 0.5,
    });
    marker.bindPopup(
      `<div class="map-popup">
         <strong>M ${q.mag.toFixed(1)}</strong> &mdash; ${q.place}<br>
         ${TimeFormat.format(q.time)}<br>
         <a href="#" class="popup-view-details">View Details &rarr;</a>
       </div>`
    );
    marker.on("popupopen", (e) => {
      const link = e.popup.getElement()?.querySelector(".popup-view-details");
      if (!link) return;
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        onSelect(q.id);
      });
    });
    marker.addTo(markersLayer);
  });
}

window.EqMap = { initMap, renderMap };
