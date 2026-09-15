// Shared create/edit dialogs: employee, invite, task, board.
import { html, mount, on, $, $$, formData, todayISO, addDays, fmtDate, timeAgo, copyText, uid, debounce, avatar } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { ROLES, ROLE_META } from "../lib/perms.js";
import { app, refresh } from "../app.js";
import { go } from "../router.js";
import { modal, drawer, toast, toastError, confirmDialog, setBusy } from "../ui/ui.js";
import { DEPARTMENTS, EMPLOYMENT, PRIORITY, BOARD_COLORS, priorityMark, segmented } from "../ui/bits.js";

const unique = (arr) => [...new Set(arr.filter(Boolean))];
const opt = (value, label, selected) => html`<option value="${value}" ${selected ? "selected" : ""}>${label}</option>`;

// ============================================================================
// Employee
// ============================================================================

function matchingAutomations(department) {
  return app.data.automations.filter((a) => a.enabled && a.trigger === "employee_added" && a.board_id && (!a.department || a.department === department));
}

function automationPreview(department) {
  if (!app.can("automations.view")) return "";
  const list = matchingAutomations(department);
  if (!list.length) return html`<div class="callout">${icon("zap")}<div><strong>No onboarding automations will run.</strong><span>Create one in Automations to generate tasks for new hires.</span></div></div>`;
  const total = list.reduce((n, a) => n + a.steps.length, 0);
  return html`<div class="callout callout-accent">${icon("zap")}<div>
    <strong>${total} onboarding tasks will be created automatically</strong>
    <span>${list.map((a) => `${a.name} (${a.steps.length})`).join(" · ")}</span>
  </div></div>`;
}

