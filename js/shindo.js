// Computes JMA Shindo (seismic intensity) from PGA, and picks which PGA
// source (official on-land instrument vs. DYFI crowd reports) to trust for
// a given ShakeMap-backed earthquake. See localestimate.js for the
// magnitude-only estimate used when there's no ShakeMap at all.

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

// JMA instrumental seismic intensity, per the JMA's own definition as
// documented in Sokolov (2013), "Three techniques for estimation of
// Instrumental Intensity: a comparison", Eq. 4:
//   I_JMA = 2 * log10(a0) + 0.94
// where a0 (gal) is the largest vectorial 3-component acceleration whose
// cumulative duration above that level is >= 0.3s. We only have a scalar
// peak PGA (not a raw 3-component waveform to run the cumulative-duration
// procedure on), so a0 is approximated here by PGA - the standard practical
// substitution when only peak amplitude is available, per the same source.
function instrumentalIntensityFromPgaGal(pgaGal) {
  if (pgaGal === null || pgaGal === undefined || pgaGal <= 0) return null;
  return 2 * Math.log10(pgaGal) + 0.94;
}

// Standard JMA scale bands (1.0-wide, except the 5/6 -/+ split at 0.5).
function intensityToShindoLabel(intensity) {
  if (intensity === null || intensity === undefined) return null;
  if (intensity < 0.5) return "0";
  if (intensity < 1.5) return "1";
  if (intensity < 2.5) return "2";
  if (intensity < 3.5) return "3";
  if (intensity < 4.5) return "4";
  if (intensity < 5.0) return "5-";
  if (intensity < 5.5) return "5+";
  if (intensity < 6.0) return "6-";
  if (intensity < 6.5) return "6+";
  return "7";
}

// pgaG: PGA in units of g (standard-gravity fractions).
function computeShindoFromPgaG(pgaG) {
  if (pgaG === null || pgaG === undefined) return null;
  const pgaGal = pgaG * GAL_PER_G;
  const intensity = instrumentalIntensityFromPgaGal(pgaGal);
  const label = intensityToShindoLabel(intensity);
  if (label === null) return null;
  return { pgaGal, intensity, label, iconPath: SHINDO_ICONS[label] };
}

// Primary source of truth: the ShakeMap product's own top-level "maxpga"
// property (stored as sm_max_pga), NOT "maxpga-grid". USGS itself publishes
// both: maxpga-grid is the raw physics/GMPE grid and can spike unrealistically
// right over the rupture (especially for remote events with nothing nearby to
// constrain it against), while maxpga is USGS's own already-computed,
// data-constrained figure - the same one used elsewhere on their site. This
// is available on essentially every ShakeMap, unlike our own stationlist.json
// parsing which returns nothing when an event has too few qualifying entries
// (e.g. us7000szzy: maxpga 0.027g vs maxpga-grid 0.546g, with an empty
// stationlist - our old on-land computation showed nothing for it).
function primaryOnlandPga(row) {
  const pgaG = row?.sm_max_pga ?? row?.d_sm_max_pga ?? null;
  if (pgaG == null) return null;
  return { pgaG, source: "usgs" };
}

// Supplementary reference only: the max PGA implied by on-land "Did You Feel
// It?" crowd reports, from our own stationlist.json parsing. Shown alongside
// the primary USGS-sourced figure when available, not used to override it.
function dyfiOnlandPga(row) {
  const pgaG = row?.sm_max_pga_onland_dyfi ?? row?.d_sm_max_pga_onland_dyfi ?? null;
  if (pgaG == null) return null;
  return { pgaG, source: "dyfi" };
}

window.Shindo = { computeShindoFromPgaG, primaryOnlandPga, dyfiOnlandPga };
