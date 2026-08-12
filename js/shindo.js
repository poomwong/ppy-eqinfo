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

// Prefers the official (real seismic instrument) on-land PGA; falls back to
// the DYFI ("Did You Feel It?") crowd-sourced estimate when no instrument
// reading is available. Returns null if neither exists.
function pickOnlandPga(row) {
  const officialG = row?.sm_max_pga_onland ?? row?.d_sm_max_pga_onland;
  if (officialG != null) return { pgaG: officialG, source: "official" };
  const dyfiG = row?.sm_max_pga_onland_dyfi ?? row?.d_sm_max_pga_onland_dyfi;
  if (dyfiG != null) return { pgaG: dyfiG, source: "dyfi" };
  return null;
}

window.Shindo = { computeShindoFromPgaG, pickOnlandPga, SHINDO_ICONS };
