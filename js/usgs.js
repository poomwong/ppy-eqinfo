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
    raw: p,
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
  return {
    hasMomentTensor: !!mtProduct,
    mt: mtProduct ? parseMomentTensor(mtProduct) : null,
    hasShakemap: !!smProduct,
    sm: smProduct ? parseShakemap(smProduct) : null,
  };
}

window.UsgsApi = { MIN_MAGNITUDE, fetchSummary, fetchDetail };
