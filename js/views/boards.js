// Boards list + kanban with drag and drop.
import { html, on, $, $$, avatar, debounce } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { app, refresh, isDone } from "../app.js";
import { go } from "../router.js";
import { menu, toast, toastError, confirmDialog, emptyState } from "../ui/ui.js";
import { priorityMark, dueChip, labelChips } from "../ui/bits.js";
import { openTaskModal, openBoardForm } from "./modals.js";

export const title = "Boards";
export const crumb = (params) => (params[0] && app.board(params[0])?.name) || "Boards";

const filters = { q: "", assignee: "", composer: null };

function card(t) {
  const who = app.emp(t.assignee_id);
  const checks = t.checklist?.length ? t.checklist.filter((c) => c.done).length : 0;
  const draggable = app.canEditTask(t);
  return html`<article class="k-card ${isDone(t) ? "is-done" : ""}" data-card="${t.id}" draggable="${draggable}" tabindex="0">
    ${t.labels?.length ? html`<div class="k-labels">${labelChips(t.labels.slice(0, 3))}</div>` : ""}
    <p class="k-title">${t.title}</p>
    ${t.checklist?.length ? html`<span class="progress thin"><span style="width:${(checks / t.checklist.length) * 100}%"></span></span>` : ""}
    <footer class="k-foot">
      ${priorityMark(t.priority)}
      ${dueChip(t)}
      ${t.source === "automation" ? html`<span class="meta-ic" title="Created by automation">${icon("zap")}</span>` : ""}
      ${t.checklist?.length ? html`<span class="meta-ic">${icon("listChecks")}${checks}/${t.checklist.length}</span>` : ""}
      <span class="spacer"></span>
      ${who ? avatar(who.full_name, "xs") : ""}
    </footer>
  </article>`;
}

function boardList() {
  return html`<header class="page-head"><div><h1 class="serif">Boards</h1><p class="page-sub">Organize work the way your team thinks about it.</p></div>
    <div class="page-actions">${app.can("boards.manage") ? html`<button class="btn btn-primary" data-new-board>${icon("plus")}New board</button>` : ""}</div></header>
    ${app.data.boards.length ? html`<div class="board-grid">${app.data.boards.map((b) => {
      const tasks = app.data.tasks.filter((t) => t.board_id === b.id);
      const done = tasks.filter(isDone).length;
      const people = [...new Set(tasks.map((t) => t.assignee_id).filter(Boolean))].slice(0, 4).map((id) => app.emp(id)).filter(Boolean);
      return html`<a class="board-tile" href="#/app/boards/${b.id}" style="--c:${b.color}">
        <span class="board-tile-band"></span>
        <strong class="serif">${b.name}</strong>
        <p>${b.description || "No description"}</p>
        <footer><span>${tasks.length - done} open · ${done} done</span><span class="avatars">${people.map((p) => avatar(p.full_name, "xs"))}</span></footer>
      </a>`;
    })}</div>` : html`<section class="card">${emptyState({ icon: "board", title: "No boards yet", text: "Create a board to start tracking work." })}</section>`}`;
}

