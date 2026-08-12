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

// Karim & Yamazaki (2002) empirical fit of JMA instrumental seismic
// intensity from peak ground acceleration.
function instrumentalIntensityFromPgaGal(pgaGal) {
  if (pgaGal === null || pgaGal === undefined || pgaGal <= 0) return null;
  if (pgaGal < 300) return 2.001 * Math.log10(pgaGal) + 0.94;
  return 2.432 * Math.log10(pgaGal) - 1.83;
}

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

// pgaG: ShakeMap max PGA in units of g (standard-gravity fractions).
function computeShindoFromPgaG(pgaG) {
  if (pgaG === null || pgaG === undefined) return null;
  const pgaGal = pgaG * GAL_PER_G;
  const intensity = instrumentalIntensityFromPgaGal(pgaGal);
  const label = intensityToShindoLabel(intensity);
  if (label === null) return null;
  return { pgaGal, intensity, label, iconPath: SHINDO_ICONS[label] };
}

window.Shindo = { computeShindoFromPgaG, SHINDO_ICONS };