export function openEmployeeForm(existing) {
  const isNew = !existing;
  const e = existing || { role: "employee", employment_type: "full_time", start_date: addDays(todayISO(), 7) };
  const depts = unique([...DEPARTMENTS, ...app.data.employees.map((x) => x.department)]).sort();
  const managers = app.data.employees.filter((x) => x.status !== "offboarded" && x.id !== e.id).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const roles = ROLES.filter((r) => r !== "owner" || app.realRole === "owner");

  const d = drawer({
    title: isNew ? "Add employee" : `Edit ${e.full_name}`,
    subtitle: isNew ? `They'll get an invite link to join ${app.org.name}.` : e.email,
    size: "md",
    body: html`<form class="form" id="empForm" novalidate>
      <fieldset>
        <legend>Basics</legend>
        <div class="grid-2">
          <label class="field"><span>Full name</span><input class="input" name="full_name" required value="${e.full_name || ""}" placeholder="Alex Morgan" autofocus /></label>
          <label class="field"><span>Work email</span><input class="input" name="email" type="email" required value="${e.email || ""}" placeholder="alex@company.com" ${!isNew && e.user_id ? "readonly" : ""} /></label>
        </div>
        <label class="field"><span>Job title</span><input class="input" name="title" value="${e.title || ""}" placeholder="Product Designer" /></label>
      </fieldset>
      <fieldset>
        <legend>Team</legend>
        <div class="grid-2">
          <label class="field"><span>Department</span>
            <input class="input" name="department" list="deptList" value="${e.department || ""}" placeholder="Choose or type" />
            <datalist id="deptList">${depts.map((x) => html`<option value="${x}"></option>`)}</datalist>
          </label>
          <label class="field"><span>Manager</span>
            <select class="input" name="manager_id">${opt("", "No manager", !e.manager_id)}${managers.map((m) => opt(m.id, m.full_name, m.id === e.manager_id))}</select>
          </label>
        </div>
        <div class="grid-2">
          <label class="field"><span>Access role</span>
            <select class="input" name="role" ${!isNew && e.role === "owner" && app.realRole !== "owner" ? "disabled" : ""}>${roles.map((r) => opt(r, ROLE_META[r].label, r === e.role))}</select>
            <small class="field-hint" data-role-hint>${ROLE_META[e.role]?.blurb}</small>
          </label>
          <label class="field"><span>Employment type</span>
            <select class="input" name="employment_type">${Object.entries(EMPLOYMENT).map(([k, v]) => opt(k, v, k === e.employment_type))}</select>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Details</legend>
        <div class="grid-3">
          <label class="field"><span>Start date</span><input class="input" type="date" name="start_date" value="${e.start_date || ""}" /></label>
          <label class="field"><span>Location</span><input class="input" name="location" value="${e.location || ""}" placeholder="Remote" /></label>
          <label class="field"><span>Phone</span><input class="input" name="phone" value="${e.phone || ""}" placeholder="Optional" /></label>
        </div>
        ${isNew ? html`<label class="check"><input type="checkbox" name="skip_invite" /><span>Mark as active now <small>Skip the invited state, e.g. when importing existing staff</small></span></label>` : ""}
      </fieldset>
      ${isNew ? html`<div data-auto>${automationPreview(e.department)}</div>` : ""}
    </form>`,
    footer: html`<button class="btn btn-ghost" data-close type="button">Cancel</button>
      ${isNew ? html`<button class="btn btn-secondary" type="button" data-another>Save & add another</button>` : ""}
      <button class="btn btn-primary" type="submit" form="empForm">${isNew ? "Add employee" : "Save changes"}</button>`,
  });

  const form = $("#empForm", d.el);
  form.department.addEventListener("input", () => {
    const box = $("[data-auto]", d.el);
    if (box) mount(box, automationPreview(form.department.value.trim()));
  });
  form.role.addEventListener("change", () => ($("[data-role-hint]", d.el).textContent = ROLE_META[form.role.value].blurb));

  async function submit(another, btn) {
    const v = formData(form);
    if (!v.full_name) return form.full_name.focus();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) { form.email.focus(); return toast("Enter a valid email address.", { type: "error" }); }
    const payload = {
      full_name: v.full_name, email: v.email, title: v.title, department: v.department, manager_id: v.manager_id || null,
      role: v.role || e.role, employment_type: v.employment_type, start_date: v.start_date || null, location: v.location, phone: v.phone,
    };
    setBusy(btn, true);
    try {
      if (isNew) {
        payload.status = v.skip_invite ? "active" : "invited";
        const emp = await app.backend.createEmployee(app.org.id, payload);
        await refresh(["employees", "tasks", "activity", "automations"]);
        const created = app.data.tasks.filter((t) => t.subject_employee_id === emp.id).length;
        toast(html`<strong>${emp.full_name}</strong> added${created ? ` · ${created} onboarding tasks created` : ""}`, {
          type: "success",
          action: emp.status === "invited" ? { label: "Copy invite", fn: () => copyText(app.inviteLink(emp)).then(() => toast("Invite link copied")) } : null,
        });
        if (another) {
          const keep = { department: v.department, manager_id: v.manager_id, start_date: v.start_date, employment_type: v.employment_type };
          form.reset();
          Object.entries(keep).forEach(([k, val]) => (form[k].value = val || ""));
          form.full_name.focus();
        } else {
          d.close();
        }
      } else {
        await app.backend.updateEmployee(e.id, payload);
        await refresh(["employees", "activity"]);
        toast("Changes saved", { type: "success" });
        d.close();
      }
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(btn, false);
    }
  }

  form.addEventListener("submit", (ev) => { ev.preventDefault(); submit(false, $("button[type=submit]", d.el)); });
  $("[data-another]", d.el)?.addEventListener("click", (ev) => submit(true, ev.currentTarget));
}

export function openInviteDialog(emp) {
  const link = app.inviteLink(emp);
  const subject = `You're invited to ${app.org.name} on myHR`;
  const body = `Hi ${emp.full_name.split(" ")[0]},\n\nYou've been added to ${app.org.name} on myHR. Create your account with this email (${emp.email}) to get started:\n\n${link}\n`;
  const m = modal({
    title: `Invite ${emp.full_name}`,
    subtitle: "Share this link. When they sign up with this email, they're connected to their profile automatically.",
    size: "sm",
    body: html`<div class="invite">
      <div class="copy-field"><input class="input" readonly value="${link}" /><button class="btn btn-secondary" data-copy>${icon("copy")}Copy</button></div>
      <ol class="steps-list">
        <li>They open the link and create a password</li>
        <li>They confirm their email</li>
        <li>They land in ${app.org.name} as <strong>${ROLE_META[emp.role].label}</strong></li>
      </ol>
    </div>`,
    footer: html`<a class="btn btn-ghost" href="mailto:${emp.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}">${icon("mail")}Open in email</a><button class="btn btn-primary" data-close>Done</button>`,
  });
  $("[data-copy]", m.el).onclick = async () => {
    await copyText(link);
    toast("Invite link copied", { type: "success" });
  };
}

// ============================================================================
// Task
// ============================================================================

