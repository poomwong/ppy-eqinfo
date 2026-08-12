let map;
let markersLayer;

function initMap() {
  map = L.map("map", { worldCopyJump: true }).setView([15, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 10,
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function markerRadius(mag) {
  return Math.max(4, (mag - UsgsApi.MIN_MAGNITUDE + 1) * 4);
}

function renderMap(quakes, onSelect) {
  markersLayer.clearLayers();
  quakes.forEach((q) => {
    const marker = L.circleMarker([q.latitude, q.longitude], {
      radius: markerRadius(q.mag),
      color: "#ff6b4a",
      weight: 1,
      fillColor: "#ff6b4a",
      fillOpacity: 0.5,
    });
    marker.bindPopup(
      `<strong>M ${q.mag.toFixed(1)}</strong> &mdash; ${q.place}<br>${new Date(q.time).toISOString()}`
    );
    marker.on("click", () => onSelect(q.id));
    marker.addTo(markersLayer);
  });
}

window.EqMap = { initMap, renderMap };
