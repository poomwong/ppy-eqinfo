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
