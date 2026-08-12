// UTC/local display toggle, cookie-persisted. Data is always stored and
// fetched in UTC (see db.js/usgs.js) - this only affects how timestamps
// are formatted for display, used by the table, detail view, and map.

const MODE_COOKIE = "eqinfo_time_mode";

// "utc" | "local" - display only; everything is stored in UTC. Remembered
// across sessions via a cookie so the toggle doesn't have to be re-clicked
// every time the page is opened.
let mode = Cookies.readCookie(MODE_COOKIE) === "local" ? "local" : "utc";

// No timezone suffix in either mode - the column header already states
// which one is active, so repeating it on every row is just noise.
function formatUtc(d) {
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

function formatLocal(d) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function format(ms) {
  if (ms === null || ms === undefined) return "-";
  const d = new Date(ms);
  return mode === "utc" ? formatUtc(d) : formatLocal(d);
}

function toggle() {
  mode = mode === "utc" ? "local" : "utc";
  Cookies.writeCookie(MODE_COOKIE, mode, 365);
  return mode;
}

function getMode() {
  return mode;
}

window.TimeFormat = { format, toggle, getMode };