export function quickTask() {
  const board = app.data.boards[0];
  if (!board) return toast("Create a board first.", { type: "error" });
  const current = location.hash.match(/#\/app\/boards\/([^/?]+)/)?.[1];
  const b = app.board(current) || board;
  const col = app.columnsOf(b.id).find((c) => !c.is_done) || app.columnsOf(b.id)[0];
  openTaskModal(null, { column_id: col.id, assignee_id: app.me?.id });
}

export function openTaskModal(task, defaults = {}) {
  const isNew = !task;
  let t = task ? structuredClone(task) : { title: "", description: "", assignee_id: null, due_date: null, priority: "medium", labels: [], checklist: [], ...defaults };
  const editable = isNew ? app.can("tasks.create") : app.canEditTask(task);
  const people = app.data.employees.filter((e) => e.status !== "offboarded").sort((a, b) => a.full_name.localeCompare(b.full_name));

  const m = modal({ size: "lg", className: "task-modal", body: html`<div data-task></div>` });
  const box = $("[data-task]", m.el);

  function render() {
    const col = app.column(t.column_id);
    const board = app.board(col?.board_id);
    const cols = board ? app.columnsOf(board.id) : [];
    const boards = app.data.boards;
    const done = t.checklist.filter((c) => c.done).length;
    const auto = t.automation_id && app.data.automations.find((a) => a.id === t.automation_id);
    const subject = app.emp(t.subject_employee_id);
    const dis = editable ? "" : "disabled";

    mount(box, html`
      <header class="task-head">
        <div class="crumbs">
          <span class="board-dot" style="--c:${board?.color || "var(--accent)"}"></span>
          ${isNew ? html`<select class="bare-select" data-board ${dis}>${boards.map((b) => opt(b.id, b.name, b.id === board?.id))}</select>` : html`<span>${board?.name}</span>`}
          ${icon("chevronRight")}<span>${isNew ? "New task" : col?.name}</span>
        </div>
        <div class="task-head-actions">
          ${!isNew && editable ? html`<button class="btn btn-sm ${t.completed_at ? "btn-secondary" : "btn-accent"}" data-toggle-done>${icon(t.completed_at ? "undo" : "check")}${t.completed_at ? "Reopen" : "Mark complete"}</button>` : ""}
          <button class="icon-btn" data-close aria-label="Close">${icon("x")}</button>
        </div>
      </header>
      <div class="task-grid">
        <div class="task-main">
          <textarea class="task-title" data-f="title" rows="1" placeholder="What needs to be done?" ${dis} maxlength="200">${t.title}</textarea>
          ${!editable ? html`<div class="callout">${icon("lock")}<div><strong>View only</strong><span>Only managers, the assignee or the creator can edit this task.</span></div></div>` : ""}
          <label class="field"><span>Description</span>
            <textarea class="input task-desc" data-f="description" rows="5" placeholder="Add context, links or acceptance criteria…" ${dis}>${t.description || ""}</textarea>
          </label>
          <div class="checklist">
            <div class="checklist-head"><span class="field-label">${icon("listChecks")} Checklist</span>${t.checklist.length ? html`<span class="muted-text">${done}/${t.checklist.length}</span>` : ""}</div>
            ${t.checklist.length ? html`<span class="progress"><span style="width:${(done / t.checklist.length) * 100}%"></span></span>` : ""}
            <ul>${t.checklist.map((c) => html`<li class="${c.done ? "done" : ""}">
              <label class="check-round"><input type="checkbox" data-check="${c.id}" ${c.done ? "checked" : ""} ${dis} /><span></span></label>
              <span class="check-text">${c.text}</span>
              ${editable ? html`<button class="icon-btn sm" data-uncheck-del="${c.id}" aria-label="Remove item">${icon("x")}</button>` : ""}
            </li>`)}</ul>
            ${editable ? html`<form data-add-check class="add-check"><input class="input input-sm" placeholder="Add an item and press Enter" maxlength="160" /></form>` : ""}
          </div>
        </div>
        <aside class="task-side">
          <label class="prop"><span>Status</span><select class="input input-sm" data-f="column_id" ${dis}>${cols.map((c) => opt(c.id, c.name, c.id === t.column_id))}</select></label>
          <label class="prop"><span>Assignee</span><select class="input input-sm" data-f="assignee_id" ${dis}>${opt("", "Unassigned", !t.assignee_id)}${people.map((p) => opt(p.id, p.full_name + (p.id === app.me?.id ? " (you)" : ""), p.id === t.assignee_id))}</select></label>
          <label class="prop"><span>Due date</span><input class="input input-sm" type="date" data-f="due_date" value="${t.due_date || ""}" ${dis} /></label>
          <div class="prop"><span>Priority</span>
            <div class="prio-pick">${Object.keys(PRIORITY).map((p) => html`<button type="button" class="prio-opt ${t.priority === p ? "active" : ""}" data-prio="${p}" ${dis} title="${PRIORITY[p].label}">${priorityMark(p)}<span>${PRIORITY[p].label}</span></button>`)}</div>
          </div>
          <label class="prop"><span>Labels</span><input class="input input-sm" data-f="labels" value="${(t.labels || []).join(", ")}" placeholder="design, launch" ${dis} /></label>
          ${!isNew ? html`<div class="task-meta">
            ${auto ? html`<p>${icon("zap")}<span>Created by <strong>${auto.name}</strong>${subject ? html` for <a href="#/app/people/${subject.id}">${subject.full_name}</a>` : ""}</span></p>` : ""}
            <p>${icon("clock")}<span>Created ${timeAgo(t.created_at)}${t.updated_at && t.updated_at !== t.created_at ? ` · updated ${timeAgo(t.updated_at)}` : ""}</span></p>
            ${t.completed_at ? html`<p>${icon("circleCheck")}<span>Completed ${timeAgo(t.completed_at)}</span></p>` : ""}
          </div>` : ""}
        </aside>
      </div>
      <footer class="dialog-foot">
        ${!isNew && editable && (app.can("tasks.editAny") || t.created_by === app.user.id) ? html`<button class="btn btn-ghost danger-text" data-delete>${icon("trash")}Delete</button>` : ""}
        <span class="spacer"></span>
        ${isNew ? html`<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-create>Create task</button>` : html`<button class="btn btn-primary" data-close>Done</button>`}
      </footer>`);
    autosize($(".task-title", box));
  }

  function autosize(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  async function save(patch) {
    Object.assign(t, patch);
    if (isNew) return;
    try {
      t = await app.backend.updateTask(t.id, patch);
      await refresh(["tasks", "activity"]);
    } catch (err) {
      toastError(err);
    }
  }
  const saveText = debounce((k, v) => save({ [k]: v }), 500);

  const value = (k, raw) => (k === "labels" ? raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 8) : raw || null);

  on(box, "input", "[data-f]", (e, el) => {
    if (el.tagName === "TEXTAREA") {
      if (el.classList.contains("task-title")) autosize(el);
      const k = el.dataset.f;
      t[k] = el.value;
      if (!isNew && k !== "title") saveText(k, el.value);
    }
  });
  on(box, "change", "[data-f]", async (e, el) => {
    const k = el.dataset.f;
    if (k === "title") {
      const title = el.value.trim();
      if (!title) return;
      return save({ title });
    }
    await save({ [k]: value(k, el.value) });
    if (k === "column_id") render();
  });
  on(box, "change", "[data-board]", (e, el) => {
    const c = app.columnsOf(el.value).find((x) => !x.is_done) || app.columnsOf(el.value)[0];
    t.column_id = c.id;
    render();
  });
  on(box, "click", "[data-prio]", async (e, b) => { await save({ priority: b.dataset.prio }); render(); });
  on(box, "change", "[data-check]", async (e, el) => {
    const checklist = t.checklist.map((c) => (c.id === el.dataset.check ? { ...c, done: el.checked } : c));
    await save({ checklist });
    render();
  });
  on(box, "click", "[data-uncheck-del]", async (e, b) => {
    await save({ checklist: t.checklist.filter((c) => c.id !== b.dataset.uncheckDel) });
    render();
  });
  on(box, "submit", "[data-add-check]", async (e, f) => {
    e.preventDefault();
    const input = $("input", f);
    const text = input.value.trim();
    if (!text) return;
    await save({ checklist: [...t.checklist, { id: uid(), text, done: false }] });
    render();
    $("[data-add-check] input", box)?.focus();
  });
  on(box, "click", "[data-toggle-done]", async () => {
    const cols = app.columnsOf(app.column(t.column_id).board_id);
    const target = t.completed_at ? cols.find((c) => !c.is_done) : cols.find((c) => c.is_done);
    if (!target) return toast("This board has no Done column.", { type: "error" });
    await save({ column_id: target.id });
    render();
    if (t.completed_at) toast("Task completed", { type: "success" });
  });
  on(box, "click", "[data-delete]", async () => {
    if (!(await confirmDialog({ title: "Delete task?", message: `"${t.title}" will be permanently deleted.`, confirmLabel: "Delete", danger: true }))) return;
    try {
      await app.backend.deleteTask(t.id);
      m.close();
      await refresh(["tasks", "activity"]);
      toast("Task deleted");
    } catch (err) { toastError(err); }
  });
  on(box, "click", "[data-create]", async (e, btn) => {
    t.title = $(".task-title", box).value.trim();
    t.labels = value("labels", $("[data-f=labels]", box).value) || [];
    if (!t.title) return $(".task-title", box).focus();
    setBusy(btn, true);
    try {
      await app.backend.createTask(app.org.id, t);
      m.close();
      await refresh(["tasks", "activity"]);
      toast("Task created", { type: "success" });
    } catch (err) {
      toastError(err);
      setBusy(btn, false);
    }
  });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("task-title")) {
      e.preventDefault();
      if (isNew) $("[data-create]", box)?.click();
      else e.target.blur();
    }
  });

  render();
  if (isNew) setTimeout(() => $(".task-title", box)?.focus(), 30);
}

