const GAL_PER_G = 980.665;

const SHINDO_ICONS = {
  "0": "icons/shindo/shindo-0.svg",
  "1": "icons/shindo/shindo-1.svg",
  "2": "icons/shindo/shindo-2.svg",
  "3": "icons/shindo/shindo-3.svg",
  "4": "icons/shindo/shindo-4.svg",
  "5-": "icons/shindo/shindo-5-lower.svg",
  "5+": "icons/shindo/shindo-5-upper.svg",
  "6-": "icons/shindo/shindo-6-lower.svg",
  "6+": "icons/shindo/shindo-6-upper.svg",
  "7": "icons/shindo/shindo-7.svg",
};

// Standard rough-guide correspondence between peak ground acceleration (gal)
// and JMA seismic intensity (Shindo). Each entry's max is exclusive.
const SHINDO_GAL_BANDS = [
  { max: 0.8, label: "0" },
  { max: 2.5, label: "1" },
  { max: 8, label: "2" },
  { max: 25, label: "3" },
  { max: 80, label: "4" },
  { max: 140, label: "5-" },
  { max: 250, label: "5+" },
  { max: 450, label: "6-" },
  { max: 800, label: "6+" },
  { max: Infinity, label: "7" },
];

function shindoLabelFromGal(pgaGal) {
  if (pgaGal === null || pgaGal === undefined || pgaGal < 0) return null;
  for (const band of SHINDO_GAL_BANDS) {
    if (pgaGal < band.max) return band.label;
  }
  return "7";
}

// pgaG: PGA in units of g (standard-gravity fractions).
function computeShindoFromPgaG(pgaG) {
  if (pgaG === null || pgaG === undefined) return null;
  const pgaGal = pgaG * GAL_PER_G;
  const label = shindoLabelFromGal(pgaGal);
  if (label === null) return null;
  return { pgaGal, label, iconPath: SHINDO_ICONS[label] };
}

// An "official" (real seismic instrument) network is only trustworthy on
// its own once it has a reasonable number of stations reporting. A couple
// of distant official stations can badly under-represent near-source
// shaking (seen on a real M7.4: 2 official stations read 0.02g while 49
// on-land DYFI reports read 0.39g, against a USGS-reported MMI of ~8) - in
// that case the larger, more geographically relevant DYFI sample is the
// better estimate, even though it's crowd-sourced rather than instrumental.
const MIN_RELIABLE_OFFICIAL_STATIONS = 5;

// Picks the best available on-land PGA reading, preferring the official
// network only when it has enough stations to be representative; otherwise
// falls back to whichever of official/DYFI is higher. Returns null if
// neither is available.
function pickOnlandPga(row) {
  const officialG = row?.sm_max_pga_onland ?? row?.d_sm_max_pga_onland ?? null;
  const officialCount = row?.sm_onland_station_count ?? row?.d_sm_onland_station_count ?? 0;
  const dyfiG = row?.sm_max_pga_onland_dyfi ?? row?.d_sm_max_pga_onland_dyfi ?? null;

  if (officialG != null && officialCount >= MIN_RELIABLE_OFFICIAL_STATIONS) {
    return { pgaG: officialG, source: "official" };
  }
  if (officialG != null && dyfiG != null) {
    return officialG >= dyfiG ? { pgaG: officialG, source: "official" } : { pgaG: dyfiG, source: "dyfi" };
  }
  if (dyfiG != null) return { pgaG: dyfiG, source: "dyfi" };
  if (officialG != null) return { pgaG: officialG, source: "official" };
  return null;
}

window.Shindo = { computeShindoFromPgaG, pickOnlandPga, SHINDO_ICONS };
