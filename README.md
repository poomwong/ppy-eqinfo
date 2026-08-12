# PPY-EQInfo

A personal, client-only earthquake information aggregator. No backend server —
it's a static HTML/CSS/JS page that runs entirely in your browser.

## What it does

- Pulls global M6.0+ earthquakes from the [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/)'s public API and shows them in a sortable, filterable, paginated table plus a Leaflet map.
- Stores everything locally in the browser (IndexedDB, via a real SQLite database compiled to WASM) so data survives reloads without needing a backend — an "Export .sqlite" / "Import .sqlite" pair lets you back up or move that data manually.
- Shows technical detail per earthquake: moment tensor with a rendered beachball diagram and fault-type classification, ShakeMap-derived MMI/PGA/PGV (using USGS's own authoritative values), and a JMA Shindo intensity estimate computed from USGS's reported PGA.
- Lets you look up any specific earthquake by USGS event ID, regardless of magnitude or age.
- Offers an optional, clearly-labeled *magnitude-only* local intensity estimate for a configurable target location (default Bangkok) — restricted to earthquakes sourced in Thailand/Myanmar/Andaman/Arakan, the only regions with a documented tectonic connection to Bangkok — using the Allen, Wald & Worden (2012) Intensity Prediction Equation. This is a rough estimate, not ShakeMap data.
- Exports a single earthquake's detail view as a standalone, self-contained HTML file (beachball baked in as an image, icons inlined, raw USGS API response included as a JSON snippet) that works offline with no dependency on this app.
- "Fetch New" and "Re-fetch All" only cover the past 365 days and are rate-limited client-side (5 min / 15 min cooldowns) to avoid hammering USGS's API.

## Data sources

All earthquake and technical data comes from the public [USGS FDSNWS Event API](https://earthquake.usgs.gov/fdsnws/event/1/). This app does not host, modify, or redistribute USGS data beyond caching it in your own browser for your own use.

## Disclaimer

This is a personal side project, shared as-is with no warranty of any kind. It
is **not** an official earthquake warning, alerting, or monitoring service —
for that, always use USGS, your national meteorological agency, or another
authoritative source. All estimates that are not directly sourced from
USGS ShakeMap (in particular the magnitude-only local intensity estimate) are
rough approximations and are labeled as such in the UI; do not rely on them
for safety decisions.

This project and any hosted deployment of it belong to the author. **You may
not use this app, or any hosted instance of it, to abuse, scrape, or place
excessive load on USGS's or any other third party's services.** The author
is not responsible for any action taken by a client browser running this
code, including but not limited to how it queries third-party APIs — you are
responsible for your own use of it.

## Running it

Open `index.html` directly in a Chromium-based browser, or serve the
directory with any static file server. No build step, no dependencies to
install.
