// Toasts, modals, drawers, confirm dialogs and popover menus.
import { html, mount, $, esc } from "../lib/dom.js";
import { icon } from "../lib/icons.js";

// ---------- toast ----------
let toastRoot;
export function toast(message, { type = "info", action, duration = 3800 } = {}) {
  toastRoot ||= document.body.appendChild(Object.assign(document.createElement("div"), { className: "toasts", role: "status" }));
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  const ic = type === "success" ? "circleCheck" : type === "error" ? "alert" : "circle";
  mount(el, html`${icon(ic)}<span>${message}</span>${action ? html`<button class="toast-action">${action.label}</button>` : ""}`);
  if (action) el.querySelector(".toast-action").onclick = () => { action.fn(); dismiss(); };
  toastRoot.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  const dismiss = () => { el.classList.remove("in"); setTimeout(() => el.remove(), 250); };
  setTimeout(dismiss, duration);
}

export const toastError = (err) => toast(err?.message || String(err), { type: "error", duration: 6000 });

// ---------- modal & drawer ----------
const stack = [];

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && stack.length) {
    e.preventDefault();
    stack[stack.length - 1].close();
  }
});

export function modal({ title, subtitle, body, footer, size = "md", kind = "modal", onClose, className = "" }) {
  const layer = document.createElement("div");
  layer.className = `layer layer-${kind}`;
  mount(layer, html`
    <div class="scrim" data-close></div>
    <section class="${kind} ${kind}-${size} ${className}" role="dialog" aria-modal="true" aria-label="${title || ""}">
      ${title ? html`<header class="dialog-head">
        <div><h2 class="dialog-title">${title}</h2>${subtitle ? html`<p class="dialog-sub">${subtitle}</p>` : ""}</div>
        <button class="icon-btn" data-close aria-label="Close">${icon("x")}</button>
      </header>` : ""}
      <div class="dialog-body">${body}</div>
      ${footer ? html`<footer class="dialog-foot">${footer}</footer>` : ""}
    </section>`);
  document.body.appendChild(layer);
  const prevFocus = document.activeElement;
  requestAnimationFrame(() => {
    layer.classList.add("in");
    const first = layer.querySelector("[autofocus], input:not([type=hidden]), textarea, select, button:not([data-close])");
    first?.focus({ preventScroll: true });
  });

  const entry = {
    el: layer,
    panel: layer.querySelector(`.${kind}`),
    close() {
      const i = stack.indexOf(entry);
      if (i === -1) return;
      stack.splice(i, 1);
      layer.classList.remove("in");
      setTimeout(() => layer.remove(), 220);
      prevFocus?.focus?.({ preventScroll: true });
      onClose?.();
    },
  };
  layer.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) entry.close(); });
  stack.push(entry);
  return entry;
}

export const drawer = (opts) => modal({ ...opts, kind: "drawer" });

export function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal({
      title,
      size: "sm",
      body: html`<p class="muted-text">${message}</p>`,
      footer: html`<button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok>${confirmLabel}</button>`,
      onClose: () => !answered && resolve(false),
    });
    const ok = $("[data-ok]", m.el);
    ok.focus();
    ok.onclick = () => { answered = true; resolve(true); m.close(); };
  });
}

// ---------- popover menu ----------
let openMenu = null;
export function closeMenu() { openMenu?.remove(); openMenu = null; }

document.addEventListener("pointerdown", (e) => {
  if (openMenu && !openMenu.contains(e.target) && !e.target.closest("[data-menu-anchor]")) closeMenu();
});
window.addEventListener("resize", closeMenu);

export function menu(anchor, items, { align = "start", width } = {}) {
  if (openMenu && openMenu._anchor === anchor) return closeMenu();
  closeMenu();
  const el = document.createElement("div");
  el.className = "menu";
  el._anchor = anchor;
  if (width) el.style.width = width + "px";
  mount(el, html`${items.map((it, i) => {
    if (it === "-" ) return html`<div class="menu-sep"></div>`;
    if (it.heading) return html`<div class="menu-heading">${it.heading}</div>`;
    return html`<button class="menu-item ${it.danger ? "danger" : ""} ${it.active ? "active" : ""}" data-i="${i}" ${it.disabled ? "disabled" : ""}>
      ${it.icon ? icon(it.icon) : it.swatch ? html`<span class="menu-swatch" style="background:${it.swatch}"></span>` : it.avatar || ""}
      <span class="menu-label">${it.label}</span>
      ${it.hint ? html`<span class="menu-hint">${it.hint}</span>` : ""}
      ${it.active ? icon("check", "menu-check") : ""}
    </button>`;
  })}`);
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const mw = el.offsetWidth, mh = el.offsetHeight;
  let left = align === "end" ? r.right - mw : r.left;
  let top = r.bottom + 6;
  if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  left = Math.min(Math.max(8, left), innerWidth - mw - 8);
  Object.assign(el.style, { left: left + "px", top: top + "px" });
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    const it = items[+b.dataset.i];
    closeMenu();
    it.onClick?.();
  });
  requestAnimationFrame(() => el.classList.add("in"));
  openMenu = el;
}

// ---------- misc ----------
export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${label ? esc(label) : btn.innerHTML}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

export function emptyState({ icon: ic = "inbox", title, text, action }) {
  return html`<div class="empty">
    <div class="empty-icon">${icon(ic)}</div>
    <h3>${title}</h3>
    ${text ? html`<p>${text}</p>` : ""}
    ${action || ""}
  </div>`;
}
