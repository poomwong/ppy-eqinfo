const MODE_COOKIE = "eqinfo_time_mode";

function readCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}`;
}

// "utc" | "local" - display only; everything is stored in UTC. Remembered
// across sessions via a cookie so the toggle doesn't have to be re-clicked
// every time the page is opened.
let mode = readCookie(MODE_COOKIE) === "local" ? "local" : "utc";

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
  writeCookie(MODE_COOKIE, mode, 365);
  return mode;
}

function getMode() {
  return mode;
}

window.TimeFormat = { format, toggle, getMode };
