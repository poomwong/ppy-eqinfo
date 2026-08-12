const statusEl = document.getElementById("status");
const dbStatusEl = document.getElementById("db-status");
const daysSelect = document.getElementById("days-select");
const refreshBtn = document.getElementById("refresh-btn");
const connectExistingBtn = document.getElementById("db-connect-existing");
const connectNewBtn = document.getElementById("db-connect-new");
const tabListBtn = document.getElementById("tab-list");
const tabDetailBtn = document.getElementById("tab-detail");
const listSection = document.getElementById("list-section-wrap");
const detailSection = document.getElementById("detail-section");

// The network sync (page load / "Refresh All") always pulls the widest
// available window, regardless of which range is selected in the dropdown -
// that way switching the dropdown is a pure local DB query with zero USGS
// calls, and the cache always has a full year on hand to filter into.
const SYNC_DAYS = 365;
const DETAIL_FETCH_CONCURRENCY = 4;

let dbReady = false;
let selectedId = null;
let currentQuakes = [];

function setDbStatus(msg) {
  dbStatusEl.textContent = msg;
}

function setControlsEnabled(enabled) {
  refreshBtn.disabled = !enabled;
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
  const days = Number(daysSelect.value);
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  currentQuakes = EqDb.getEarthquakes(sinceMs);
  EqUi.renderTable(currentQuakes, (id) => selectQuake(id));
  EqMap.renderMap(currentQuakes, (id) => selectQuake(id));

  if (selectedId) {
    const stillThere = currentQuakes.find((q) => q.id === selectedId);
    if (stillThere) {
      EqUi.renderDetail(stillThere, EqDb.getDetail(selectedId));
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

  EqUi.renderDetail(quake, EqDb.getDetail(id));
  wireDetailRefreshButton();
}

function wireDetailRefreshButton() {
  const btn = document.getElementById("detail-refresh-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (selectedId) refreshSingleDetail(selectedId);
  });
}

// The one exception to "no fetching outside load/Refresh All": an explicit,
// deliberate click on a specific earthquake's own refresh button.
async function refreshSingleDetail(id) {
  const quake = currentQuakes.find((q) => q.id === id);
  if (!quake) return;
  document.getElementById("detail-refresh-btn")?.setAttribute("disabled", "true");
  setDbStatus("Refetching earthquake detail...");
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
    EqUi.renderDetail(quake, EqDb.getDetail(id));
    wireDetailRefreshButton();
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
// it (missing, or stamped with an older detail_schema_version), so Shindo/
// MMI/PGA are already sitting in the DB by the time anyone clicks a row -
// no more "click to compute" lazy fetch.
async function syncAllDetails(rows, { force = false } = {}) {
  const toFetch = force ? rows : rows.filter((r) => EqDb.needsDetailRefresh(EqDb.getDetail(r.id)));
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
  statusEl.textContent = force ? "Refreshing earthquake list..." : "Checking for new earthquakes...";

  try {
    const fetched = await UsgsApi.fetchSummary(SYNC_DAYS);
    const existingIds = new Set(EqDb.getEarthquakes(0).map((e) => e.id));
    let inserted = 0;
    let updated = 0;
    for (const q of fetched) {
      const existedBefore = existingIds.has(q.id);
      const changed = await EqDb.upsertEarthquake(q, { force, skipPersist: true });
      if (changed && !existedBefore) inserted++;
      else if (changed) updated++;
    }
    if (inserted + updated > 0) await EqDb.persist();

    renderFromDb();
    statusEl.textContent = `${currentQuakes.length} earthquake(s) in view (+${inserted} new, ${updated} updated) - fetching details...`;

    const sinceSyncMs = Date.now() - SYNC_DAYS * 24 * 60 * 60 * 1000;
    const allRows = EqDb.getEarthquakes(sinceSyncMs);
    await syncAllDetails(allRows, { force });

    renderFromDb();
    statusEl.textContent = `${currentQuakes.length} earthquake(s) in view (+${inserted} new, ${updated} updated). Details up to date.`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    console.error(err);
  } finally {
    setControlsEnabled(true);
  }
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
      const { name } = await EqDb.connectExisting();
      dbReady = true;
      setDbStatus(`Connected: ${name}`);
      await fullSync();
    } catch (err) {
      if (err.name !== "AbortError") setDbStatus(`Connection failed: ${err.message}`);
    }
  });

  connectNewBtn.addEventListener("click", async () => {
    try {
      const { name } = await EqDb.connectNew();
      dbReady = true;
      setDbStatus(`Connected: ${name}`);
      await fullSync();
    } catch (err) {
      if (err.name !== "AbortError") setDbStatus(`Connection failed: ${err.message}`);
    }
  });

  try {
    const reconnected = await EqDb.reconnectSaved();
    if (reconnected) {
      dbReady = true;
      setDbStatus(`Connected: ${reconnected.name}`);
      await fullSync();
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

refreshBtn.addEventListener("click", () => fullSync({ force: true }));
daysSelect.addEventListener("change", () => renderFromDb());
tabListBtn.addEventListener("click", () => switchTab("list"));
tabDetailBtn.addEventListener("click", () => switchTab("detail"));