export function render(params) {
  const board = params[0] && app.board(params[0]);
  if (!board) return boardList();
  const cols = app.columnsOf(board.id);
  const q = filters.q.toLowerCase();
  const tasks = app.data.tasks.filter((t) => t.board_id === board.id)
    .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.labels || []).some((l) => l.includes(q)))
    .filter((t) => !filters.assignee || (filters.assignee === "me" ? t.assignee_id === app.me?.id : t.assignee_id === filters.assignee));
  const assignees = [...new Set(app.data.tasks.filter((t) => t.board_id === board.id).map((t) => t.assignee_id).filter(Boolean))].map((id) => app.emp(id)).filter(Boolean);

  return html`
    <header class="page-head board-head">
      <div>
        <h1 class="serif"><span class="board-dot lg" style="--c:${board.color}"></span>${board.name}</h1>
        ${board.description ? html`<p class="page-sub">${board.description}</p>` : ""}
      </div>
      <div class="page-actions">
        <label class="search-input">${icon("search")}<input data-filter-q placeholder="Filter cards" value="${filters.q}" /></label>
        <select class="input input-sm" data-filter-assignee>
          <option value="">Everyone</option>
          <option value="me" ${filters.assignee === "me" ? "selected" : ""}>Assigned to me</option>
          ${assignees.map((e) => html`<option value="${e.id}" ${filters.assignee === e.id ? "selected" : ""}>${e.full_name}</option>`)}
        </select>
        ${app.can("boards.manage") ? html`<button class="icon-btn bordered" data-board-settings aria-label="Board settings">${icon("sliders")}</button>` : ""}
      </div>
    </header>
    <div class="kanban" data-keep-scroll="kanban">
      ${cols.map((c) => {
        const items = tasks.filter((t) => t.column_id === c.id).sort((a, b) => a.position - b.position);
        return html`<section class="k-col ${c.is_done ? "is-done-col" : ""}" data-col="${c.id}">
          <header class="k-col-head">
            <h3>${c.is_done ? icon("circleCheck") : ""}${c.name}</h3><span class="count">${items.length}</span>
            <span class="spacer"></span>
            ${app.can("boards.manage") ? html`<button class="icon-btn xs" data-col-menu="${c.id}" data-menu-anchor aria-label="Column options">${icon("more")}</button>` : ""}
          </header>
          <div class="k-list" data-drop="${c.id}">${items.map(card)}</div>
          ${app.can("tasks.create") ? (filters.composer === c.id
            ? html`<form class="k-composer" data-composer="${c.id}"><textarea class="input" rows="2" placeholder="Card title — Enter to add" maxlength="200"></textarea>
                <div><button class="btn btn-primary btn-sm" type="submit">Add card</button><button class="icon-btn" type="button" data-cancel-composer>${icon("x")}</button></div></form>`
            : html`<button class="k-add" data-open-composer="${c.id}">${icon("plus")}Add card</button>`) : ""}
        </section>`;
      })}
      ${app.can("boards.manage") ? html`<button class="k-col k-col-new" data-add-col>${icon("plus")}Add column</button>` : ""}
    </div>`;
}

