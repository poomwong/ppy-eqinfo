const MIN_MAGNITUDE = 6.0;
const USGS_ENDPOINT = "https://earthquake.usgs.gov/fdsnws/event/1/query";

const statusEl = document.getElementById("status");
const daysSelect = document.getElementById("days-select");
const refreshBtn = document.getElementById("refresh-btn");
const tableBody = document.getElementById("eq-table-body");

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

function buildQueryUrl(days) {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    format: "geojson",
    starttime: startTime.toISOString(),
    endtime: endTime.toISOString(),
    minmagnitude: String(MIN_MAGNITUDE),
    orderby: "time",
  });
  return `${USGS_ENDPOINT}?${params.toString()}`;
}

function formatDateTime(ms) {
  const d = new Date(ms);
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function markerRadius(mag) {
  return Math.max(4, (mag - MIN_MAGNITUDE + 1) * 4);
}

function renderMap(quakes) {
  markersLayer.clearLayers();
  quakes.forEach((q) => {
    const [lon, lat] = q.geometry.coordinates;
    const mag = q.properties.mag;
    const marker = L.circleMarker([lat, lon], {
      radius: markerRadius(mag),
      color: "#ff6b4a",
      weight: 1,
      fillColor: "#ff6b4a",
      fillOpacity: 0.5,
    });
    marker.bindPopup(
      `<strong>M ${mag.toFixed(1)}</strong> &mdash; ${q.properties.place}<br>${formatDateTime(q.properties.time)}`
    );
    marker.addTo(markersLayer);
  });
}

function renderTable(quakes) {
  tableBody.innerHTML = "";
  quakes.forEach((q) => {
    const [lon, lat] = q.geometry.coordinates;
    const mag = q.properties.mag;
    const tr = document.createElement("tr");

    const magClass = mag >= 7.0 ? "mag-cell mag-high" : "mag-cell";

    tr.innerHTML = `
      <td>${formatDateTime(q.properties.time)}</td>
      <td>${lat.toFixed(3)}, ${lon.toFixed(3)}</td>
      <td class="${magClass}">${mag.toFixed(1)}</td>
      <td>${q.properties.place ?? "Unknown"}</td>
      <td><a href="${q.properties.url}" target="_blank" rel="noopener">USGS &rarr;</a></td>
    `;
    tableBody.appendChild(tr);
  });
}

async function loadEarthquakes() {
  const days = Number(daysSelect.value);
  statusEl.textContent = "Loading...";
  refreshBtn.disabled = true;

  try {
    const url = buildQueryUrl(days);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`USGS request failed: ${res.status}`);
    }
    const data = await res.json();
    const quakes = data.features.sort((a, b) => b.properties.time - a.properties.time);

    renderTable(quakes);
    renderMap(quakes);

    statusEl.textContent = `${quakes.length} earthquake(s) found`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    console.error(err);
  } finally {
    refreshBtn.disabled = false;
  }
}

initMap();
loadEarthquakes();

refreshBtn.addEventListener("click", loadEarthquakes);
daysSelect.addEventListener("change", loadEarthquakes);
