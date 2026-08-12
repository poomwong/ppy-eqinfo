const USGS_ENDPOINT = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const MIN_MAGNITUDE = 6.0;

function num(v) {
  return v === undefined || v === null || v === "" ? null : Number(v);
}

function buildSummaryUrl(days) {
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

function normalizeFeature(f) {
  const [lon, lat, depth] = f.geometry.coordinates;
  const p = f.properties;
  return {
    id: f.id,
    time: p.time,
    updated: p.updated,
    lat,
    lon,
    depth,
    mag: p.mag,
    magType: p.magType,
    place: p.place,
    url: p.url,
    detailUrl: p.detail,
    status: p.status,
    tsunami: p.tsunami,
    sig: p.sig,
    alert: p.alert,
    net: p.net,
    code: p.code,
    raw: f,
  };
}

async function fetchSummary(days) {
  const res = await fetch(buildSummaryUrl(days));
  if (!res.ok) throw new Error(`USGS summary request failed: ${res.status}`);
  const data = await res.json();
  return data.features.map(normalizeFeature);
}

function parseMomentTensor(product) {
  const p = product.properties;
  return {
    np1Strike: num(p["nodal-plane-1-strike"]),
    np1Dip: num(p["nodal-plane-1-dip"]),
    np1Rake: num(p["nodal-plane-1-rake"]),
    np2Strike: num(p["nodal-plane-2-strike"]),
    np2Dip: num(p["nodal-plane-2-dip"]),
    np2Rake: num(p["nodal-plane-2-rake"]),
    scalarMoment: num(p["scalar-moment"]),
    percentDoubleCouple: num(p["percent-double-couple"]),
    derivedMagnitude: num(p["derived-magnitude"]),
    derivedDepth: num(p["derived-depth"]),
    tensorMrr: num(p["tensor-mrr"]),
    tensorMtt: num(p["tensor-mtt"]),
    tensorMpp: num(p["tensor-mpp"]),
    tensorMrt: num(p["tensor-mrt"]),
    tensorMrp: num(p["tensor-mrp"]),
    tensorMtp: num(p["tensor-mtp"]),
    beachballSource: p["beachball-source"] ?? null,
    sourcetimeDuration: num(p["sourcetime-duration"]),
    sourcetimeRisetime: num(p["sourcetime-risetime"]),
    sourcetimeDecaytime: num(p["sourcetime-decaytime"]),
    sourcetimeType: p["sourcetime-type"] ?? null,
    raw: p,
  };
}

function parseShakemap(product) {
  const p = product.properties;
  const intensityContent = product.contents?.["download/intensity.jpg"];
  return {
    maxMmi: num(p["maxmmi"]),
    maxPga: num(p["maxpga"]),
    maxPgv: num(p["maxpgv"]),
    version: num(p["version"]),
    mapStatus: p["map-status"] ?? null,
    intensityImageUrl: intensityContent?.url ?? null,
    stationListUrl: product.contents?.["download/stationlist.json"]?.url ?? null,
    raw: p,
  };
}

// The gridded ShakeMap max PGA can peak directly over an offshore rupture,
// which nobody actually feels. The station list only contains points where
// a seismic instrument or a "Did You Feel It?" report exists — i.e. places
// people actually are — so its max is a much better proxy for on-land shaking.
// Official (real instrument) and DYFI (crowd-sourced) readings are tracked
// separately: official is the authoritative value, DYFI is a fallback/reference
// for events too remote to have real station coverage.
async function fetchOnlandPgaStats(stationListUrl) {
  const empty = {
    officialMaxPga: null,
    officialStationCount: 0,
    dyfiMaxPga: null,
    dyfiStationCount: 0,
  };
  if (!stationListUrl) return empty;
  const res = await fetch(stationListUrl);
  if (!res.ok) return empty;
  const data = await res.json();

  const officialPgas = [];
  const dyfiPgas = [];
  for (const f of data.features || []) {
    const pga = f.properties?.pga;
    if (typeof pga !== "number" || !Number.isFinite(pga)) continue;
    const isDyfi = (f.properties?.network || "").toUpperCase() === "DYFI";
    (isDyfi ? dyfiPgas : officialPgas).push(pga);
  }

  return {
    officialMaxPga: officialPgas.length ? Math.max(...officialPgas) / 100 : null,
    officialStationCount: officialPgas.length,
    dyfiMaxPga: dyfiPgas.length ? Math.max(...dyfiPgas) / 100 : null,
    dyfiStationCount: dyfiPgas.length,
  };
}

async function fetchDetail(idOrUrl) {
  const url = idOrUrl.startsWith("http") ? idOrUrl : `${USGS_ENDPOINT}?eventid=${idOrUrl}&format=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS detail request failed: ${res.status}`);
  const data = await res.json();
  const products = data.properties.products || {};
  const mtProduct = products["moment-tensor"]?.[0];
  const smProduct = products["shakemap"]?.[0];

  const sm = smProduct ? parseShakemap(smProduct) : null;
  if (sm) {
    const stats = await fetchOnlandPgaStats(sm.stationListUrl);
    sm.officialMaxPgaOnland = stats.officialMaxPga;
    sm.officialOnlandStationCount = stats.officialStationCount;
    sm.dyfiMaxPgaOnland = stats.dyfiMaxPga;
    sm.dyfiOnlandStationCount = stats.dyfiStationCount;
  }

  return {
    hasMomentTensor: !!mtProduct,
    mt: mtProduct ? parseMomentTensor(mtProduct) : null,
    hasShakemap: !!smProduct,
    sm,
  };
}

window.UsgsApi = { MIN_MAGNITUDE, fetchSummary, fetchDetail };
