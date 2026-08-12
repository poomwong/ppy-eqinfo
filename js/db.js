// SQLite (via sql.js/WASM) persistence layer, backed by a local .sqlite
// file connected through the File System Access API. Owns the schema,
// migrations, and all CRUD - main.js is the only caller.

const DB_FILENAME_SUGGESTION = "eqinfo.sqlite";
const SQLJS_CDN_BASE = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS earthquakes (
  id TEXT PRIMARY KEY,
  time INTEGER,
  updated INTEGER,
  latitude REAL,
  longitude REAL,
  depth REAL,
  mag REAL,
  mag_type TEXT,
  place TEXT,
  url TEXT,
  detail_url TEXT,
  status TEXT,
  tsunami INTEGER,
  sig INTEGER,
  alert TEXT,
  net TEXT,
  code TEXT,
  raw_json TEXT,
  fetched_at INTEGER
);

CREATE TABLE IF NOT EXISTS earthquake_details (
  id TEXT PRIMARY KEY REFERENCES earthquakes(id),
  has_moment_tensor INTEGER DEFAULT 0,
  mt_np1_strike REAL, mt_np1_dip REAL, mt_np1_rake REAL,
  mt_np2_strike REAL, mt_np2_dip REAL, mt_np2_rake REAL,
  mt_scalar_moment REAL,
  mt_percent_double_couple REAL,
  mt_derived_magnitude REAL,
  mt_derived_depth REAL,
  mt_tensor_mrr REAL, mt_tensor_mtt REAL, mt_tensor_mpp REAL,
  mt_tensor_mrt REAL, mt_tensor_mrp REAL, mt_tensor_mtp REAL,
  mt_beachball_source TEXT,
  mt_sourcetime_duration REAL,
  mt_sourcetime_risetime REAL,
  mt_sourcetime_decaytime REAL,
  mt_sourcetime_type TEXT,
  mt_raw_json TEXT,
  has_shakemap INTEGER DEFAULT 0,
  sm_latitude REAL,
  sm_longitude REAL,
  sm_max_mmi REAL,
  sm_max_pga REAL,
  sm_max_pga_onland REAL,
  sm_onland_station_count INTEGER,
  sm_max_pga_onland_dyfi REAL,
  sm_onland_dyfi_station_count INTEGER,
  sm_max_pgv REAL,
  sm_version INTEGER,
  sm_map_status TEXT,
  sm_intensity_image_url TEXT,
  sm_raw_json TEXT,
  detail_fetched_at INTEGER,
  detail_schema_version INTEGER DEFAULT 0
);
`;

// Bump this whenever fields are added to (or their meaning changes in) what
// fetchDetail()/upsertDetail() populate. A cached row stamped with an older
// version is treated as stale and silently re-fetched next time it's opened
// - otherwise a row fetched before a field existed (e.g. on-land PGA,
// rupture duration) would sit there forever showing blanks for that field,
// since "a detail row already exists" alone was previously enough to skip
// re-fetching it.
//
// sm_max_pga_onland / sm_onland_station_count are the "official" (real
// seismic instrument, non-DYFI) on-land PGA - version 3 changed their
// meaning from "all on-land observations" to "official only" and added the
// separate sm_max_pga_onland_dyfi columns, so existing rows must re-fetch.
//
// Version 4 added sm_latitude/sm_longitude (the ShakeMap product's own
// reference point, not necessarily identical to the origin location) and
// switched moment-tensor/shakemap product selection to preferredWeight
// (USGS's own "which submission is canonical" signal) instead of always
// taking array index 0.
const CURRENT_DETAIL_SCHEMA_VERSION = 4;

// earthquake_details columns added after the initial release; applied to
// already-existing local .sqlite files since CREATE TABLE IF NOT EXISTS
// is a no-op once the table exists.
const DETAIL_COLUMN_MIGRATIONS = {
  mt_sourcetime_duration: "REAL",
  mt_sourcetime_risetime: "REAL",
  mt_sourcetime_decaytime: "REAL",
  mt_sourcetime_type: "TEXT",
  sm_latitude: "REAL",
  sm_longitude: "REAL",
  sm_max_pga_onland: "REAL",
  sm_onland_station_count: "INTEGER",
  sm_max_pga_onland_dyfi: "REAL",
  sm_onland_dyfi_station_count: "INTEGER",
  detail_schema_version: "INTEGER DEFAULT 0",
};

function migrateDetailsTable() {
  const existingCols = new Set(all("PRAGMA table_info(earthquake_details)").map((r) => r.name));
  for (const [name, type] of Object.entries(DETAIL_COLUMN_MIGRATIONS)) {
    if (!existingCols.has(name)) {
      run(`ALTER TABLE earthquake_details ADD COLUMN ${name} ${type}`);
    }
  }
}

function needsDetailRefresh(detail) {
  if (!detail) return true;
  const version = detail.detail_schema_version ?? 0;
  return version < CURRENT_DETAIL_SCHEMA_VERSION;
}

let SQL = null;
let sqlDb = null;
let fileHandle = null;

async function ensureSqlJs() {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: (file) => SQLJS_CDN_BASE + file });
  }
  return SQL;
}

function isSupported() {
  return typeof window.showOpenFilePicker === "function";
}

async function verifyPermission(handle, readWrite) {
  const opts = readWrite ? { mode: "readwrite" } : {};
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if ((await handle.requestPermission(opts)) === "granted") return true;
  return false;
}

async function loadDatabaseFromHandle(handle) {
  await ensureSqlJs();
  const file = await handle.getFile();
  const buf = await file.arrayBuffer();
  sqlDb = buf.byteLength > 0 ? new SQL.Database(new Uint8Array(buf)) : new SQL.Database();
  sqlDb.run(SCHEMA);
  migrateDetailsTable();
  fileHandle = handle;
  await persist();
  return { name: file.name };
}

async function persist() {
  if (!sqlDb || !fileHandle) return;
  const data = sqlDb.export();
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function connectExisting() {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: "SQLite database", accept: { "application/x-sqlite3": [".sqlite", ".db"] } }],
    excludeAcceptAllOption: false,
    multiple: false,
  });
  if (!(await verifyPermission(handle, true))) throw new Error("Permission denied");
  await window.HandleStore.saveHandle(handle);
  return loadDatabaseFromHandle(handle);
}

async function connectNew() {
  const handle = await window.showSaveFilePicker({
    suggestedName: DB_FILENAME_SUGGESTION,
    types: [{ description: "SQLite database", accept: { "application/x-sqlite3": [".sqlite"] } }],
  });
  if (!(await verifyPermission(handle, true))) throw new Error("Permission denied");
  await window.HandleStore.saveHandle(handle);
  return loadDatabaseFromHandle(handle);
}

// Runs on page load with no user gesture, so it must NEVER call
// requestPermission() - browsers require a user activation for that and
// will just silently refuse (or throw) otherwise. Only queryPermission()
// (which needs no gesture) is safe here. If the browser already remembers
// this handle as granted (which Chrome/Edge normally do across restarts),
// this fully auto-connects with zero clicks. Otherwise it hands back the
// known handle so the UI can offer a single "Reconnect" button - no need to
// re-pick the file via the native dialog, just re-confirm permission.
async function reconnectSaved() {
  const handle = await window.HandleStore.loadHandle();
  if (!handle) return { status: "no-handle" };
  const granted = (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  if (!granted) return { status: "needs-permission", handle };
  const info = await loadDatabaseFromHandle(handle);
  return { status: "connected", name: info.name };
}

// The click-triggered counterpart to the "needs-permission" case above -
// safe to call requestPermission() here since it's in direct response to a
// user gesture.
async function reconnectWithPermission(handle) {
  if (!(await verifyPermission(handle, true))) throw new Error("Permission denied");
  return loadDatabaseFromHandle(handle);
}

function run(sql, params = []) {
  sqlDb.run(sql, params);
}

function all(sql, params = []) {
  const stmt = sqlDb.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

async function upsertEarthquake(q, { force = false, skipPersist = false } = {}) {
  const existing = get("SELECT id, updated FROM earthquakes WHERE id = ?", [q.id]);
  if (existing && !force && existing.updated >= q.updated) {
    return false;
  }
  run(
    `INSERT INTO earthquakes (id, time, updated, latitude, longitude, depth, mag, mag_type, place, url, detail_url, status, tsunami, sig, alert, net, code, raw_json, fetched_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       time=excluded.time, updated=excluded.updated, latitude=excluded.latitude, longitude=excluded.longitude,
       depth=excluded.depth, mag=excluded.mag, mag_type=excluded.mag_type, place=excluded.place, url=excluded.url,
       detail_url=excluded.detail_url, status=excluded.status, tsunami=excluded.tsunami, sig=excluded.sig,
       alert=excluded.alert, net=excluded.net, code=excluded.code, raw_json=excluded.raw_json, fetched_at=excluded.fetched_at`,
    [
      q.id, q.time, q.updated, q.lat, q.lon, q.depth, q.mag, q.magType, q.place, q.url, q.detailUrl,
      q.status, q.tsunami, q.sig, q.alert, q.net, q.code, JSON.stringify(q.raw), Date.now(),
    ]
  );
  if (!skipPersist) await persist();
  return true;
}

function getEarthquakes(sinceMs) {
  return all(
    `SELECT e.*, d.has_shakemap AS d_has_shakemap, d.sm_max_pga AS d_sm_max_pga,
            d.sm_max_pga_onland AS d_sm_max_pga_onland,
            d.sm_onland_station_count AS d_sm_onland_station_count,
            d.sm_max_pga_onland_dyfi AS d_sm_max_pga_onland_dyfi, d.sm_max_mmi AS d_sm_max_mmi
     FROM earthquakes e
     LEFT JOIN earthquake_details d ON d.id = e.id
     WHERE e.time >= ?
     ORDER BY e.time DESC`,
    [sinceMs]
  );
}

function getDetail(id) {
  return get("SELECT * FROM earthquake_details WHERE id = ?", [id]);
}

async function upsertDetail(id, d, { skipPersist = false } = {}) {
  run(
    `INSERT INTO earthquake_details (
       id, has_moment_tensor, mt_np1_strike, mt_np1_dip, mt_np1_rake, mt_np2_strike, mt_np2_dip, mt_np2_rake,
       mt_scalar_moment, mt_percent_double_couple, mt_derived_magnitude, mt_derived_depth,
       mt_tensor_mrr, mt_tensor_mtt, mt_tensor_mpp, mt_tensor_mrt, mt_tensor_mrp, mt_tensor_mtp,
       mt_beachball_source, mt_sourcetime_duration, mt_sourcetime_risetime, mt_sourcetime_decaytime,
       mt_sourcetime_type, mt_raw_json,
       has_shakemap, sm_latitude, sm_longitude, sm_max_mmi, sm_max_pga, sm_max_pga_onland, sm_onland_station_count,
       sm_max_pga_onland_dyfi, sm_onland_dyfi_station_count, sm_max_pgv,
       sm_version, sm_map_status, sm_intensity_image_url, sm_raw_json,
       detail_fetched_at, detail_schema_version
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       has_moment_tensor=excluded.has_moment_tensor, mt_np1_strike=excluded.mt_np1_strike, mt_np1_dip=excluded.mt_np1_dip,
       mt_np1_rake=excluded.mt_np1_rake, mt_np2_strike=excluded.mt_np2_strike, mt_np2_dip=excluded.mt_np2_dip,
       mt_np2_rake=excluded.mt_np2_rake, mt_scalar_moment=excluded.mt_scalar_moment,
       mt_percent_double_couple=excluded.mt_percent_double_couple, mt_derived_magnitude=excluded.mt_derived_magnitude,
       mt_derived_depth=excluded.mt_derived_depth, mt_tensor_mrr=excluded.mt_tensor_mrr, mt_tensor_mtt=excluded.mt_tensor_mtt,
       mt_tensor_mpp=excluded.mt_tensor_mpp, mt_tensor_mrt=excluded.mt_tensor_mrt, mt_tensor_mrp=excluded.mt_tensor_mrp,
       mt_tensor_mtp=excluded.mt_tensor_mtp, mt_beachball_source=excluded.mt_beachball_source,
       mt_sourcetime_duration=excluded.mt_sourcetime_duration, mt_sourcetime_risetime=excluded.mt_sourcetime_risetime,
       mt_sourcetime_decaytime=excluded.mt_sourcetime_decaytime, mt_sourcetime_type=excluded.mt_sourcetime_type,
       mt_raw_json=excluded.mt_raw_json,
       has_shakemap=excluded.has_shakemap, sm_latitude=excluded.sm_latitude, sm_longitude=excluded.sm_longitude,
       sm_max_mmi=excluded.sm_max_mmi, sm_max_pga=excluded.sm_max_pga,
       sm_max_pga_onland=excluded.sm_max_pga_onland, sm_onland_station_count=excluded.sm_onland_station_count,
       sm_max_pga_onland_dyfi=excluded.sm_max_pga_onland_dyfi, sm_onland_dyfi_station_count=excluded.sm_onland_dyfi_station_count,
       sm_max_pgv=excluded.sm_max_pgv, sm_version=excluded.sm_version, sm_map_status=excluded.sm_map_status,
       sm_intensity_image_url=excluded.sm_intensity_image_url, sm_raw_json=excluded.sm_raw_json,
       detail_fetched_at=excluded.detail_fetched_at, detail_schema_version=excluded.detail_schema_version`,
    [
      id, d.hasMomentTensor ? 1 : 0,
      d.mt?.np1Strike ?? null, d.mt?.np1Dip ?? null, d.mt?.np1Rake ?? null,
      d.mt?.np2Strike ?? null, d.mt?.np2Dip ?? null, d.mt?.np2Rake ?? null,
      d.mt?.scalarMoment ?? null, d.mt?.percentDoubleCouple ?? null,
      d.mt?.derivedMagnitude ?? null, d.mt?.derivedDepth ?? null,
      d.mt?.tensorMrr ?? null, d.mt?.tensorMtt ?? null, d.mt?.tensorMpp ?? null,
      d.mt?.tensorMrt ?? null, d.mt?.tensorMrp ?? null, d.mt?.tensorMtp ?? null,
      d.mt?.beachballSource ?? null, d.mt?.sourcetimeDuration ?? null, d.mt?.sourcetimeRisetime ?? null,
      d.mt?.sourcetimeDecaytime ?? null, d.mt?.sourcetimeType ?? null, d.mt ? JSON.stringify(d.mt.raw) : null,
      d.hasShakemap ? 1 : 0, d.sm?.latitude ?? null, d.sm?.longitude ?? null,
      d.sm?.maxMmi ?? null, d.sm?.maxPga ?? null, d.sm?.officialMaxPgaOnland ?? null,
      d.sm?.officialOnlandStationCount ?? null, d.sm?.dyfiMaxPgaOnland ?? null, d.sm?.dyfiOnlandStationCount ?? null,
      d.sm?.maxPgv ?? null,
      d.sm?.version ?? null, d.sm?.mapStatus ?? null, d.sm?.intensityImageUrl ?? null,
      d.sm ? JSON.stringify(d.sm.raw) : null,
      Date.now(), CURRENT_DETAIL_SCHEMA_VERSION,
    ]
  );
  if (!skipPersist) await persist();
}

window.EqDb = {
  isSupported,
  connectExisting,
  connectNew,
  reconnectSaved,
  reconnectWithPermission,
  upsertEarthquake,
  getEarthquakes,
  getDetail,
  upsertDetail,
  needsDetailRefresh,
  persist,
};
