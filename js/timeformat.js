let mode = "utc"; // "utc" | "local" - display only; everything is stored in UTC.

function formatUtc(d) {
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
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
    timeZoneName: "short",
  }).format(d);
}

function format(ms) {
  if (ms === null || ms === undefined) return "-";
  const d = new Date(ms);
  return mode === "utc" ? formatUtc(d) : formatLocal(d);
}

function toggle() {
  mode = mode === "utc" ? "local" : "utc";
  return mode;
}

function getMode() {
  return mode;
}

window.TimeFormat = { format, toggle, getMode };
