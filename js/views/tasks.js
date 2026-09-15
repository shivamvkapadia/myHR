// My tasks: grouped by due date with one-click completion.
import { html, on, todayISO, addDays } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { app, refresh, isDone } from "../app.js";
import { toast, toastError, emptyState } from "../ui/ui.js";
import { priorityMark, dueChip, labelChips, person, segmented } from "../ui/bits.js";
import { openTaskModal, quickTask } from "./modals.js";

export const title = "My tasks";
let scope = "mine";

export async function toggleComplete(task) {
  if (!app.canEditTask(task)) return toast("You can't edit this task.", { type: "error" });
  const cols = app.columnsOf(task.board_id);
  const target = isDone(task) ? cols.find((c) => !c.is_done) : cols.find((c) => c.is_done);
  if (!target) return toast("This board has no Done column.", { type: "error" });
  try {
    await app.backend.updateTask(task.id, { column_id: target.id });
    await refresh(["tasks", "activity"]);
    if (!isDone(task)) {
      toast("Task completed", {
        type: "success",
        action: { label: "Undo", fn: async () => { await app.backend.updateTask(task.id, { column_id: task.column_id }); refresh(["tasks", "activity"]); } },
      });
    }
  } catch (err) {
    toastError(err);
  }
}

export function taskRow(t, { showAssignee = false } = {}) {
  const board = app.board(t.board_id);
  const done = isDone(t);
  const checks = t.checklist?.length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : "";
  return html`<div class="task-row ${done ? "is-done" : ""}" data-task="${t.id}">
    <button class="round-check ${done ? "checked" : ""}" data-complete="${t.id}" aria-label="${done ? "Reopen" : "Complete"} task" ${app.canEditTask(t) ? "" : "disabled"}>${icon("check")}</button>
    <span class="task-row-title">${t.title}</span>
    <span class="task-row-meta">
      ${t.source === "automation" ? html`<span class="meta-ic" title="Created by automation">${icon("zap")}</span>` : ""}
      ${checks ? html`<span class="meta-ic">${icon("listChecks")}${checks}</span>` : ""}
      ${labelChips(t.labels?.slice(0, 2))}
      <span class="board-tag hide-sm"><span class="board-dot" style="--c:${board?.color}"></span>${board?.name}</span>
      ${showAssignee ? person(app.emp(t.assignee_id), { size: "xs" }) : ""}
      ${priorityMark(t.priority)}
      <span class="due-slot">${dueChip(t)}</span>
    </span>
  </div>`;
}

export function bindTaskRows(root) {
  on(root, "click", "[data-complete]", (e, b) => {
    e.stopPropagation();
    const t = app.data.tasks.find((x) => x.id === b.dataset.complete);
    if (t) toggleComplete(t);
  });
  on(root, "click", "[data-task]", (e, row) => {
    if (e.target.closest("[data-complete], a")) return;
    const t = app.data.tasks.find((x) => x.id === row.dataset.task);
    if (t) openTaskModal(t);
  });
}

export function render() {
  const today = todayISO();
  const week = addDays(today, 7);
  const canAll = app.can("tasks.editAny");
  if (!canAll) scope = "mine";
  const source = app.data.tasks.filter((t) => (scope === "mine" ? t.assignee_id === app.me?.id : true));
  const open = source.filter((t) => !isDone(t));
  const byDue = (a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999") || a.title.localeCompare(b.title);

  const groups = [
    { key: "overdue", label: "Overdue", tone: "danger", items: open.filter((t) => t.due_date && t.due_date < today) },
    { key: "today", label: "Today", items: open.filter((t) => t.due_date === today) },
    { key: "week", label: "Next 7 days", items: open.filter((t) => t.due_date > today && t.due_date <= week) },
    { key: "later", label: "Later", items: open.filter((t) => t.due_date > week) },
    { key: "none", label: "No due date", items: open.filter((t) => !t.due_date) },
  ].filter((g) => g.items.length);

  const completed = source.filter(isDone).sort((a, b) => b.completed_at.localeCompare(a.completed_at)).slice(0, 8);

  return html`
    <header class="page-head">
      <div>
        <h1 class="serif">${scope === "mine" ? "My tasks" : "All open tasks"}</h1>
        <p class="page-sub">${open.length ? `${open.length} open · ${groups.find((g) => g.key === "overdue")?.items.length || 0} overdue` : "You're all caught up."}</p>
      </div>
      <div class="page-actions">
        ${canAll ? segmented("scope", [{ value: "mine", label: "Assigned to me" }, { value: "all", label: "Everyone" }], scope) : ""}
        ${app.can("tasks.create") ? html`<button class="btn btn-primary" data-new>${icon("plus")}New task</button>` : ""}
      </div>
    </header>

    ${groups.length ? groups.map((g) => html`<section class="card task-group">
      <h2 class="group-title ${g.tone || ""}">${g.label}<span class="count">${g.items.length}</span></h2>
      <div class="task-list">${g.items.sort(byDue).map((t) => taskRow(t, { showAssignee: scope === "all" }))}</div>
    </section>`) : html`<section class="card">${emptyState({ icon: "circleCheck", title: "Nothing on your plate", text: "Tasks assigned to you from any board show up here, sorted by when they're due.", action: app.can("tasks.create") ? html`<button class="btn btn-secondary" data-new>${icon("plus")}Create a task</button>` : "" })}</section>`}

    ${completed.length ? html`<section class="card task-group muted-group">
      <h2 class="group-title">Recently completed<span class="count">${completed.length}</span></h2>
      <div class="task-list">${completed.map((t) => taskRow(t, { showAssignee: scope === "all" }))}</div>
    </section>` : ""}`;
}

export function bind(root) {
  bindTaskRows(root);
  on(root, "click", "[data-new]", () => quickTask());
  on(root, "click", "[data-seg=scope] .seg-btn", (e, b) => {
    scope = b.dataset.value;
    app.rerender({ force: true });
  });
}
