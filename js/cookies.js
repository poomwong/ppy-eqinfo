// Tiny key/value persistence helpers shared by timeformat.js (display mode)
// and main.js (target location) - the only two places that persist a UI
// preference client-side. Backed by localStorage rather than document.cookie:
// cookies are unreliable when the app is opened directly as a file:// page
// (Chrome scopes/evicts them inconsistently there), while localStorage
// persists correctly under both file:// and normal http(s) hosting.

function readCookie(name) {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

function writeCookie(name, value) {
  try {
    window.localStorage.setItem(name, value);
  } catch {
    // Storage unavailable (private browsing, disabled storage, etc.) - the
    // preference just won't persist across reloads; nothing else to do.
  }
}

window.Cookies = { readCookie, writeCookie };
