function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function normalizeRake(rake) {
  return ((rake + 180) % 360 + 360) % 360 - 180;
}

// Standard 8-bin rake classification (45deg-wide bins centered on the four
// cardinal mechanisms), the common simplified scheme for labeling a focal
// mechanism from rake alone. dip is used only to flag the shallow-thrust
// case commonly associated with subduction megathrust interfaces - "possible
// subduction interface" is a geometric inference from the mechanism, not a
// tectonic-setting lookup, since that would need plate-boundary context we
// don't have.
function classifyFaultType(rake, dip) {
  if (rake === null || rake === undefined || Number.isNaN(rake)) return null;
  const r = normalizeRake(rake);
  const a = Math.abs(r);

  let base;
  if (a <= 22.5) base = "Strike-slip (left-lateral)";
  else if (a >= 157.5) base = "Strike-slip (right-lateral)";
  else if (r > 22.5 && r < 67.5) base = "Oblique reverse (left-lateral component)";
  else if (r >= 67.5 && r <= 112.5) base = "Reverse / Thrust faulting";
  else if (r > 112.5 && r < 157.5) base = "Oblique reverse (right-lateral component)";
  else if (r < -22.5 && r > -67.5) base = "Oblique normal (right-lateral component)";
  else if (r <= -67.5 && r >= -112.5) base = "Normal faulting";
  else base = "Oblique normal (left-lateral component)";

  const isReverseFamily = r > 22.5 && r < 157.5;
  if (isReverseFamily && dip !== null && dip !== undefined && dip <= 30) {
    base += " — shallow dip, geometrically consistent with a subduction megathrust interface";
  }
  return base;
}

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function compassLabel(bearingDeg) {
  const idx = Math.round(bearingDeg / 22.5) % 16;
  return COMPASS_16[idx];
}

// Hanging-wall slip vector relative to the footwall, from strike/dip/rake
// (Aki & Richards 1980 convention; N/E/D coordinates). Returns a compass
// bearing for the horizontal component and a signed vertical component
// (positive = upward motion).
function slipVector(strikeDeg, dipDeg, rakeDeg) {
  const strike = toRad(strikeDeg);
  const dip = toRad(dipDeg);
  const rake = toRad(rakeDeg);

  const n = Math.cos(rake) * Math.cos(strike) + Math.cos(dip) * Math.sin(rake) * Math.sin(strike);
  const e = Math.cos(rake) * Math.sin(strike) - Math.cos(dip) * Math.sin(rake) * Math.cos(strike);
  const d = -Math.sin(rake) * Math.sin(dip);

  const bearingDeg = (Math.atan2(e, n) * 180) / Math.PI;
  const normalizedBearing = (bearingDeg + 360) % 360;
  const vertical = -d; // positive = upward

  return { bearingDeg: normalizedBearing, compass: compassLabel(normalizedBearing), vertical };
}

// Plain-English description of which way the ground moved on each nodal
// plane. Both planes are shown because the tensor alone can't distinguish
// which one is the actual fault (that needs geological/aftershock context) -
// this is standard nodal-plane ambiguity, not a bug.
function describeSlip(strikeDeg, dipDeg, rakeDeg) {
  if ([strikeDeg, dipDeg, rakeDeg].some((v) => v === null || v === undefined || Number.isNaN(v))) {
    return null;
  }
  const { compass, vertical } = slipVector(strikeDeg, dipDeg, rakeDeg);
  const vertDesc = Math.abs(vertical) < 0.15 ? "mostly horizontal motion" : vertical > 0 ? "moving upward" : "moving downward";
  return `Hanging wall moves toward the ${compass}, ${vertDesc}`;
}

window.FaultGeom = { classifyFaultType, describeSlip };
