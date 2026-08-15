// Pure rendering: builds the summary table, map popups' shared badges, and
// the earthquake detail panel from already-loaded data. Never fetches
// anything itself - main.js owns all data loading/state and calls into
// EqUi.renderTable/renderDetail with whatever it wants shown.

function formatDateTime(ms) {
  return TimeFormat.format(ms);
}

function fmtNum(v, digits = 2) {
  return v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toFixed(digits);
}

function fmtExp(v) {
  return v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toExponential(3);
}

function shindoCell(q) {
  const picked = q.d_has_shakemap ? Shindo.primaryOnlandPga(q) : null;
  if (!picked) return `<span class="empty-note">-</span>`;
  const shindo = Shindo.computeShindoFromPgaG(picked.pgaG);
  if (!shindo) return `<span class="empty-note">-</span>`;
  return `<img class="shindo-icon shindo-icon-sm" src="${shindo.iconPath}" alt="Shindo ${shindo.label}" title="Shindo ${shindo.label} (USGS reported PGA)">`;
}

const ALERT_COLORS = { green: "#4CAF50", yellow: "#FDD835", orange: "#FB8C00", red: "#E53935" };

function alertCell(q) {
  if (!q.alert) return `<span class="empty-note">-</span>`;
  const color = ALERT_COLORS[q.alert] ?? "#888";
  return `<span class="alert-dot" style="background:${color}" title="PAGER alert: ${q.alert}"></span>`;
}

function tsunamiCell(q) {
  return q.tsunami
    ? `<span class="alert-dot" style="background:#E53935" title="Tsunami warning was issued for this event"></span>`
    : "";
}

function mmiCell(q) {
  const mmi = q.d_sm_max_mmi;
  if (mmi === null || mmi === undefined) return `<span class="empty-note">-</span>`;
  const [bg, fg] = mmiColors(mmi);
  return `<span class="mmi-chip" style="background:${bg};color:${fg}" title="${fmtNum(mmi, 2)}">${mmiRoman(mmi)}</span>`;
}

// A quick visual flag for events USGS hasn't human-reviewed yet - the
// automatically-generated data (magnitude, location, ShakeMap) can still
// change once reviewed.
function reviewInfoIcon(q) {
  if (!q.status || q.status.toLowerCase() === "reviewed") return "";
  return `<span class="info-icon" title="Status: ${q.status} &mdash; not yet human-reviewed by USGS, data may still change">&#9432;</span>`;
}

