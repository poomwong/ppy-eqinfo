// Leaflet map: markers with a popup-first flow (click shows the popup;
// the popup's own "View Details" link opens the in-app detail tab).

let map;
let markersLayer;

// Zoom level 2 shows the whole globe at once - kept as the initial view and
// as the lower zoom bound (nothing useful below "whole world"), but zooming
// in is now allowed so individual clusters of nearby markers can be told
// apart.
const FIXED_ZOOM = 2;

function initMap() {
  map = L.map("map", {
    worldCopyJump: true,
    minZoom: FIXED_ZOOM,
    maxZoom: 10,
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

// Quakes within the caller-supplied highlight window keep the usual accent
// color; older ones (but still within the displayed day range) fade to gray
// so the map reads at a glance as "what's currently active" rather than an
// undifferentiated pile of every event in the loaded time range. The window
// itself tracks the range preset selected in the UI (see RANGE_PRESETS in
// main.js), not a fixed constant.
function markerColor(timeMs, highlightMs) {
  return Date.now() - timeMs > highlightMs ? STALE_COLOR : RECENT_COLOR;
}

function renderMap(quakes, onSelect, highlightMs) {
  markersLayer.clearLayers();
  quakes.forEach((q) => {
    const color = markerColor(q.time, highlightMs);
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
