// Appearance: theme, accent, workspace background, glass, density.
// Stored in localStorage immediately and synced to the user's profile.

const KEY = "myhr:appearance";

// `ink` is the text color that sits on top of the accent.
export const ACCENTS = [
  { id: "mint", name: "Mint", value: "#9bd8a9", ink: "#030302" },
  { id: "butter", name: "Butter", value: "#f3d37a", ink: "#030302" },
  { id: "sky", name: "Sky", value: "#9cc7f2", ink: "#030302" },
  { id: "blush", name: "Blush", value: "#f2b3a8", ink: "#030302" },
  { id: "lilac", name: "Lilac", value: "#c5b6f0", ink: "#030302" },
  { id: "ink", name: "Ink", value: "#030302", ink: "#ffffff" },
];

// `tone` says which theme the background reads best with (used as the auto theme hint).
const topo = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'><g fill='none' stroke='#ffffff' stroke-opacity='.13' stroke-width='1.2'>${Array.from(
    { length: 14 },
    (_, i) =>
      `<path d='M-50 ${40 + i * 44} C 120 ${-10 + i * 44}, 220 ${110 + i * 44}, 330 ${50 + i * 44} S 540 ${-20 + i * 44}, 660 ${60 + i * 44}'/>`
  ).join("")}</g></svg>`
);

export const BACKGROUNDS = [
  { id: "none", name: "Plain", group: "Solid", tone: "any", css: "var(--bg)" },
  { id: "dots", name: "Dot grid", group: "Pattern", tone: "any", css: "radial-gradient(circle at 1px 1px, var(--pattern) 1px, transparent 0) 0 0/22px 22px, var(--bg)" },
  { id: "blueprint", name: "Blueprint", group: "Pattern", tone: "dark",
    css: "linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px) 0 0/32px 32px, linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px) 0 0/32px 32px, linear-gradient(160deg,#15294d,#0d1a33)" },
  { id: "dusk", name: "Dusk", group: "Gradient", tone: "dark", css: "linear-gradient(165deg,#221f33 0%,#5b3d5e 48%,#d38c73 100%)" },
  { id: "lagoon", name: "Lagoon", group: "Gradient", tone: "dark", css: "linear-gradient(160deg,#0b2f3a 0%,#1f6b6b 55%,#9cc9b4 100%)" },
  { id: "ember", name: "Ember", group: "Gradient", tone: "dark", css: "linear-gradient(160deg,#2a1512 0%,#8f3a22 55%,#eab27d 100%)" },
  { id: "moss", name: "Moss", group: "Gradient", tone: "dark", css: "linear-gradient(160deg,#1a211a 0%,#435c38 55%,#c8cf9f 100%)" },
  { id: "fog", name: "Fog", group: "Gradient", tone: "light", css: "linear-gradient(160deg,#e9ecef 0%,#f3ede4 60%,#efe3d6 100%)" },
  { id: "peach", name: "Sorbet", group: "Gradient", tone: "light", css: "linear-gradient(135deg,#fde4d3 0%,#f6d3e2 50%,#d9dcf5 100%)" },
  { id: "aurora", name: "Aurora", group: "Live", tone: "dark", animated: true,
    css: "radial-gradient(60% 50% at 20% 20%, #2e6f73 0%, transparent 60%), radial-gradient(50% 60% at 80% 30%, #6a3f86 0%, transparent 60%), radial-gradient(60% 60% at 50% 100%, #b4553a 0%, transparent 60%), #0f1116" },
  { id: "topo", name: "Contours", group: "Live", tone: "dark", animated: true,
    css: `url("data:image/svg+xml,${topo}") 0 0/600px 600px, linear-gradient(160deg,#1c2430,#2c2236)` },
];

export const DEFAULTS = { theme: "light", accent: "mint", background: "none", customImage: "", dim: 25, glass: true, density: "comfortable" };

let current = load();
const listeners = new Set();

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export const getAppearance = () => ({ ...current });
export const onAppearance = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export function setAppearance(patch, { silent = false } = {}) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Quota exceeded (usually a large custom image) — keep it in memory only.
  }
  applyAppearance();
  if (!silent) listeners.forEach((fn) => fn(current));
}

const media = matchMedia("(prefers-color-scheme: dark)");
media.addEventListener?.("change", () => applyAppearance());

export function resolvedTheme(a = current) {
  if (a.theme === "light" || a.theme === "dark") return a.theme;
  return media.matches ? "dark" : "light";
}

export function backgroundCSS(a = current) {
  if (a.background === "custom" && a.customImage) return `center/cover no-repeat url("${a.customImage.replace(/"/g, "%22")}"), var(--bg)`;
  return (BACKGROUNDS.find((b) => b.id === a.background) || BACKGROUNDS[1]).css;
}

export function applyAppearance(a = current) {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(a);
  const accent = ACCENTS.find((x) => x.id === a.accent) || ACCENTS[0];
  root.style.setProperty("--accent", accent.value);
  root.style.setProperty("--accent-ink", accent.ink);
  root.dataset.density = a.density;
  root.dataset.glass = a.glass ? "on" : "off";
  const bg = BACKGROUNDS.find((b) => b.id === a.background);
  const busy = a.background === "custom" || (bg && bg.group !== "Solid" && bg.group !== "Pattern") || a.background === "blueprint";
  root.dataset.canvas = busy ? "busy" : "calm";
  root.style.setProperty("--canvas", backgroundCSS(a));
  root.style.setProperty("--canvas-dim", String((busy ? a.dim : 0) / 100));
  root.dataset.anim = bg?.animated ? bg.id : "";
}
