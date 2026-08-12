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

async function selectQuake(id, { forceRefreshDetail = false } = {}) {
  selectedId = id;
  const quake = currentQuakes.find((q) => q.id === id);
  if (!quake) return;

  tabDetailBtn.disabled = false;
  tabDetailBtn.textContent = quake.place ? `Details: ${quake.place}` : "Details";
  switchTab("detail");

  let detail = EqDb.getDetail(id);
  if (EqDb.needsDetailRefresh(detail) || forceRefreshDetail) {
    EqUi.renderDetail(quake, detail);
    document.getElementById("detail-refresh-btn")?.setAttribute("disabled", "true");
    setDbStatus(forceRefreshDetail ? "Refetching earthquake detail..." : "Fetching earthquake detail...");
    try {
      const fetched = await UsgsApi.fetchDetail(quake.detail_url || quake.id);
      await EqDb.upsertDetail(id, fetched);
      detail = EqDb.getDetail(id);
      setDbStatus("Ready");
      refreshRowJoinFields(id, detail);
    } catch (err) {
      setDbStatus(`Error fetching detail: ${err.message}`);
      console.error(err);
    }
  }
  EqUi.renderDetail(quake, detail);
  wireDetailRefreshButton();
}

// Keep the List/Map view's Shindo column in sync right after a detail fetch,
// without waiting for the next full loadEarthquakes() cycle.
function refreshRowJoinFields(id, detail) {
  const row = currentQuakes.find((q) => q.id === id);
  if (!row) return;
  row.d_has_shakemap = detail?.has_shakemap ?? 0;
  row.d_sm_max_pga_onland = detail?.sm_max_pga_onland ?? null;
  row.d_sm_max_mmi = detail?.sm_max_mmi ?? null;
  EqUi.renderTable(currentQuakes, (qid) => selectQuake(qid));
  EqMap.renderMap(currentQuakes, (qid) => selectQuake(qid));
}

function wireDetailRefreshButton() {
  const btn = document.getElementById("detail-refresh-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (selectedId) selectQuake(selectedId, { forceRefreshDetail: true });
  });
}

async function loadEarthquakes({ force = false } = {}) {
  if (!dbReady) return;
  const days = Number(daysSelect.value);
  statusEl.textContent = force ? "Refreshing all..." : "Checking for new earthquakes...";
  setControlsEnabled(false);

  try {
    const fetched = await UsgsApi.fetchSummary(days);
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

    const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
    currentQuakes = EqDb.getEarthquakes(sinceMs);
    EqUi.renderTable(currentQuakes, (id) => selectQuake(id));
    EqMap.renderMap(currentQuakes, (id) => selectQuake(id));

    statusEl.textContent = `${currentQuakes.length} earthquake(s) in view (+${inserted} new, ${updated} updated)`;

    if (selectedId) {
      const stillThere = currentQuakes.find((q) => q.id === selectedId);
      if (stillThere) {
        const detail = EqDb.getDetail(selectedId);
        EqUi.renderDetail(stillThere, detail);
      }
    }
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
      await loadEarthquakes();
    } catch (err) {
      if (err.name !== "AbortError") setDbStatus(`Connection failed: ${err.message}`);
    }
  });

  connectNewBtn.addEventListener("click", async () => {
    try {
      const { name } = await EqDb.connectNew();
      dbReady = true;
      setDbStatus(`Connected: ${name}`);
      await loadEarthquakes();
    } catch (err) {
      if (err.name !== "AbortError") setDbStatus(`Connection failed: ${err.message}`);
    }
  });

  try {
    const reconnected = await EqDb.reconnectSaved();
    if (reconnected) {
      dbReady = true;
      setDbStatus(`Connected: ${reconnected.name}`);
      await loadEarthquakes();
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

refreshBtn.addEventListener("click", () => loadEarthquakes({ force: true }));
daysSelect.addEventListener("change", () => loadEarthquakes());
tabListBtn.addEventListener("click", () => switchTab("list"));
tabDetailBtn.addEventListener("click", () => switchTab("detail"));
