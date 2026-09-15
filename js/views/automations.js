// Automations: rules that generate tasks when people join or leave.
import { html, mount, on, $, $$, timeAgo, plural } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { app, refresh } from "../app.js";
import { modal, toast, toastError, confirmDialog, emptyState, setBusy } from "../ui/ui.js";
import { DEPARTMENTS, PRIORITY } from "../ui/bits.js";

export const title = "Automations";
export const perm = "automations.view";

const TRIGGERS = { employee_added: "An employee is added", employee_offboarded: "An employee is offboarded" };
const ASSIGN = { employee: "The employee", manager: "Their manager", creator: "Whoever triggered it", none: "Unassigned" };

const dayLabel = (n) => (n === 0 ? "Day 0" : n > 0 ? `Day +${n}` : `Day −${-n}`);

export function render() {
  const list = app.data.automations;
  const manage = app.can("automations.manage");
  return html`
    <header class="page-head">
      <div><h1 class="serif">Automations</h1><p class="page-sub">Checklists that build themselves when people join or leave ${app.org.name}.</p></div>
      <div class="page-actions">${manage ? html`<button class="btn btn-primary" data-new>${icon("plus")}New automation</button>` : ""}</div>
    </header>
    ${list.length ? html`<div class="auto-list">${list.map((a) => {
      const board = app.board(a.board_id);
      return html`<article class="card auto-card ${a.enabled ? "" : "is-off"}">
        <header class="auto-head">
          <span class="auto-icon">${icon(a.trigger === "employee_added" ? "userPlus" : "userMinus")}</span>
          <div class="auto-title"><h2>${a.name}</h2>
            <p>When <strong>${TRIGGERS[a.trigger].replace("An employee is ", "someone is ")}</strong>${a.department ? html` in <strong>${a.department}</strong>` : ""} → ${plural(a.steps.length, "task")} on <strong>${board?.name || "no board"}</strong></p></div>
          <label class="switch" title="${a.enabled ? "On" : "Off"}"><input type="checkbox" data-toggle="${a.id}" ${a.enabled ? "checked" : ""} ${manage ? "" : "disabled"} /><span></span></label>
        </header>
        ${!board ? html`<div class="callout">${icon("alert")}<div><strong>No target board</strong><span>This automation won't run until you choose a board.</span></div></div>` : ""}
        <ol class="timeline">${[...a.steps].sort((x, y) => x.offset_days - y.offset_days).map((s) => html`<li>
          <span class="tl-day">${dayLabel(+s.offset_days || 0)}</span>
          <span class="tl-title">${s.title}</span>
          <span class="tl-meta">${ASSIGN[s.assign_to] || "Unassigned"}</span>
        </li>`)}</ol>
        <footer class="auto-foot">
          <span class="muted-text">${icon("play")} Ran ${plural(a.run_count || 0, "time")}${a.last_run_at ? ` · last ${timeAgo(a.last_run_at)}` : ""}</span>
          <span class="spacer"></span>
          ${manage ? html`<button class="btn btn-ghost btn-sm" data-edit="${a.id}">${icon("pencil")}Edit</button>` : ""}
        </footer>
      </article>`;
    })}</div>` : html`<section class="card">${emptyState({ icon: "zap", title: "No automations yet", text: "Create an onboarding checklist that runs every time you add someone.", action: manage ? html`<button class="btn btn-primary" data-new>New automation</button>` : "" })}</section>`}
    <p class="fine center">Use <code>{name}</code> in a step title to insert the person's name. Due dates count from their start date.</p>`;
}

function stepRow(s = { title: "", offset_days: 0, assign_to: "employee", priority: "medium" }) {
  return html`<li class="step-row" data-step>
    <span class="drag-dot">${icon("grip")}</span>
    <input class="input input-sm" data-s="title" value="${s.title}" placeholder="e.g. Set up {name}'s laptop" maxlength="200" />
    <label class="day-input"><span>Day</span><input class="input input-sm" type="number" data-s="offset_days" value="${s.offset_days}" min="-60" max="365" /></label>
    <select class="input input-sm" data-s="assign_to">${Object.entries(ASSIGN).map(([k, v]) => html`<option value="${k}" ${s.assign_to === k ? "selected" : ""}>${v}</option>`)}</select>
    <select class="input input-sm" data-s="priority">${Object.entries(PRIORITY).map(([k, v]) => html`<option value="${k}" ${s.priority === k ? "selected" : ""}>${v.label}</option>`)}</select>
    <button type="button" class="icon-btn sm" data-remove-step aria-label="Remove step">${icon("x")}</button>
  </li>`;
}

function openEditor(existing) {
  const a = existing || { name: "", trigger: "employee_added", department: "", board_id: app.data.boards[0]?.id, steps: [{ title: "Welcome {name} to the team", offset_days: 0, assign_to: "manager", priority: "medium" }], enabled: true };
  const depts = [...new Set([...DEPARTMENTS, ...app.data.employees.map((e) => e.department).filter(Boolean)])].sort();
  const m = modal({
    title: existing ? "Edit automation" : "New automation",
    size: "lg",
    body: html`<form class="form" id="autoForm">
      <label class="field"><span>Name</span><input class="input" name="name" required value="${a.name}" placeholder="Sales onboarding" autofocus /></label>
      <div class="rule-sentence">
        <span>When</span>
        <select class="input" name="trigger">${Object.entries(TRIGGERS).map(([k, v]) => html`<option value="${k}" ${a.trigger === k ? "selected" : ""}>${v.toLowerCase()}</option>`)}</select>
        <span>in</span>
        <select class="input" name="department"><option value="">any department</option>${depts.map((d) => html`<option ${a.department === d ? "selected" : ""}>${d}</option>`)}</select>
        <span>create these tasks on</span>
        <select class="input" name="board_id">${app.data.boards.map((b) => html`<option value="${b.id}" ${a.board_id === b.id ? "selected" : ""}>${b.name}</option>`)}</select>
      </div>
      <div class="field"><span>Steps</span>
        <ol class="steps-editor" data-steps>${a.steps.map(stepRow)}</ol>
        <button type="button" class="btn btn-ghost btn-sm" data-add-step>${icon("plus")}Add step</button>
      </div>
    </form>`,
    footer: html`${existing ? html`<button class="btn btn-ghost danger-text" data-delete>${icon("trash")}Delete</button><span class="spacer"></span>` : ""}
      <button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="autoForm">${existing ? "Save" : "Create automation"}</button>`,
  });
  const steps = $("[data-steps]", m.el);
  on(m.el, "click", "[data-add-step]", () => {
    steps.insertAdjacentHTML("beforeend", stepRow({ title: "", offset_days: 1, assign_to: "employee", priority: "medium" }).s);
    $$("[data-step]", steps).at(-1).querySelector("input").focus();
  });
  on(m.el, "click", "[data-remove-step]", (e, b) => b.closest("[data-step]").remove());
  $("#autoForm", m.el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const data = {
      name: f.name.value.trim(), trigger: f.trigger.value, department: f.department.value || null, board_id: f.board_id.value || null,
      steps: $$("[data-step]", steps).map((row) => ({
        title: $("[data-s=title]", row).value.trim(), offset_days: parseInt($("[data-s=offset_days]", row).value, 10) || 0,
        assign_to: $("[data-s=assign_to]", row).value, priority: $("[data-s=priority]", row).value,
      })).filter((s) => s.title),
    };
    if (!data.name) return f.name.focus();
    if (!data.steps.length) return toast("Add at least one step.", { type: "error" });
    const btn = $("button[type=submit]", m.el);
    setBusy(btn, true);
    try {
      existing ? await app.backend.updateAutomation(existing.id, data) : await app.backend.createAutomation(app.org.id, data);
      await refresh(["automations", "activity"]);
      m.close();
      toast(existing ? "Automation saved" : "Automation created", { type: "success" });
    } catch (err) { toastError(err); setBusy(btn, false); }
  });
  $("[data-delete]", m.el)?.addEventListener("click", async () => {
    if (!(await confirmDialog({ title: "Delete automation?", message: "Tasks it already created are kept.", confirmLabel: "Delete", danger: true }))) return;
    try { await app.backend.deleteAutomation(existing.id); m.close(); await refresh(["automations"]); } catch (err) { toastError(err); }
  });
}

export function bind(root) {
  on(root, "click", "[data-new]", () => openEditor());
  on(root, "click", "[data-edit]", (e, b) => openEditor(app.data.automations.find((a) => a.id === b.dataset.edit)));
  on(root, "change", "[data-toggle]", async (e, input) => {
    try {
      await app.backend.updateAutomation(input.dataset.toggle, { enabled: input.checked });
      await refresh(["automations"]);
      toast(input.checked ? "Automation on" : "Automation paused");
    } catch (err) { toastError(err); input.checked = !input.checked; }
  });
}

export { mount };
