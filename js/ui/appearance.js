// Workspace appearance picker: theme, background, accent, glass, density.
import { html, mount, on, $ } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { ACCENTS, BACKGROUNDS, getAppearance, setAppearance, backgroundCSS } from "../theme.js";
import { segmented } from "./bits.js";
import { drawer, toast } from "./ui.js";

export function appearanceFields({ compact = false } = {}) {
  const a = getAppearance();
  const custom = a.background === "custom" && a.customImage;
  const busy = a.background === "custom" || !["none", "dots"].includes(a.background);
  return html`<div class="appearance ${compact ? "compact" : ""}">
    <div class="ap-section">
      <div class="ap-head"><h4>Theme</h4></div>
      ${segmented("theme", [
        { value: "light", label: "Light", icon: icon("sun") },
        { value: "dark", label: "Dark", icon: icon("moon") },
        { value: "system", label: "System", icon: icon("monitor") },
      ], a.theme)}
    </div>

    <div class="ap-section">
      <div class="ap-head"><h4>Background</h4><span class="muted-text">Shown behind every page of your workspace</span></div>
      <div class="bg-grid">
        ${BACKGROUNDS.map((b) => html`<button type="button" class="bg-tile ${a.background === b.id ? "active" : ""}" data-bg="${b.id}" aria-pressed="${a.background === b.id}">
          <span class="bg-swatch ${b.animated ? "is-live" : ""}" style="background:${b.id === "none" ? "var(--bg)" : b.css}">${b.animated ? html`<span class="live-tag">Live</span>` : ""}</span>
          <span class="bg-name">${b.name}</span>
        </button>`)}
        <button type="button" class="bg-tile ${a.background === "custom" ? "active" : ""}" data-bg-upload>
          <span class="bg-swatch bg-upload" style="${custom ? `background:${backgroundCSS(a)}` : ""}">${custom ? "" : icon("image")}</span>
          <span class="bg-name">${custom ? "Your image" : "Upload image"}</span>
        </button>
      </div>
      <input type="file" accept="image/*" hidden data-bg-file />
      <div class="ap-row">
        <label class="ap-inline">${icon("link")}<input class="input input-sm" data-bg-url placeholder="…or paste an image URL" value="${a.background === "custom" && !a.customImage.startsWith("data:") ? a.customImage : ""}" /></label>
      </div>
      <div class="ap-row ${busy ? "" : "is-disabled"}">
        <label class="ap-slider"><span>Dim background</span><input type="range" min="0" max="70" step="5" value="${a.dim}" data-dim ${busy ? "" : "disabled"} /><output>${a.dim}%</output></label>
      </div>
    </div>

    <div class="ap-section">
      <div class="ap-head"><h4>Accent</h4></div>
      <div class="accent-row">
        ${ACCENTS.map((c) => html`<button type="button" class="accent-dot ${a.accent === c.id ? "active" : ""}" data-accent="${c.id}" style="--dot:${c.value}" title="${c.name}" aria-label="${c.name}"></button>`)}
      </div>
    </div>

    <div class="ap-section ap-split">
      <div>
        <div class="ap-head"><h4>Surfaces</h4></div>
        ${segmented("glass", [{ value: "on", label: "Frosted" }, { value: "off", label: "Solid" }], a.glass ? "on" : "off")}
      </div>
      <div>
        <div class="ap-head"><h4>Density</h4></div>
        ${segmented("density", [{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }], a.density)}
      </div>
    </div>
  </div>`;
}

// Downscale uploads so they fit comfortably in localStorage / profile prefs.
function readImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 2000;
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * s), height: Math.round(img.height * s) });
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function bindAppearance(container, { onChange, compact } = {}) {
  const rerender = () => {
    mount(container, appearanceFields({ compact }));
    onChange?.(getAppearance());
  };
  const set = (patch) => { setAppearance(patch); rerender(); };

  on(container, "click", "[data-bg]", (e, b) => set({ background: b.dataset.bg }));
  on(container, "click", "[data-accent]", (e, b) => set({ accent: b.dataset.accent }));
  on(container, "click", "[data-seg] .seg-btn", (e, b) => {
    const name = b.closest("[data-seg]").dataset.seg;
    const v = b.dataset.value;
    set({ [name]: name === "glass" ? v === "on" : v });
  });
  on(container, "click", "[data-bg-upload]", () => $("[data-bg-file]", container).click());
  on(container, "change", "[data-bg-file]", async (e, input) => {
    const file = input.files[0];
    if (!file) return;
    try {
      set({ background: "custom", customImage: await readImage(file), dim: Math.max(getAppearance().dim, 20) });
    } catch {
      toast("That image couldn't be read.", { type: "error" });
    }
  });
  on(container, "change", "[data-bg-url]", (e, input) => {
    const url = input.value.trim();
    if (!url) return;
    if (!/^https:\/\//i.test(url)) return toast("Use an https:// image URL.", { type: "error" });
    set({ background: "custom", customImage: url, dim: Math.max(getAppearance().dim, 20) });
  });
  on(container, "input", "[data-dim]", (e, input) => {
    setAppearance({ dim: +input.value });
    input.nextElementSibling.textContent = input.value + "%";
  });
  mount(container, appearanceFields({ compact }));
}

export function openAppearanceDrawer() {
  const d = drawer({
    title: "Appearance",
    subtitle: "Make the workspace yours. Saved to your profile.",
    size: "sm",
    body: html`<div data-ap></div>`,
    footer: html`<button class="btn btn-ghost" data-reset>Reset to default</button><button class="btn btn-primary" data-close>Done</button>`,
  });
  const box = $("[data-ap]", d.el);
  bindAppearance(box, { compact: true });
  $("[data-reset]", d.el).onclick = () => {
    setAppearance({ theme: "light", accent: "mint", background: "none", customImage: "", dim: 25, glass: true, density: "comfortable" });
    mount(box, appearanceFields({ compact: true }));
  };
}
