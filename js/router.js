// Hash router — works on GitHub Pages without server rewrites.
let handler = () => {};

export const setRouteHandler = (fn) => (handler = fn);

export function parseHash() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [p, q = ""] = h.split("?");
  const parts = p.split("/").filter(Boolean).map(decodeURIComponent);
  return { parts, query: Object.fromEntries(new URLSearchParams(q)) };
}

export function go(hash, { replace = false } = {}) {
  if (location.hash === hash || (hash === "#/" && !location.hash)) return handler();
  if (replace) {
    history.replaceState(null, "", location.pathname + location.search + hash);
    handler();
  } else {
    location.hash = hash;
  }
}

// Update the URL without re-rendering (e.g. closing a deep-linked drawer).
export function setHashSilently(hash) {
  history.replaceState(null, "", location.pathname + location.search + hash);
}
