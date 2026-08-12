function formatDateTime(ms) {
  if (ms === null || ms === undefined) return "-";
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function fmtNum(v, digits = 2) {
  return v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toFixed(digits);
}

function fmtExp(v) {
  return v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toExponential(3);
}

function renderTable(quakes, onSelect) {
  const tbody = document.getElementById("eq-table-body");
  tbody.innerHTML = "";
  quakes.forEach((q) => {
    const tr = document.createElement("tr");
    tr.dataset.id = q.id;
    const magClass = q.mag >= 7.0 ? "mag-cell mag-high" : "mag-cell";
    tr.innerHTML = `
      <td>${formatDateTime(q.time)}</td>
      <td>${fmtNum(q.latitude, 3)}, ${fmtNum(q.longitude, 3)}</td>
      <td class="${magClass}">${fmtNum(q.mag, 1)}</td>
      <td>${q.place ?? "Unknown"}</td>
      <td><a href="${q.url}" target="_blank" rel="noopener" class="row-link">USGS &rarr;</a></td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".row-link")) return;
      onSelect(q.id);
    });
    tbody.appendChild(tr);
  });
}

function tensorSection(detail) {
  if (!detail || !detail.has_moment_tensor) {
    return `<p class="empty-note">No moment tensor solution available for this event.</p>`;
  }
  return `
    <div class="grid-2">
      <div>
        <h4>Nodal Plane 1</h4>
        <dl>
          <dt>Strike</dt><dd>${fmtNum(detail.mt_np1_strike)}&deg;</dd>
          <dt>Dip</dt><dd>${fmtNum(detail.mt_np1_dip)}&deg;</dd>
          <dt>Rake</dt><dd>${fmtNum(detail.mt_np1_rake)}&deg;</dd>
        </dl>
      </div>
      <div>
        <h4>Nodal Plane 2</h4>
        <dl>
          <dt>Strike</dt><dd>${fmtNum(detail.mt_np2_strike)}&deg;</dd>
          <dt>Dip</dt><dd>${fmtNum(detail.mt_np2_dip)}&deg;</dd>
          <dt>Rake</dt><dd>${fmtNum(detail.mt_np2_rake)}&deg;</dd>
        </dl>
      </div>
    </div>
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
  `;
}

function shakemapSection(detail) {
  if (!detail || !detail.has_shakemap) {
    return `<p class="empty-note">No ShakeMap available for this event.</p>`;
  }
  const img = detail.sm_intensity_image_url
    ? `<img class="shakemap-img" src="${detail.sm_intensity_image_url}" alt="ShakeMap intensity" loading="lazy">`
    : "";
  return `
    <dl>
      <dt>Max Intensity (MMI)</dt><dd>${fmtNum(detail.sm_max_mmi, 1)}</dd>
      <dt>Max PGA (%g)</dt><dd>${fmtNum(detail.sm_max_pga, 3)}</dd>
      <dt>Max PGV (cm/s)</dt><dd>${fmtNum(detail.sm_max_pgv, 3)}</dd>
      <dt>Version</dt><dd>${detail.sm_version ?? "-"}</dd>
      <dt>Map Status</dt><dd>${detail.sm_map_status ?? "-"}</dd>
    </dl>
    ${img}
  `;
}

function renderDetail(quake, detail) {
  const panel = document.getElementById("detail-panel");
  const fetchedNote = detail?.detail_fetched_at
    ? `Detail last fetched ${formatDateTime(detail.detail_fetched_at)}`
    : "Detail not yet fetched";

  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <h2>${quake.place ?? "Unknown location"}</h2>
        <p class="detail-sub">${formatDateTime(quake.time)} &middot; <a href="${quake.url}" target="_blank" rel="noopener">USGS page</a></p>
      </div>
      <button id="detail-refresh-btn" title="Force refetch this earthquake's detail data">Refresh this earthquake</button>
    </div>

    <section class="detail-block">
      <h3>Overview</h3>
      <dl>
        <dt>Magnitude</dt><dd>${fmtNum(quake.mag, 1)} ${quake.mag_type ?? ""}</dd>
        <dt>Depth (km)</dt><dd>${fmtNum(quake.depth, 1)}</dd>
        <dt>Coordinates</dt><dd>${fmtNum(quake.latitude, 4)}, ${fmtNum(quake.longitude, 4)}</dd>
        <dt>Status</dt><dd>${quake.status ?? "-"}</dd>
        <dt>Alert Level</dt><dd>${quake.alert ?? "-"}</dd>
        <dt>Significance</dt><dd>${quake.sig ?? "-"}</dd>
        <dt>Tsunami Flag</dt><dd>${quake.tsunami ? "Yes" : "No"}</dd>
      </dl>
    </section>

    <section class="detail-block">
      <h3>Moment Tensor</h3>
      ${tensorSection(detail)}
    </section>

    <section class="detail-block">
      <h3>ShakeMap &mdash; Intensity, PGA, PGV</h3>
      ${shakemapSection(detail)}
    </section>

    <p class="fetched-note">${fetchedNote}</p>
  `;
}

window.EqUi = { renderTable, renderDetail, formatDateTime };
