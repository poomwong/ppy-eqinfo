const statusEl = document.getElementById("status");
const dbStatusEl = document.getElementById("db-status");
const daysSelect = document.getElementById("days-select");
const fetchNewBtn = document.getElementById("fetch-new-btn");
const refetchAllBtn = document.getElementById("refetch-all-btn");
const timeToggleBtn = document.getElementById("time-toggle-btn");
const timeColLabel = document.getElementById("time-col-label");
const connectExistingBtn = document.getElementById("db-connect-existing");
const connectNewBtn = document.getElementById("db-connect-new");
const reconnectBtn = document.getElementById("db-reconnect");
const tabListBtn = document.getElementById("tab-list");
const tabDetailBtn = document.getElementById("tab-detail");
const lookupInput = document.getElementById("lookup-input");
const lookupBtn = document.getElementById("lookup-btn");
const lookupStatusEl = document.getElementById("lookup-status");
const listSection = document.getElementById("list-section-wrap");
const detailSection = document.getElementById("detail-section");
const locationToggleBtn = document.getElementById("location-toggle-btn");
const locationPopup = document.getElementById("location-popup");
const locationLatInput = document.getElementById("location-lat");
const locationLonInput = document.getElementById("location-lon");
const locationAmplifyInput = document.getElementById("location-amplify");
const locationApplyBtn = document.getElementById("location-apply-btn");

const LOCATION_COOKIE = "eqinfo_location";
const BANGKOK_DEFAULT_LOCATION = { lat: 13.7563, lon: 100.5018, amplify: false };

function readCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}`;
}

function loadTargetLocation() {
  const raw = readCookie(LOCATION_COOKIE);
  if (!raw) return { ...BANGKOK_DEFAULT_LOCATION };
  try {
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)) {
      return { lat: parsed.lat, lon: parsed.lon, amplify: !!parsed.amplify };
    }
  } catch {
    // fall through to default
  }
  return { ...BANGKOK_DEFAULT_LOCATION };
}

function saveTargetLocation() {
  writeCookie(LOCATION_COOKIE, JSON.stringify(targetLocation), 365);
}

// Target location for the local MMI / long-period estimate, remembered
// across sessions via a cookie (like the time-display mode) so it doesn't
// need re-entering every time the page opens.
let targetLocation = loadTargetLocation();

// The network sync (page load / "Refresh All") always pulls the widest
// available window, regardless of which range is selected in the dropdown -
// that way switching the dropdown is a pure local DB query with zero USGS
// calls, and the cache always has a full year on hand to filter into.
const SYNC_DAYS = 365;
const DETAIL_FETCH_CONCURRENCY = 4;

let dbReady = false;
let selectedId = null;
let currentQuakes = [];

// Table sort state. Deliberately just an in-memory variable, not persisted
// anywhere - resets to the default (most recent first) on every page load,
// as requested, while still surviving re-renders within the same session
// (Fetch New, day-range changes, etc.).
const ALERT_RANK = { green: 1, yellow: 2, orange: 3, red: 4 };
let sortColumn = "time";
let sortDirection = "desc";

function sortValue(q, column) {
  switch (column) {
    case "time":
      return q.time ?? null;
    case "mag":
      return q.mag ?? null;
    case "mmi":
      return q.d_sm_max_mmi ?? null;
    case "shindo": {
      const picked = q.d_has_shakemap ? Shindo.primaryOnlandPga(q) : null;
      const shindo = picked ? Shindo.computeShindoFromPgaG(picked.pgaG) : null;
      return shindo ? shindo.intensity : null;
    }
    case "alert":
      return ALERT_RANK[q.alert] ?? null;
    case "tsunami":
      return q.tsunami ? 1 : 0;
    default:
      return null;
  }
}

// Missing values always sort to the end, regardless of direction - flipping
// their position on every direction toggle would be confusing.
function compareQuakes(a, b) {
  const av = sortValue(a, sortColumn);
  const bv = sortValue(b, sortColumn);
  const aNull = av === null || av === undefined;
  const bNull = bv === null || bv === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  return sortDirection === "asc" ? av - bv : bv - av;
}

function sortCurrentQuakes() {
  currentQuakes.sort(compareQuakes);
}

function updateSortIndicators() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    const indicator = th.querySelector(".sort-indicator");
    if (!indicator) return;
    indicator.textContent = th.dataset.sort === sortColumn ? (sortDirection === "asc" ? "▲" : "▼") : "";
  });
}

function wireSortHeaders() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const column = th.dataset.sort;
      if (sortColumn === column) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
      } else {
        sortColumn = column;
        sortDirection = "desc";
      }
      sortCurrentQuakes();
      updateSortIndicators();
      EqUi.renderTable(currentQuakes, (id) => selectQuake(id), targetLocation);
    });
  });
}

function setDbStatus(msg) {
  dbStatusEl.textContent = msg;
}

function setControlsEnabled(enabled) {
  fetchNewBtn.disabled = !enabled;
  refetchAllBtn.disabled = !enabled;
  daysSelect.disabled = !enabled;
}

function switchTab(tab) {
  const showDetail = tab === "detail";
  listSection.classList.toggle("hidden", showDetail);
  detailSection.classList.toggle("hidden", !showDetail);
  tabListBtn.classList.toggle("active", !showDetail);
  tabDetailBtn.classList.toggle("active", showDetail);
}

// Pure local render: re-query the already-cached SQLite data for the
// currently selected day range and redraw the list/map/detail panel.
// Never touches the network.
function renderFromDb() {
  const sinceMs = daysSelect.value === "all" ? 0 : Date.now() - Number(daysSelect.value) * 24 * 60 * 60 * 1000;
  currentQuakes = EqDb.getEarthquakes(sinceMs);
  sortCurrentQuakes();
  updateSortIndicators();
  EqUi.renderTable(currentQuakes, (id) => selectQuake(id), targetLocation);
  EqMap.renderMap(currentQuakes, (id) => selectQuake(id));

  if (selectedId) {
    const stillThere = currentQuakes.find((q) => q.id === selectedId);
    if (stillThere) {
      EqUi.renderDetail(stillThere, EqDb.getDetail(selectedId), targetLocation);
    }
  }
}

function selectQuake(id) {
  selectedId = id;
  const quake = currentQuakes.find((q) => q.id === id);
  if (!quake) return;

  tabDetailBtn.disabled = false;
  tabDetailBtn.textContent = quake.place ? `Details: ${quake.place}` : "Details";
  switchTab("detail");

  EqUi.renderDetail(quake, EqDb.getDetail(id), targetLocation);
  wireDetailRefreshButton();
}

function wireDetailRefreshButton() {
  const btn = document.getElementById("detail-refresh-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (selectedId) refetchSingleDetail(selectedId);
  });
}

// The one exception to "no fetching outside Fetch New/Re-fetch All": an
// explicit, deliberate click on a specific earthquake's own refetch button.
async function refetchSingleDetail(id) {
  const quake = currentQuakes.find((q) => q.id === id);
  if (!quake) return;
  document.getElementById("detail-refresh-btn")?.setAttribute("disabled", "true");
  setDbStatus("Re-fetching earthquake detail...");
  try {
    const fetched = await UsgsApi.fetchDetail(quake.detail_url || quake.id);
    await EqDb.upsertDetail(id, fetched);
    setDbStatus("Ready");
    renderFromDb();
  } catch (err) {
    setDbStatus(`Error fetching detail: ${err.message}`);
    console.error(err);
  }
  if (selectedId === id) {
    EqUi.renderDetail(quake, EqDb.getDetail(id), targetLocation);
    wireDetailRefreshButton();
  }
}

// Looks up one specific earthquake by USGS event ID and saves it through the
// normal flow (upsertEarthquake + fetchDetail/upsertDetail), regardless of
// magnitude or age - this is how events older than SYNC_DAYS (or below the
// M6.0 summary-feed filter) get into the database at all. Fetch New/Re-fetch
// All never touch it again afterward since it falls outside their 365-day
// window; only this lookup (re-entering the same ID) or its own per-event
// "Re-fetch Technical Data" button will ever refresh it.
async function lookupEvent(id) {
  const trimmedId = id.trim();
  if (!trimmedId) return;
  lookupBtn.disabled = true;
  lookupStatusEl.textContent = `Looking up ${trimmedId}...`;
  try {
    const quake = await UsgsApi.fetchEventById(trimmedId);
    await EqDb.upsertEarthquake(quake, { force: true });
    lookupStatusEl.textContent = `Found: ${quake.place ?? trimmedId} (M${quake.mag}). Fetching technical details...`;
    const fetched = await UsgsApi.fetchDetail(quake.detailUrl || quake.id);
    await EqDb.upsertDetail(quake.id, fetched);
    lookupStatusEl.textContent = `Saved: ${quake.place ?? trimmedId}`;
    // Switch to "All time" so the looked-up event is guaranteed visible even
    // if it's older than the currently selected day range.
    daysSelect.value = "all";
    renderFromDb();
    selectQuake(quake.id);
  } catch (err) {
    lookupStatusEl.textContent = `Error: ${err.message}`;
    console.error(err);
  } finally {
    lookupBtn.disabled = false;
  }
}

async function runWithConcurrency(items, limit, worker) {
  let index = 0;
  async function next() {
    while (index < items.length) {
      const item = items[index++];
      try {
        await worker(item);
      } catch (err) {
        console.error(`Detail fetch failed for ${item?.id}:`, err);
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
}

// Fetches and caches moment-tensor/ShakeMap detail for every row that needs
// it, so Shindo/MMI/PGA are already sitting in the DB by the time anyone
// clicks a row - no more "click to compute" lazy fetch. A row needs it when:
// force=true (Re-fetch All - always refetch everything), OR it's brand new /
// USGS revised it since we last saw it (in changedIds), OR it's stamped with
// an older detail_schema_version (this app's own field additions). An
// existing, unchanged earthquake whose detail we already have is left alone
// - that's what keeps Fetch New from flooding USGS on every run.
async function syncAllDetails(rows, { force = false, changedIds = new Set() } = {}) {
  const toFetch = force
    ? rows
    : rows.filter((r) => changedIds.has(r.id) || EqDb.needsDetailRefresh(EqDb.getDetail(r.id)));
  if (toFetch.length === 0) return;

  let done = 0;
  statusEl.textContent = `Fetching technical details: 0/${toFetch.length}...`;

  await runWithConcurrency(toFetch, DETAIL_FETCH_CONCURRENCY, async (row) => {
    try {
      const fetched = await UsgsApi.fetchDetail(row.detail_url || row.id);
      await EqDb.upsertDetail(row.id, fetched, { skipPersist: true });
    } finally {
      done++;
      statusEl.textContent = `Fetching technical details: ${done}/${toFetch.length}...`;
    }
  });

  await EqDb.persist();
}

async function fullSync({ force = false } = {}) {
  if (!dbReady) return;
  setControlsEnabled(false);
  statusEl.textContent = force ? "Re-fetching earthquake list..." : "Checking for new/updated earthquakes...";

  try {
    const fetched = await UsgsApi.fetchSummary(SYNC_DAYS);
    const existingIds = new Set(EqDb.getEarthquakes(0).map((e) => e.id));
    const changedIds = new Set();
    let inserted = 0;
    let updated = 0;
    for (const q of fetched) {
      const existedBefore = existingIds.has(q.id);
      const changed = await EqDb.upsertEarthquake(q, { force, skipPersist: true });
      if (changed) {
        changedIds.add(q.id);
        if (existedBefore) updated++;
        else inserted++;
      }
    }
    if (inserted + updated > 0) await EqDb.persist();

    renderFromDb();
    statusEl.textContent = `${currentQuakes.length} earthquake(s) in view (+${inserted} new, ${updated} updated) - fetching details...`;

    const sinceSyncMs = Date.now() - SYNC_DAYS * 24 * 60 * 60 * 1000;
    const allRows = EqDb.getEarthquakes(sinceSyncMs);
    await syncAllDetails(allRows, { force, changedIds });

    renderFromDb();
    statusEl.textContent = `${currentQuakes.length} earthquake(s) in view (+${inserted} new, ${updated} updated). Details up to date.`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    console.error(err);
  } finally {
    setControlsEnabled(true);
  }
}

async function connectAndSync(connectFn) {
  const { name } = await connectFn();
  dbReady = true;
  setDbStatus(`Connected: ${name}`);
  reconnectBtn.classList.add("hidden");
  await fullSync();
}

async function initDbUi() {
  if (!EqDb.isSupported()) {
    setDbStatus(
      "This browser does not support the File System Access API needed to read/write a local .sqlite file. Please use Chrome or Edge."
    );
    connectExistingBtn.disabled = true;
    connectNewBtn.disabled = true;
    return;
  }

  connectExistingBtn.addEventListener("click", async () => {
    try {
      await connectAndSync(EqDb.connectExisting);
    } catch (err) {
      if (err.name !== "AbortError") setDbStatus(`Connection failed: ${err.message}`);
    }
  });

  connectNewBtn.addEventListener("click", async () => {
    try {
      await connectAndSync(EqDb.connectNew);
    } catch (err) {
      if (err.name !== "AbortError") setDbStatus(`Connection failed: ${err.message}`);
    }
  });

  try {
    const result = await EqDb.reconnectSaved();
    if (result.status === "connected") {
      dbReady = true;
      setDbStatus(`Connected: ${result.name}`);
      await fullSync();
    } else if (result.status === "needs-permission") {
      setDbStatus("Found a previously connected database - click Reconnect to resume (no file picker needed).");
      reconnectBtn.classList.remove("hidden");
      reconnectBtn.addEventListener("click", async () => {
        try {
          await connectAndSync(() => EqDb.reconnectWithPermission(result.handle));
        } catch (err) {
          if (err.name !== "AbortError") setDbStatus(`Reconnect failed: ${err.message}`);
        }
      });
    } else {
      setDbStatus("Not connected. Choose or create eqinfo.sqlite to begin.");
    }
  } catch (err) {
    setDbStatus("Not connected. Choose or create eqinfo.sqlite to begin.");
  }
}

EqMap.initMap();
setControlsEnabled(false);
initDbUi();

fetchNewBtn.addEventListener("click", () => fullSync({ force: false }));
refetchAllBtn.addEventListener("click", () => fullSync({ force: true }));
daysSelect.addEventListener("change", () => renderFromDb());
tabListBtn.addEventListener("click", () => switchTab("list"));
tabDetailBtn.addEventListener("click", () => switchTab("detail"));
wireSortHeaders();
updateSortIndicators();

function updateTimeToggleUi() {
  const mode = TimeFormat.getMode();
  timeToggleBtn.textContent = mode === "utc" ? "Time: UTC" : "Time: Local";
  timeColLabel.textContent = mode === "utc" ? "Date & Time (UTC)" : "Date & Time (Local)";
}
timeToggleBtn.addEventListener("click", () => {
  TimeFormat.toggle();
  updateTimeToggleUi();
  renderFromDb();
});
updateTimeToggleUi();

lookupBtn.addEventListener("click", () => lookupEvent(lookupInput.value));
lookupInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") lookupEvent(lookupInput.value);
});

function updateLocationToggleLabel() {
  const isBangkokDefault =
    targetLocation.lat === BANGKOK_DEFAULT_LOCATION.lat && targetLocation.lon === BANGKOK_DEFAULT_LOCATION.lon;
  locationToggleBtn.textContent = isBangkokDefault
    ? "Location: Bangkok"
    : `Location: ${targetLocation.lat.toFixed(2)}, ${targetLocation.lon.toFixed(2)}`;
}

locationToggleBtn.addEventListener("click", () => {
  locationPopup.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (!locationPopup.classList.contains("hidden") && !e.target.closest("#location-control")) {
    locationPopup.classList.add("hidden");
  }
});

locationApplyBtn.addEventListener("click", () => {
  const lat = Number(locationLatInput.value);
  const lon = Number(locationLonInput.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  targetLocation = { lat, lon, amplify: locationAmplifyInput.checked };
  saveTargetLocation();
  updateLocationToggleLabel();
  locationPopup.classList.add("hidden");
  renderFromDb();
});

// Reflect the cookie-restored (or default) location into the popup's inputs
// so re-opening it shows what's actually active, not the HTML's hardcoded
// starting values.
locationLatInput.value = targetLocation.lat;
locationLonInput.value = targetLocation.lon;
locationAmplifyInput.checked = targetLocation.amplify;
updateLocationToggleLabel();
