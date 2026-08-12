// Estimates MMI (and a derived JMA long-period ground-motion class) at an
// arbitrary location from magnitude + hypocentral distance alone - no
// ShakeMap/instrumental data needed. This is deliberately a rough estimate:
// see the tooltips wired up in ui.js for the caveats shown to the user.

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Allen, Wald & Worden (2012) Intensity Prediction Equation, hypocentral-
// distance version (AllenEtAl2012Rhypo) - coefficients from the actual
// OpenQuake hazardlib implementation (openquake/hazardlib/gsim/allen_2012_ipe.py).
// Predicts a generic/average-site MMI from magnitude and hypocentral distance;
// has no notion of local soil conditions on its own.
const AWW12 = { c0: 2.085, c1: 1.428, c2: -1.402, c4: 0.078, m1: -0.209, m2: 2.042 };

function aww12Mmi(mag, rhypoKm) {
  const rM = AWW12.m1 + AWW12.m2 * Math.exp(mag - 5);
  let distanceTerm = AWW12.c2 * Math.log(Math.sqrt(rhypoKm ** 2 + rM ** 2));
  if (rhypoKm > 50) distanceTerm += AWW12.c4 * Math.log(rhypoKm / 50);
  return AWW12.c0 + AWW12.c1 * mag + distanceTerm;
}

// Calibrated against the real 2025 M7.7 Mandalay/Myanmar earthquake
// (us7000pn9s): AWW12 alone predicts MMI ~3.6 at Bangkok's distance (~1037km
// epicentral), but on-land DYFI reports near Bangkok (Vs30 ~190-210 m/s, deep
// soft clay - Chao Phraya basin) show MMI ~4.2-5.5. +1.5 sits in that gap.
// This represents Bangkok's basin resonance specifically, not a general-
// purpose site term - it should not be applied to other locations.
const BANGKOK_AMPLIFICATION_MMI = 1.5;

// Wald et al. (1999b) PGV-MMI relationship (as reproduced in Sokolov 2013),
// inverted to recover an approximate PGV from an MMI estimate. Calibrated for
// MMI > VII, but used here across the full range as an order-of-magnitude
// proxy - there is no better option when working from magnitude/distance
// alone with no waveform data.
function mmiToApproxPgvCms(mmi) {
  return Math.pow(10, (mmi - 2.35) / 3.47);
}

// Bangkok's damage in the 2025 Myanmar earthquake was specifically a long-
// period (surface wave / tall-building resonance) phenomenon, not a general
// shaking-intensity one - NEHRP Fv (long-period) site factors for very soft
// soil (Site Class E, matching Bangkok's Vs30) run well above Fa (short-
// period) factors for the same site. This extra multiplier, applied only to
// the long-period estimate (not the headline MMI), reflects that the
// long-period content is disproportionately amplified beyond what the
// uniform MMI bump alone implies.
const BANGKOK_LONGPERIOD_MULTIPLIER = 2.5;

// JMA's official 長周期地震動階級 (long-period ground motion class) bands, in
// kine (cm/s) of absolute velocity response spectrum. We only have a PGV
// proxy standing in for that spectral value, so the resulting class is a
// rough estimate, not JMA's actual computed grade.
function longPeriodClassFromKine(kine) {
  if (kine < 5) return 0;
  if (kine < 15) return 1;
  if (kine < 50) return 2;
  if (kine < 100) return 3;
  return 4;
}

// quake: { mag, latitude, longitude, depth }. target: { lat, lon }.
function estimateLocal(quake, target, applyBangkokAmplification) {
  if (quake.mag == null || quake.latitude == null || quake.longitude == null) return null;
  const repiKm = haversineKm(quake.latitude, quake.longitude, target.lat, target.lon);
  const depthKm = quake.depth ?? 0;
  const rhypoKm = Math.sqrt(repiKm ** 2 + depthKm ** 2);

  const baseMmi = aww12Mmi(quake.mag, rhypoKm);
  const mmi = applyBangkokAmplification ? baseMmi + BANGKOK_AMPLIFICATION_MMI : baseMmi;

  const basePgvCms = mmiToApproxPgvCms(mmi);
  const longPeriodPgvCms = applyBangkokAmplification ? basePgvCms * BANGKOK_LONGPERIOD_MULTIPLIER : basePgvCms;
  const longPeriodClass = longPeriodClassFromKine(longPeriodPgvCms);

  return {
    repiKm,
    rhypoKm,
    mmi,
    longPeriodKine: longPeriodPgvCms,
    longPeriodClass,
  };
}

window.LocalEstimate = { haversineKm, aww12Mmi, estimateLocal, longPeriodClassFromKine };