// ============================================================================
// Board
// ============================================================================

const TEMPLATES = [
  { id: "kanban", name: "Kanban", columns: ["To do", "In progress", "Done"] },
  { id: "sprint", name: "Sprint", columns: ["Backlog", "This week", "In review", "Done"] },
  { id: "hiring", name: "Hiring pipeline", columns: ["Sourced", "Screen", "Interview", "Offer", "Done"] },
  { id: "requests", name: "Requests", columns: ["New", "Triaging", "Waiting", "Done"] },
];

export function openBoardForm(existing) {
  const isNew = !existing;
  let color = existing?.color || BOARD_COLORS[app.data.boards.length % BOARD_COLORS.length];
  let template = "kanban";
  const m = modal({
    title: isNew ? "New board" : "Board settings",
    size: "sm",
    body: html`<form class="form" id="boardForm">
      <label class="field"><span>Name</span><input class="input" name="name" required maxlength="80" value="${existing?.name || ""}" placeholder="e.g. Q1 Hiring" autofocus /></label>
      <label class="field"><span>Description</span><input class="input" name="description" value="${existing?.description || ""}" placeholder="What is this board for?" /></label>
      <div class="field"><span>Color</span><div class="swatches">${BOARD_COLORS.map((c) => html`<button type="button" class="swatch ${c === color ? "active" : ""}" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`)}</div></div>
      ${isNew ? html`<div class="field"><span>Template</span><div class="templates">${TEMPLATES.map((tp) => html`<button type="button" class="template ${tp.id === template ? "active" : ""}" data-template="${tp.id}">
        <strong>${tp.name}</strong><span>${tp.columns.join(" → ")}</span></button>`)}</div></div>` : ""}
    </form>`,
    footer: html`${!isNew ? html`<button class="btn btn-ghost danger-text" data-delete>${icon("trash")}Delete board</button><span class="spacer"></span>` : ""}
      <button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="boardForm">${isNew ? "Create board" : "Save"}</button>`,
  });
  const form = $("#boardForm", m.el);
  on(m.el, "click", "[data-color]", (e, b) => { color = b.dataset.color; $$("[data-color]", m.el).forEach((x) => x.classList.toggle("active", x === b)); });
  on(m.el, "click", "[data-template]", (e, b) => { template = b.dataset.template; $$("[data-template]", m.el).forEach((x) => x.classList.toggle("active", x === b)); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = formData(form);
    if (!v.name) return;
    const btn = $("button[type=submit]", m.el);
    setBusy(btn, true);
    try {
      if (isNew) {
        const b = await app.backend.createBoard(app.org.id, { name: v.name, description: v.description, color, columns: TEMPLATES.find((x) => x.id === template).columns });
        await refresh(["boards", "columns", "activity"]);
        m.close();
        go(`#/app/boards/${b.id}`);
      } else {
        await app.backend.updateBoard(existing.id, { name: v.name, description: v.description, color });
        await refresh(["boards"]);
        m.close();
      }
    } catch (err) {
      toastError(err);
      setBusy(btn, false);
    }
  });
  $("[data-delete]", m.el)?.addEventListener("click", async () => {
    const count = app.data.tasks.filter((t) => t.board_id === existing.id).length;
    if (!(await confirmDialog({ title: `Delete ${existing.name}?`, message: `This deletes the board and its ${count} tasks. This can't be undone.`, confirmLabel: "Delete board", danger: true }))) return;
    try {
      await app.backend.deleteBoard(existing.id);
      m.close();
      await refresh(["boards", "columns", "tasks", "automations"]);
      go("#/app/boards");
    } catch (err) { toastError(err); }
  });
}