function renderTable(quakes, onSelect, targetLocation) {
  const tbody = document.getElementById("eq-table-body");
  tbody.innerHTML = "";
  quakes.forEach((q) => {
    const tr = document.createElement("tr");
    tr.dataset.id = q.id;
    const magClass = q.mag >= 7.0 ? "mag-cell mag-high" : "mag-cell";

    const localEstimate = targetLocation ? computeLocalEstimate(q, targetLocation) : null;
    const isLocallyFelt = localEstimate && (localEstimate.mmiRounded >= 1 || localEstimate.longPeriodClass > 0);
    if (isLocallyFelt) {
      tr.classList.add("locally-felt");
      tr.title = `Estimated local MMI ${localEstimate.mmiRounded}${localEstimate.longPeriodClass > 0 ? `, long-period class ${localEstimate.longPeriodClass}` : ""} at the configured location`;
    }

    tr.innerHTML = `
      <td>${formatDateTime(q.time)}</td>
      <td>${fmtNum(q.latitude, 3)}, ${fmtNum(q.longitude, 3)}</td>
      <td class="${magClass}">${reviewInfoIcon(q)}${fmtNum(q.mag, 1)}</td>
      <td>${fmtNum(q.depth, 1)}</td>
      <td>${q.place ?? "Unknown"}</td>
      <td>${mmiCell(q)}</td>
      <td>${shindoCell(q)}</td>
      <td class="alert-cell">${alertCell(q)}</td>
      <td class="tsunami-cell">${tsunamiCell(q)}</td>
      <td><a href="${q.url}" target="_blank" rel="noopener" class="row-link">USGS &rarr;</a></td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".row-link")) return;
      onSelect(q.id);
    });
    tbody.appendChild(tr);
  });
}

function planeInterpretation(label, strike, dip, rake) {
  const faultType = FaultGeom.classifyFaultType(rake, dip);
  const slip = FaultGeom.describeSlip(strike, dip, rake);
  return `
    <div>
      <h4>${label}</h4>
      <dl>
        <dt>Strike</dt><dd>${fmtNum(strike)}&deg;</dd>
        <dt>Dip</dt><dd>${fmtNum(dip)}&deg;</dd>
        <dt>Rake</dt><dd>${fmtNum(rake)}&deg;</dd>
        <dt>Fault Type</dt><dd>${faultType ?? "-"}</dd>
        <dt>Ground Motion</dt><dd>${slip ?? "-"}</dd>
      </dl>
    </div>
  `;
}

// beachballSrc, when given, renders a static <img> (a snapshot of the
// beachball, e.g. for the HTML export) instead of the live <canvas> that
// renderDetail() draws into after inserting this markup.
function tensorSection(detail, quake, beachballSrc) {
  if (!detail || !detail.has_moment_tensor) {
    return `<p class="empty-note">No moment tensor solution available for this event.</p>`;
  }
  const hasPlanes =
    detail.mt_np1_strike !== null && detail.mt_np1_dip !== null &&
    detail.mt_np2_strike !== null && detail.mt_np2_dip !== null;
  const beachball = !hasPlanes
    ? ""
    : beachballSrc
      ? `<img class="beachball" width="160" height="160" src="${beachballSrc}" alt="Beachball diagram">`
      : `<canvas id="beachball-canvas" class="beachball" width="160" height="160"></canvas>`;

  return `
    <div class="tensor-layout">
      <div class="grid-2">
        ${planeInterpretation("Nodal Plane 1", detail.mt_np1_strike, detail.mt_np1_dip, detail.mt_np1_rake)}
        ${planeInterpretation("Nodal Plane 2", detail.mt_np2_strike, detail.mt_np2_dip, detail.mt_np2_rake)}
      </div>
      ${beachball}
    </div>
    <p class="empty-note">Nodal-plane ambiguity: the tensor alone can't say which plane is the actual fault and which is the mathematical auxiliary plane &mdash; that needs geological or aftershock context. Both interpretations above are equally valid readings of this same solution.</p>
    <dl>
      <dt>Scalar Moment (N&middot;m)</dt><dd>${fmtExp(detail.mt_scalar_moment)}</dd>
      <dt>Percent Double Couple</dt><dd>${detail.mt_percent_double_couple !== null ? fmtNum(detail.mt_percent_double_couple * 100, 1) + "%" : "-"}</dd>
      <dt>Derived Magnitude</dt><dd>${fmtNum(detail.mt_derived_magnitude, 2)}</dd>
      <dt>Derived Depth (km)</dt><dd>${fmtNum(detail.mt_derived_depth, 1)}</dd>
      <dt>Source</dt><dd>${detail.mt_beachball_source ?? "-"}</dd>
    </dl>
    <h4>Moment Tensor Components (N&middot;m)</h4>
    <dl class="tensor-components">
      <dt>Mrr</dt><dd>${fmtExp(detail.mt_tensor_mrr)}</dd>
      <dt>Mtt</dt><dd>${fmtExp(detail.mt_tensor_mtt)}</dd>
      <dt>Mpp</dt><dd>${fmtExp(detail.mt_tensor_mpp)}</dd>
      <dt>Mrt</dt><dd>${fmtExp(detail.mt_tensor_mrt)}</dd>
      <dt>Mrp</dt><dd>${fmtExp(detail.mt_tensor_mrp)}</dd>
      <dt>Mtp</dt><dd>${fmtExp(detail.mt_tensor_mtp)}</dd>
    </dl>
    <h4>Rupture Duration</h4>
    <dl>
      <dt>Rupture Duration (s)</dt><dd>${fmtNum(detail.mt_sourcetime_duration, 1)}</dd>
      <dt>Rise Time (s)</dt><dd>${fmtNum(detail.mt_sourcetime_risetime, 1)}</dd>
      <dt>Decay Time (s)</dt><dd>${fmtNum(detail.mt_sourcetime_decaytime, 1)}</dd>
      <dt>Source Time Function</dt><dd>${detail.mt_sourcetime_type ?? "-"}</dd>
    </dl>
    <p class="empty-note">This is how long the fault itself took to rupture, not how long shaking was felt at any particular city &mdash; felt duration depends heavily on distance from the source and local soil/basin conditions (surface waves and site resonance can extend felt shaking well beyond the rupture time, especially far from the epicenter), so it isn't something derivable from magnitude alone.</p>
  `;
}

function shindoBadge(detail) {
  const picked = detail?.has_shakemap ? Shindo.primaryOnlandPga(detail) : null;
  const shindo = picked ? Shindo.computeShindoFromPgaG(picked.pgaG) : null;
  if (!shindo) {
    return `<div class="intensity-badge"><span class="intensity-label">SHINDO</span><span class="intensity-value">-</span></div>`;
  }
  return `
    <div class="intensity-badge" title="From USGS-reported PGA (${fmtNum(picked.pgaG, 3)}g)">
      <img class="shindo-icon" src="${shindo.iconPath}" alt="Shindo ${shindo.label}">
      <span class="intensity-label">SHINDO</span>
      <span class="intensity-value">${shindo.label}</span>
    </div>
  `;
}

// Secondary reference badge shown alongside the primary one whenever an
// on-land DYFI-derived PGA is available - not a substitute for the primary
// USGS-sourced figure, just a second data point for comparison.
function dyfiShindoBadge(detail) {
  const picked = detail?.has_shakemap ? Shindo.dyfiOnlandPga(detail) : null;
  const shindo = picked ? Shindo.computeShindoFromPgaG(picked.pgaG) : null;
  if (!shindo) return "";
  return `
    <div class="intensity-badge" title="From on-land DYFI 'Did You Feel It?' reports (${fmtNum(picked.pgaG, 3)}g) - reference only">
      <img class="shindo-icon" src="${shindo.iconPath}" alt="Shindo ${shindo.label} (DYFI)">
      <span class="intensity-label">SHINDO (DYFI)</span>
      <span class="intensity-value">${shindo.label}</span>
    </div>
  `;
}

// Rough MMI color ramp, kept visually consistent with the Shindo icon palette.
// Standard USGS ShakeMap MMI color ramp (the mi.cpt palette used on every
// published ShakeMap), keyed to the rounded Roman-numeral grade boundaries.
const MMI_COLOR_STOPS = [
  [1.5, "#FFFFFF", "#1a1a1a"],
  [2.5, "#BFCCFF", "#1a1a1a"],
  [3.5, "#A0E6FF", "#1a1a1a"],
  [4.5, "#80FFFF", "#1a1a1a"],
  [5.5, "#7AFF93", "#1a1a1a"],
  [6.5, "#FFFF00", "#1a1a1a"],
  [7.5, "#FFC800", "#1a1a1a"],
  [8.5, "#FF9100", "#fff"],
  [9.5, "#FF0000", "#fff"],
  [10.5, "#C80000", "#fff"],
  [11.5, "#A00000", "#fff"],
];

function mmiColors(mmi) {
  if (mmi === null || mmi === undefined) return ["#2a2f38", "#e7eaee"];
  for (const [max, bg, fg] of MMI_COLOR_STOPS) {
    if (mmi < max) return [bg, fg];
  }
  return ["#800000", "#fff"];
}

// MMI is conventionally expressed in Roman numerals, rounded to the nearest
// whole grade - the underlying ShakeMap value is a continuous estimate, but
// the scale itself (I-XII) isn't.
const MMI_ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function mmiRoman(mmi) {
  if (mmi === null || mmi === undefined || Number.isNaN(mmi)) return "-";
  const rounded = Math.round(mmi);
  if (rounded < 0) return MMI_ROMAN[0];
  if (rounded >= MMI_ROMAN.length) return "XII+";
  return MMI_ROMAN[rounded];
}

function mmiBadge(detail) {
  const mmi = detail?.sm_max_mmi ?? null;
  const [bg, fg] = mmiColors(mmi);
  return `
    <div class="intensity-badge" style="background:${bg};color:${fg};border-color:${bg}" title="${fmtNum(mmi, 2)}">
      <span class="intensity-label" style="color:${fg}">MMI</span>
      <span class="intensity-value">${mmiRoman(mmi)}</span>
    </div>
  `;
}

const LONG_PERIOD_ICONS = {
  1: "icons/longperiod/lp-1.svg",
  2: "icons/longperiod/lp-2.svg",
  3: "icons/longperiod/lp-3.svg",
  4: "icons/longperiod/lp-4.svg",
};

const BANGKOK_DEFAULT = { lat: 13.7563, lon: 100.5018 };

// Estimated MMI + JMA long-period class at an arbitrary location (default
// Bangkok), from magnitude + distance alone - no ShakeMap data involved.
// LocalEstimate.estimateLocal itself restricts this to earthquakes sourced
// in Thailand/Myanmar/Andaman/Arakan and returns null outside that region
// or when nothing would be felt - so this only shows up for the specific
// source regions with a known connection to the target location, not every
// earthquake with an epicenter.
function computeLocalEstimate(quake, targetLocation) {
  if (!targetLocation || quake.mag == null || quake.latitude == null || quake.longitude == null) return null;
  return LocalEstimate.estimateLocal(
    { mag: quake.mag, latitude: quake.latitude, longitude: quake.longitude, depth: quake.depth },
    { lat: targetLocation.lat, lon: targetLocation.lon },
    targetLocation.amplify
  );
}

// JMA doesn't publish official text labels for the four long-period classes
// (only the kine bands) - this is a plain-language severity ramp matching
// their class descriptions (1: barely noticeable sway up to 4: hard to stand,
// unsecured furniture moves), used here so the badge doesn't just show a
// bare "1"-"4" with no context.
const LONG_PERIOD_LABELS = { 1: "Slight", 2: "Moderate", 3: "Strong", 4: "Severe" };

function localEstimateBadges(quake, targetLocation) {
  const estimate = computeLocalEstimate(quake, targetLocation);
  // Hidden only when BOTH are zero (nothing meaningful to show) - either one
  // alone being non-zero is still worth displaying.
  if (!estimate || (estimate.mmiRounded < 1 && estimate.longPeriodClass === 0)) return "";

  const isBangkokDefault = targetLocation.lat === BANGKOK_DEFAULT.lat && targetLocation.lon === BANGKOK_DEFAULT.lon;
  const locLabel = isBangkokDefault ? "Bangkok" : `${estimate.repiKm.toFixed(0)}km site`;
  // Only the headline MMI badge is gated behind the checkbox - the
  // long-period badge below always includes Bangkok's basin resonance,
  // since that's a physical site property rather than a speculative
  // adjustment (see BANGKOK_LONGPERIOD_MULTIPLIER in localestimate.js).
  const amplifyNote = targetLocation.amplify ? ", with Bangkok basin amplification applied" : "";
  const commonTitle = `Estimated from magnitude + epicentral distance (${estimate.repiKm.toFixed(0)}km to ${locLabel}) via the Allen, Wald &amp; Worden (2012) IPE${amplifyNote} - NOT derived from ShakeMap data, a rough estimate only`;

  const [bg, fg] = mmiColors(estimate.mmi);
  const localMmi =
    estimate.mmiRounded >= 1
      ? `
    <div class="intensity-badge" style="background:${bg};color:${fg};border-color:${bg}" title="${commonTitle}">
      <span class="intensity-label" style="color:${fg}">MMI @ ${locLabel}</span>
      <span class="intensity-value">${mmiRoman(estimate.mmi)}</span>
    </div>
  `
      : "";

  const longPeriod =
    estimate.longPeriodClass > 0
      ? `
    <div class="intensity-badge" title="Estimated JMA long-period ground motion class ${estimate.longPeriodClass} (~${estimate.longPeriodKine.toFixed(1)} kine estimated), including Bangkok basin long-period resonance - a rough estimate derived from the local MMI estimate, not JMA's actual computed grade">
      <img class="shindo-icon" src="${LONG_PERIOD_ICONS[estimate.longPeriodClass]}" alt="Long-period class ${estimate.longPeriodClass}">
      <span class="intensity-label">LONG PERIOD</span>
      <span class="intensity-value">${LONG_PERIOD_LABELS[estimate.longPeriodClass]}</span>
    </div>
  `
      : "";

  return localMmi + longPeriod;
}

function shakemapSection(detail) {
  if (!detail || !detail.has_shakemap) {
    return `<p class="empty-note">No ShakeMap available for this event.</p>`;
  }
  const img = detail.sm_intensity_image_url
    ? `<img class="shakemap-img" src="${detail.sm_intensity_image_url}" alt="ShakeMap intensity" loading="lazy">`
    : "";
  const officialCount = detail.sm_onland_station_count ?? 0;
  const dyfiCount = detail.sm_onland_dyfi_station_count ?? 0;
  const dyfiPicked = Shindo.dyfiOnlandPga(detail);
  const dyfiBadge = dyfiPicked ? dyfiShindoBadge(detail) : "";

  return `
    <div class="intensity-row">
      ${shindoBadge(detail)}
      ${dyfiBadge}
    </div>
    <dl>
      <dt title="The preferred/official ShakeMap submission's own version counter - bumps each time USGS revises this ShakeMap">ShakeMap Version</dt>
      <dd>v${detail.sm_version ?? "-"}</dd>
      <dt title="The ShakeMap product's own reference point, from the shakemap[] entry - may differ slightly from the origin location">ShakeMap Epicenter</dt>
      <dd>${fmtNum(detail.sm_latitude, 4)}, ${fmtNum(detail.sm_longitude, 4)}</dd>
      <dt title="USGS's own reported max PGA (properties.maxpga on the ShakeMap product) - our main source of truth, not the raw maxpga-grid value which can spike unrealistically over an unconstrained rupture">Max PGA, USGS-reported (g)</dt>
      <dd>${fmtNum(detail.sm_max_pga, 3)}</dd>
      <dt title="Reference only: max PGA estimated from on-land 'Did You Feel It?' crowd reports, from our own stationlist.json parsing">Max PGA, on-land DYFI (g)</dt>
      <dd>${fmtNum(detail.sm_max_pga_onland_dyfi, 3)} <span class="empty-note">(${dyfiCount} report(s))</span></dd>
      <dt title="Reference only: max PGA from real on-land seismic instruments in the stationlist, from our own parsing - may be sparse/unrepresentative for remote events">Max PGA, on-land official stations (g)</dt>
      <dd>${fmtNum(detail.sm_max_pga_onland, 3)} <span class="empty-note">(${officialCount} station(s))</span></dd>
      <dt>Max PGV (cm/s)</dt><dd>${fmtNum(detail.sm_max_pgv, 3)}</dd>
      <dt>Map Status</dt><dd>${detail.sm_map_status ?? "-"}</dd>
    </dl>
    ${img}
  `;
}

// beachballSrc, when given, is threaded down to tensorSection() to render a
// static <img> snapshot instead of the live <canvas> - used by the HTML
// export, which can't run drawBeachball() itself once it's a standalone file.
function buildDetailHtml(quake, detail, targetLocation, { beachballSrc, actionsHtml = "" } = {}) {
  const fetchedNote = detail?.detail_fetched_at
    ? `Detail last fetched ${formatDateTime(detail.detail_fetched_at)}`
    : "Detail not yet fetched";

  return `
    <div class="detail-header">
      <div>
        <h2>${quake.place ?? "Unknown location"}</h2>
        <p class="detail-sub">${formatDateTime(quake.time)} &middot; <a href="${quake.url}" target="_blank" rel="noopener">USGS page</a> &middot; <a href="${quake.detail_url}" target="_blank" rel="noopener" title="Raw USGS API JSON for this event">Raw Info</a></p>
      </div>
      <div class="detail-header-actions">${actionsHtml}</div>
    </div>

    <section class="detail-block">
      <h3>Overview</h3>
      <div class="intensity-row">
        ${shindoBadge(detail)}
        ${mmiBadge(detail)}
        ${localEstimateBadges(quake, targetLocation)}
      </div>
      <dl>
        <dt>USGS Event ID</dt><dd>${quake.id ?? "-"}</dd>
        <dt>Magnitude</dt><dd>${fmtNum(quake.mag, 1)} ${quake.mag_type ?? ""}</dd>
        <dt>Depth (km)</dt><dd>${fmtNum(quake.depth, 1)}</dd>
        <dt>Coordinates</dt><dd>${fmtNum(quake.latitude, 4)}, ${fmtNum(quake.longitude, 4)}</dd>
        <dt>MMI</dt><dd title="${fmtNum(detail?.sm_max_mmi, 2)}">${mmiRoman(detail?.sm_max_mmi ?? null)}</dd>
        <dt>Status</dt><dd>${quake.status ?? "-"}</dd>
        <dt>Alert Level</dt><dd>${quake.alert ?? "-"}</dd>
        <dt>Significance</dt><dd>${quake.sig ?? "-"}</dd>
        <dt>Tsunami Flag</dt><dd>${quake.tsunami ? "Yes" : "No"}</dd>
      </dl>
    </section>

    <section class="detail-block">
      <h3>Moment Tensor</h3>
      ${tensorSection(detail, quake, beachballSrc)}
    </section>

    <section class="detail-block">
      <h3>ShakeMap &mdash; Intensity, PGA, PGV</h3>
      ${shakemapSection(detail)}
    </section>

    <p class="fetched-note">${fetchedNote}</p>
  `;
}

function renderDetail(quake, detail, targetLocation) {
  const panel = document.getElementById("detail-panel");
  const actionsHtml = `
    <button id="detail-refresh-btn" title="Force refetch this earthquake's technical data (moment tensor, ShakeMap) from USGS, even if already cached">Re-fetch Technical Data</button>
    <button id="detail-export-btn" title="Save this event's detail view as a standalone, self-contained HTML file (includes the beachball diagram and the raw USGS API response) - works offline, no dependency on this app">Export as HTML</button>
  `;
  panel.innerHTML = buildDetailHtml(quake, detail, targetLocation, { actionsHtml });

  const canvas = document.getElementById("beachball-canvas");
  if (canvas && detail?.has_moment_tensor) {
    Beachball.drawBeachball(
      canvas,
      detail.mt_np1_strike,
      detail.mt_np1_dip,
      detail.mt_np2_strike,
      detail.mt_np2_dip
    );
  }
}

// Collects this page's own CSS rules (skipping cross-origin sheets like
// Leaflet's CDN stylesheet, which throw on .cssRules access due to CORS and
// aren't needed for the detail panel anyway) so the export is fully
// self-contained - no dependency on style.css being alongside it.
function collectPageCss() {
  let css = "";
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) css += rule.cssText + "\n";
    } catch {
      // Cross-origin stylesheet - can't read its rules, skip it.
    }
  }
  return css;
}

function buildRawJsonBlock(quake, detail) {
  const payload = {
    summary: quake.raw_json ? JSON.parse(quake.raw_json) : null,
    momentTensor: detail?.mt_raw_json ? JSON.parse(detail.mt_raw_json) : null,
    shakemap: detail?.sm_raw_json ? JSON.parse(detail.sm_raw_json) : null,
  };
  const json = JSON.stringify(payload, null, 2).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `
    <details class="raw-json-block">
      <summary>Raw USGS API Response (as cached)</summary>
      <pre>${json}</pre>
    </details>
  `;
}

// Builds a complete, standalone HTML document for one earthquake's detail
// view - CSS inlined, beachball baked in as a static image (beachballSrc,
// typically a canvas.toDataURL() snapshot taken by the caller), and the raw
// USGS API response embedded as a collapsible JSON snippet. Local icon
// <img> src paths are left as relative paths here; main.js inlines them as
// data URIs afterward since that requires a fetch() this pure-rendering
// module doesn't otherwise do.
function buildStaticExportHtml(quake, detail, targetLocation, { beachballSrc } = {}) {
  const detailHtml = buildDetailHtml(quake, detail, targetLocation, { beachballSrc });
  const css = collectPageCss();
  const exportedAt = TimeFormat.format(Date.now()) + ` (${TimeFormat.getMode() === "utc" ? "UTC" : "local"})`;
  const title = `${quake.place ?? quake.id ?? "Earthquake"} – Earthquake Detail Export`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
body { max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
.export-note { color: var(--muted); font-size: 0.8rem; margin-bottom: 1.5rem; }
${css}
</style>
</head>
<body>
<p class="export-note">Static export from ppy-eqinfo &mdash; generated ${exportedAt}. Reflects data as cached at export time; USGS may have since revised it.</p>
<div id="detail-panel">
${detailHtml}
</div>
${buildRawJsonBlock(quake, detail)}
</body>
</html>
`;
}

window.EqUi = { renderTable, renderDetail, buildStaticExportHtml };