export function bind(root, params) {
  if (!params[0] || !app.board(params[0])) {
    if (params[0]) go("#/app/boards", { replace: true });
    on(root, "click", "[data-new-board]", () => openBoardForm());
    return;
  }
  const board = app.board(params[0]);

  on(root, "input", "[data-filter-q]", debounce((e) => { filters.q = e.target.value; app.rerender({ force: true }); $("[data-filter-q]", document)?.focus(); const i = $("[data-filter-q]"); i?.setSelectionRange(i.value.length, i.value.length); }, 200));
  on(root, "change", "[data-filter-assignee]", (e, s) => { filters.assignee = s.value; app.rerender({ force: true }); });
  on(root, "click", "[data-board-settings]", () => openBoardForm(board));
  on(root, "click", "[data-card]", (e, el) => openTaskModal(app.data.tasks.find((t) => t.id === el.dataset.card)));
  on(root, "keydown", "[data-card]", (e, el) => { if (e.key === "Enter") el.click(); });

  // Composer
  on(root, "click", "[data-open-composer]", (e, b) => { filters.composer = b.dataset.openComposer; app.rerender({ force: true }); $(`[data-composer="${filters.composer}"] textarea`)?.focus(); });
  on(root, "click", "[data-cancel-composer]", () => { filters.composer = null; app.rerender({ force: true }); });
  const addCard = async (form) => {
    const ta = $("textarea", form);
    const title = ta.value.trim();
    if (!title) return;
    ta.value = "";
    try {
      await app.backend.createTask(app.org.id, { column_id: form.dataset.composer, title, assignee_id: filters.assignee === "me" ? app.me?.id : null });
      await refresh(["tasks", "activity"]);
      $(`[data-composer="${form.dataset.composer}"] textarea`)?.focus();
    } catch (err) { toastError(err); }
  };
  on(root, "submit", "[data-composer]", (e, f) => { e.preventDefault(); addCard(f); });
  on(root, "keydown", "[data-composer] textarea", (e, ta) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addCard(ta.form); }
    if (e.key === "Escape") { e.stopPropagation(); filters.composer = null; app.rerender({ force: true }); }
  });

  // Columns
  on(root, "click", "[data-add-col]", async () => {
    const name = prompt("Column name");
    if (!name?.trim()) return;
    try { await app.backend.createColumn(app.org.id, board.id, { name: name.trim() }); await refresh(["columns"]); } catch (err) { toastError(err); }
  });
  on(root, "click", "[data-col-menu]", (e, b) => {
    const col = app.column(b.dataset.colMenu);
    const cols = app.columnsOf(board.id);
    const i = cols.indexOf(col);
    const move = async (dir) => {
      const other = cols[i + dir];
      if (!other) return;
      await app.backend.updateColumn(col.id, { position: other.position });
      await app.backend.updateColumn(other.id, { position: col.position });
      refresh(["columns"]);
    };
    menu(b, [
      { label: "Rename", icon: "pencil", onClick: async () => { const n = prompt("Rename column", col.name); if (n?.trim()) { await app.backend.updateColumn(col.id, { name: n.trim() }).catch(toastError); refresh(["columns"]); } } },
      { label: col.is_done ? "Unmark as Done column" : "Mark as Done column", icon: "circleCheck", onClick: async () => { await app.backend.updateColumn(col.id, { is_done: !col.is_done }).catch(toastError); refresh(["columns", "tasks"]); } },
      i > 0 && { label: "Move left", icon: "chevronLeft", onClick: () => move(-1) },
      i < cols.length - 1 && { label: "Move right", icon: "chevronRight", onClick: () => move(1) },
      "-",
      { label: "Delete column", icon: "trash", danger: true, onClick: async () => {
        const n = app.data.tasks.filter((t) => t.column_id === col.id).length;
        if (!(await confirmDialog({ title: `Delete "${col.name}"?`, message: n ? `Its ${n} cards will be deleted too.` : "This column is empty.", confirmLabel: "Delete", danger: true }))) return;
        await app.backend.deleteColumn(col.id).catch(toastError);
        refresh(["columns", "tasks"]);
      } },
    ].filter(Boolean), { align: "end" });
  });

  // Drag and drop
  let dragId = null;
  on(root, "dragstart", "[data-card]", (e, el) => {
    dragId = el.dataset.card;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
    document.body.classList.add("is-dragging");
    requestAnimationFrame(() => el.classList.add("ghost"));
  });
  root.addEventListener("dragend", () => {
    document.body.classList.remove("is-dragging");
    $$(".ghost, .drop-target", root).forEach((x) => x.classList.remove("ghost", "drop-target"));
    $(".drop-marker", root)?.remove();
  });
  const marker = Object.assign(document.createElement("div"), { className: "drop-marker" });
  const afterEl = (list, y) => $$("[data-card]:not(.ghost)", list).find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
  on(root, "dragover", "[data-col]", (e, col) => {
    if (!dragId) return;
    e.preventDefault();
    const list = $("[data-drop]", col);
    $$(".drop-target", root).forEach((x) => x !== col && x.classList.remove("drop-target"));
    col.classList.add("drop-target");
    const next = afterEl(list, e.clientY);
    next ? list.insertBefore(marker, next) : list.appendChild(marker);
  });
  on(root, "drop", "[data-col]", async (e, col) => {
    e.preventDefault();
    const task = app.data.tasks.find((t) => t.id === dragId);
    const list = $("[data-drop]", col);
    const siblings = $$("[data-card]:not(.ghost), .drop-marker", list);
    const idx = siblings.indexOf(marker);
    const cards = siblings.filter((x) => x !== marker).map((x) => app.data.tasks.find((t) => t.id === x.dataset.card));
    const prev = cards[idx - 1], next = cards[idx];
    const position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1000 : next ? next.position - 1000 : 1000;
    marker.remove();
    dragId = null;
    if (!task) return;
    const wasDone = isDone(task);
    const colId = col.dataset.col;
    Object.assign(task, { column_id: colId, position });
    app.rerender({ force: true });
    try {
      await app.backend.updateTask(task.id, { column_id: colId, position });
      await refresh(["tasks", "activity"]);
      const now = app.data.tasks.find((t) => t.id === task.id);
      if (!wasDone && now && isDone(now)) toast(html`Completed <strong>${now.title}</strong>`, { type: "success" });
    } catch (err) {
      toastError(err);
      refresh(["tasks"]);
    }
  });
}
