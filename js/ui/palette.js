// ⌘K command palette: navigate, create, search people/tasks/boards.
import { html, mount, $, $$, avatar } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { app, isDone } from "../app.js";
import { go } from "../router.js";
import { modal } from "./ui.js";
import { openAppearanceDrawer } from "./appearance.js";
import { setAppearance, resolvedTheme } from "../theme.js";
import { openEmployeeForm, openTaskModal, openBoardForm, quickTask } from "../views/modals.js";

function commands() {
  const nav = [
    ["Home", "home", "#/app/home"],
    ["My tasks", "tasks", "#/app/tasks"],
    ["Boards", "board", "#/app/boards"],
    ["People", "users", "#/app/people"],
    app.can("automations.view") && ["Automations", "zap", "#/app/automations"],
    ["Files", "folder", "#/app/files"],
    app.can("integrations.manage") && ["Slack", "hash", "#/app/slack"],
    ["Settings", "sliders", "#/app/settings"],
  ].filter(Boolean).map(([label, ic, href]) => ({ group: "Go to", label, icon: ic, run: () => go(href) }));

  const actions = [
    app.can("tasks.create") && { label: "New task", icon: "plus", hint: "N", run: () => quickTask() },
    app.can("people.manage") && { label: "Add employee", icon: "userPlus", run: () => openEmployeeForm() },
    app.can("boards.manage") && { label: "New board", icon: "board", run: () => openBoardForm() },
    { label: "Change background", icon: "image", run: () => openAppearanceDrawer() },
    { label: resolvedTheme() === "dark" ? "Switch to light mode" : "Switch to dark mode", icon: resolvedTheme() === "dark" ? "sun" : "moon", run: () => setAppearance({ theme: resolvedTheme() === "dark" ? "light" : "dark" }) },
  ].filter(Boolean).map((a) => ({ ...a, group: "Actions" }));

  const people = app.data.employees.map((e) => ({
    group: "People", label: e.full_name, sub: [e.title, e.department].filter(Boolean).join(" · "), avatar: e.full_name,
    keywords: `${e.email} ${e.department} ${e.title}`, run: () => go(`#/app/people/${e.id}`),
  }));
  const boards = app.data.boards.map((b) => ({ group: "Boards", label: b.name, icon: "board", run: () => go(`#/app/boards/${b.id}`) }));
  const tasks = app.data.tasks.map((t) => ({
    group: "Tasks", label: t.title, sub: app.board(t.board_id)?.name, icon: isDone(t) ? "circleCheck" : "circle",
    keywords: (t.labels || []).join(" "), run: () => openTaskModal(t),
  }));
  return { base: [...actions, ...nav], all: [...actions, ...nav, ...people, ...boards, ...tasks] };
}

function score(item, q) {
  const hay = `${item.label} ${item.sub || ""} ${item.keywords || ""}`.toLowerCase();
  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 3;
  if (label.includes(q)) return 2;
  return q.split(/\s+/).every((w) => hay.includes(w)) ? 1 : 0;
}

export function openPalette() {
  if (!app.org || document.querySelector(".palette")) return;
  const { base, all } = commands();
  let results = base;
  let active = 0;

  const m = modal({
    size: "palette",
    className: "palette",
    body: html`<div class="palette-input">${icon("search")}<input placeholder="Search people, tasks, boards or type a command…" autofocus /><kbd>esc</kbd></div><div class="palette-list" role="listbox"></div>`,
  });
  const input = $("input", m.el);
  const list = $(".palette-list", m.el);

  function draw() {
    if (!results.length) return mount(list, html`<div class="palette-empty">No matches</div>`);
    let lastGroup = null;
    mount(list, html`${results.slice(0, 40).map((r, i) => {
      const head = r.group !== lastGroup ? html`<div class="palette-group">${r.group}</div>` : "";
      lastGroup = r.group;
      return html`${head}<button class="palette-item ${i === active ? "active" : ""}" data-i="${i}" role="option">
        ${r.avatar ? avatar(r.avatar, "sm") : icon(r.icon)}
        <span class="palette-label">${r.label}</span>
        ${r.sub ? html`<span class="palette-sub">${r.sub}</span>` : ""}
        ${r.hint ? html`<kbd>${r.hint}</kbd>` : ""}
      </button>`;
    })}`);
    $(".palette-item.active", list)?.scrollIntoView({ block: "nearest" });
  }

  const run = (i) => {
    const r = results[i];
    if (!r) return;
    m.close();
    setTimeout(r.run, 10);
  };

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    results = q ? all.map((r) => [r, score(r, q)]).filter(([, s]) => s).sort((a, b) => b[1] - a[1]).map(([r]) => r) : base;
    active = 0;
    draw();
  });
  input.addEventListener("keydown", (e) => {
    const n = Math.min(results.length, 40);
    if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % n; draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + n) % n; draw(); }
    else if (e.key === "Enter") { e.preventDefault(); run(active); }
  });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (b) run(+b.dataset.i);
  });
  list.addEventListener("mousemove", (e) => {
    const b = e.target.closest("[data-i]");
    if (b && +b.dataset.i !== active) {
      $$(".palette-item", list).forEach((x) => x.classList.toggle("active", x === b));
      active = +b.dataset.i;
    }
  });
  draw();
}
