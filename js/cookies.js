// Tiny cookie read/write helpers shared by timeformat.js (display mode) and
// main.js (target location) - the only two places that persist a UI
// preference client-side.

function readCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}`;
}

window.Cookies = { readCookie, writeCookie };
