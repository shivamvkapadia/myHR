// People directory, profile drawer, CSV import/export.
import { html, mount, on, $, avatar, fmtDate, daysBetween, todayISO, copyText, parseCSV, toCSV, downloadBlob, plural } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { ROLES, ROLE_META } from "../lib/perms.js";
import { app, refresh, isDone } from "../app.js";
import { setHashSilently } from "../router.js";
import { drawer, modal, menu, toast, toastError, confirmDialog, emptyState, setBusy } from "../ui/ui.js";
import { rolePill, statusPill, progressBar, EMPLOYMENT, STATUS, segmented } from "../ui/bits.js";
import { openEmployeeForm, openInviteDialog } from "./modals.js";
import { taskRow, bindTaskRows } from "./tasks.js";

export const title = "People";
export const crumb = (params) => (params[0] && app.emp(params[0])?.full_name) || "People";

const state = { q: "", dept: "", role: "", status: "current", view: "table" };
let profile = null; // { id, drawer }

function filtered() {
  const q = state.q.toLowerCase();
  return app.data.employees.filter((e) => {
    if (state.status === "current" && e.status === "offboarded") return false;
    if (state.status !== "current" && state.status !== "all" && e.status !== state.status) return false;
    if (state.dept && e.department !== state.dept) return false;
    if (state.role && e.role !== state.role) return false;
    return !q || `${e.full_name} ${e.email} ${e.title} ${e.department} ${e.location}`.toLowerCase().includes(q);
  }).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.full_name.localeCompare(b.full_name));
}

export function render() {
  const list = filtered();
  const depts = [...new Set(app.data.employees.map((e) => e.department).filter(Boolean))].sort();
  const counts = { invited: 0, active: 0, on_leave: 0, offboarded: 0 };
  app.data.employees.forEach((e) => counts[e.status]++);
  const manage = app.can("people.manage");

  return html`
    <header class="page-head">
      <div><h1 class="serif">People</h1>
        <p class="page-sub">${counts.active} active · ${counts.invited} invited · ${counts.on_leave} on leave</p></div>
      <div class="page-actions">
        <button class="btn btn-ghost" data-export>${icon("download")}<span class="hide-sm">Export</span></button>
        ${manage ? html`<button class="btn btn-secondary" data-import>${icon("upload")}<span class="hide-sm">Import CSV</span></button>
          <button class="btn btn-primary" data-add>${icon("userPlus")}Add employee</button>` : ""}
      </div>
    </header>

    <div class="toolbar card">
      <label class="search-input grow">${icon("search")}<input data-q placeholder="Search name, email, title, location" value="${state.q}" /></label>
      <select class="input input-sm" data-f="dept"><option value="">All departments</option>${depts.map((d) => html`<option ${state.dept === d ? "selected" : ""}>${d}</option>`)}</select>
      <select class="input input-sm" data-f="role"><option value="">All roles</option>${ROLES.map((r) => html`<option value="${r}" ${state.role === r ? "selected" : ""}>${ROLE_META[r].label}</option>`)}</select>
      <select class="input input-sm" data-f="status">
        <option value="current" ${state.status === "current" ? "selected" : ""}>Current staff</option>
        ${Object.entries(STATUS).map(([k, v]) => html`<option value="${k}" ${state.status === k ? "selected" : ""}>${v}</option>`)}
        <option value="all" ${state.status === "all" ? "selected" : ""}>Everyone</option>
      </select>
      ${segmented("view", [{ value: "table", label: "", icon: icon("list") }, { value: "cards", label: "", icon: icon("grid") }], state.view)}
    </div>

    ${!list.length ? html`<section class="card">${emptyState({ icon: "users", title: "No one matches", text: "Try a different search or filter." })}</section>`
    : state.view === "cards" ? html`<div class="people-cards">${list.map((e) => html`<button class="person-card" data-open="${e.id}">
        ${avatar(e.full_name, "lg")}<strong>${e.full_name}</strong><span>${e.title || "—"}</span>
        <span class="person-card-tags">${e.department ? html`<span class="label-chip">${e.department}</span>` : ""}${e.status !== "active" ? statusPill(e.status) : rolePill(e.role)}</span>
      </button>`)}</div>`
    : html`<section class="card table-card"><div class="table-scroll"><table class="table">
        <thead><tr><th>Name</th><th>Title</th><th>Department</th><th>Manager</th><th>Role</th><th>Status</th><th>Start date</th>${manage ? html`<th></th>` : ""}</tr></thead>
        <tbody>${list.map((e) => html`<tr data-open="${e.id}">
          <td><span class="person">${avatar(e.full_name, "sm")}<span class="person-text"><span class="person-name">${e.full_name}</span><span class="person-sub">${e.email}</span></span></span></td>
          <td>${e.title || html`<span class="muted-text">—</span>`}</td>
          <td>${e.department || html`<span class="muted-text">—</span>`}</td>
          <td>${app.emp(e.manager_id)?.full_name || html`<span class="muted-text">—</span>`}</td>
          <td>${rolePill(e.role)}</td>
          <td>${statusPill(e.status)}</td>
          <td class="nowrap">${e.start_date ? fmtDate(e.start_date, { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
          ${manage ? html`<td class="row-actions"><button class="icon-btn xs" data-row-menu="${e.id}" data-menu-anchor aria-label="Actions">${icon("more")}</button></td>` : ""}
        </tr>`)}</tbody></table></div>
        <footer class="table-foot">${plural(list.length, "person", "people")}</footer></section>`}`;
}

function profileBody(e) {
  const today = todayISO();
  const mgr = app.emp(e.manager_id);
  const reports = app.data.employees.filter((x) => x.manager_id === e.id && x.status !== "offboarded");
  const onboarding = app.data.tasks.filter((t) => t.subject_employee_id === e.id).sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  const done = onboarding.filter(isDone).length;
  const assigned = app.data.tasks.filter((t) => t.assignee_id === e.id && !isDone(t)).sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  const tenure = e.start_date ? daysBetween(e.start_date, today) : null;
  const manage = app.can("people.manage") && (e.role !== "owner" || app.realRole === "owner");

  return html`<div class="profile">
    <header class="profile-head">
      ${avatar(e.full_name, "xl")}
      <div><h2 class="serif">${e.full_name}</h2><p>${[e.title, e.department].filter(Boolean).join(" · ") || "No title yet"}</p>
        <div class="profile-tags">${rolePill(e.role)}${statusPill(e.status)}${e.user_id ? "" : html`<span class="pill">No account yet</span>`}</div></div>
    </header>
    <div class="profile-actions">
      <a class="btn btn-secondary btn-sm" href="mailto:${e.email}">${icon("mail")}Email</a>
      ${manage ? html`<button class="btn btn-secondary btn-sm" data-p="edit">${icon("pencil")}Edit</button>` : ""}
      ${manage && e.status === "invited" ? html`<button class="btn btn-secondary btn-sm" data-p="invite">${icon("link")}Invite link</button>` : ""}
      ${manage ? html`<button class="icon-btn bordered" data-p="more" data-menu-anchor aria-label="More">${icon("more")}</button>` : ""}
    </div>
    <dl class="details">
      <div><dt>Email</dt><dd>${e.email}</dd></div>
      <div><dt>Manager</dt><dd>${mgr ? html`<a href="#/app/people/${mgr.id}">${mgr.full_name}</a>` : "—"}</dd></div>
      <div><dt>Start date</dt><dd>${e.start_date ? html`${fmtDate(e.start_date, { month: "long", day: "numeric", year: "numeric" })} <small class="muted-text">${tenure >= 0 ? `· ${tenure >= 365 ? `${(tenure / 365).toFixed(1)} yrs` : plural(tenure, "day")}` : `· in ${plural(-tenure, "day")}`}</small>` : "—"}</dd></div>
      <div><dt>Type</dt><dd>${EMPLOYMENT[e.employment_type] || "—"}</dd></div>
      <div><dt>Location</dt><dd>${e.location || "—"}</dd></div>
      <div><dt>Phone</dt><dd>${e.phone || "—"}</dd></div>
      ${reports.length ? html`<div class="full"><dt>Direct reports (${reports.length})</dt><dd class="avatars-row">${reports.map((r) => html`<a href="#/app/people/${r.id}" title="${r.full_name}">${avatar(r.full_name, "sm")}</a>`)}</dd></div>` : ""}
    </dl>
    ${onboarding.length ? html`<section class="profile-section">
      <header><h3>${(onboarding[0].labels || []).includes("offboarding") ? "Offboarding" : "Onboarding"}</h3><span class="muted-text">${done}/${onboarding.length} complete</span></header>
      ${progressBar((done / onboarding.length) * 100)}
      <div class="task-list compact">${onboarding.map((t) => taskRow(t, { showAssignee: true }))}</div>
    </section>` : ""}
    <section class="profile-section">
      <header><h3>Assigned tasks</h3><span class="muted-text">${assigned.length} open</span></header>
      ${assigned.length ? html`<div class="task-list compact">${assigned.map((t) => taskRow(t))}</div>` : html`<p class="muted-text">Nothing open.</p>`}
    </section>
  </div>`;
}

function employeeMenu(anchor, e, after) {
  const manage = app.can("people.manage") && (e.role !== "owner" || app.realRole === "owner");
  if (!manage) return;
  const update = async (patch, msg) => {
    try { await app.backend.updateEmployee(e.id, patch); await refresh(["employees", "tasks", "activity", "automations"]); toast(msg, { type: "success" }); after?.(); }
    catch (err) { toastError(err); }
  };
  const roles = ROLES.filter((r) => r !== "owner" || app.realRole === "owner");
  menu(anchor, [
    { label: "Edit profile", icon: "pencil", onClick: () => openEmployeeForm(e) },
    e.status === "invited" && { label: "Copy invite link", icon: "copy", onClick: () => copyText(app.inviteLink(e)).then(() => toast("Invite link copied")) },
    "-", { heading: "Access role" },
    ...roles.map((r) => ({ label: ROLE_META[r].label, active: e.role === r, onClick: () => e.role !== r && update({ role: r }, `${e.full_name} is now ${ROLE_META[r].label}`) })),
    "-",
    e.status === "active" && { label: "Mark on leave", icon: "clock", onClick: () => update({ status: "on_leave" }, `${e.full_name} marked on leave`) },
    e.status === "on_leave" && { label: "Return from leave", icon: "undo", onClick: () => update({ status: "active" }, `Welcome back, ${e.full_name}`) },
    e.status !== "offboarded" && e.user_id !== app.user.id && { label: "Offboard…", icon: "userMinus", danger: true, onClick: async () => {
      if (await confirmDialog({ title: `Offboard ${e.full_name}?`, message: "They lose access immediately and your offboarding automations run.", confirmLabel: "Offboard", danger: true })) update({ status: "offboarded" }, `${e.full_name} offboarded`);
    } },
    e.status === "offboarded" && { label: "Reactivate", icon: "undo", onClick: () => update({ status: "active" }, `${e.full_name} reactivated`) },
    e.user_id !== app.user.id && { label: "Delete record…", icon: "trash", danger: true, onClick: async () => {
      if (!(await confirmDialog({ title: `Delete ${e.full_name}?`, message: "This permanently removes their record. Prefer offboarding to keep history.", confirmLabel: "Delete", danger: true }))) return;
      try { await app.backend.deleteEmployee(e.id); profile?.drawer.close(); await refresh(["employees", "tasks", "activity"]); toast("Record deleted"); } catch (err) { toastError(err); }
    } },
  ].filter(Boolean), { align: "end", width: 220 });
}

function openProfile(id) {
  const e = app.emp(id);
  if (!e) return;
  if (profile?.id === id && document.body.contains(profile.drawer.el)) {
    mount($(".dialog-body", profile.drawer.el), profileBody(e));
    return;
  }
  profile?.drawer.close();
  const d = drawer({ size: "md", title: "Profile", body: profileBody(e), onClose: () => { profile = null; if (location.hash.startsWith("#/app/people/")) setHashSilently("#/app/people"); } });
  profile = { id, drawer: d };
  bindTaskRows(d.el);
  on(d.el, "click", "[data-p]", (ev, b) => {
    const cur = app.emp(profile.id);
    if (b.dataset.p === "edit") openEmployeeForm(cur);
    if (b.dataset.p === "invite") openInviteDialog(cur);
    if (b.dataset.p === "more") employeeMenu(b, cur);
  });
}

// ---------- CSV ----------
const CSV_COLUMNS = ["full_name", "email", "title", "department", "role", "employment_type", "start_date", "location", "phone", "manager_email", "status"];

function exportCSV() {
  const rows = filtered().map((e) => ({ ...e, manager_email: app.emp(e.manager_id)?.email || "" }));
  downloadBlob(`${app.org.slug}-people-${todayISO()}.csv`, new Blob([toCSV(rows, CSV_COLUMNS)], { type: "text/csv" }));
}

function openImport() {
  let rows = [];
  const m = modal({
    title: "Import employees",
    subtitle: "Upload a CSV with a header row. Onboarding automations run for each new person.",
    size: "md",
    body: html`<div class="import">
      <label class="dropzone small" data-drop>${icon("upload")}<span><strong>Choose a CSV file</strong> or drop it here</span><input type="file" accept=".csv,text/csv" hidden /></label>
      <p class="fine">Columns: <code>${CSV_COLUMNS.join(", ")}</code>. Only <code>full_name</code> and <code>email</code> are required.</p>
      <button class="link" data-template>${icon("download")} Download a template</button>
      <div data-preview></div>
    </div>`,
    footer: html`<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-run disabled>Import</button>`,
  });
  const input = $("input[type=file]", m.el);
  const load = async (file) => {
    rows = parseCSV(await file.text()).filter((r) => r.full_name && r.email);
    const existing = new Set(app.data.employees.map((e) => e.email.toLowerCase()));
    const fresh = rows.filter((r) => !existing.has(r.email.toLowerCase()));
    mount($("[data-preview]", m.el), html`<div class="callout ${fresh.length ? "callout-accent" : ""}">${icon("users")}<div><strong>${plural(fresh.length, "new person", "new people")} ready to import</strong><span>${rows.length - fresh.length ? `${rows.length - fresh.length} already in ${app.org.name} will be skipped.` : "No duplicates found."}</span></div></div>
      <ul class="import-list">${fresh.slice(0, 8).map((r) => html`<li>${avatar(r.full_name, "xs")}<span>${r.full_name}</span><small>${r.email}</small></li>`)}${fresh.length > 8 ? html`<li class="muted-text">+${fresh.length - 8} more</li>` : ""}</ul>`);
    rows = fresh;
    $("[data-run]", m.el).disabled = !fresh.length;
  };
  input.onchange = () => input.files[0] && load(input.files[0]);
  const dz = $("[data-drop]", m.el);
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("over"); };
  dz.ondragleave = () => dz.classList.remove("over");
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove("over"); e.dataTransfer.files[0] && load(e.dataTransfer.files[0]); };
  $("[data-template]", m.el).onclick = () => downloadBlob("myhr-import-template.csv", new Blob([toCSV([{ full_name: "Alex Morgan", email: "alex@company.com", title: "Designer", department: "Design", role: "employee", employment_type: "full_time", start_date: todayISO(), location: "Remote" }], CSV_COLUMNS)], { type: "text/csv" }));
  $("[data-run]", m.el).onclick = async (e) => {
    const btn = e.currentTarget;
    setBusy(btn, true, "Importing…");
    let ok = 0;
    const errors = [];
    const byEmail = Object.fromEntries(app.data.employees.map((x) => [x.email.toLowerCase(), x.id]));
    for (const r of rows) {
      try {
        const emp = await app.backend.createEmployee(app.org.id, {
          full_name: r.full_name, email: r.email, title: r.title, department: r.department,
          role: ROLES.includes(r.role) && r.role !== "owner" ? r.role : "employee",
          employment_type: EMPLOYMENT[r.employment_type] ? r.employment_type : "full_time",
          start_date: /^\d{4}-\d{2}-\d{2}$/.test(r.start_date) ? r.start_date : null,
          location: r.location, phone: r.phone, manager_id: byEmail[(r.manager_email || "").toLowerCase()] || null,
          status: STATUS[r.status] && r.status !== "offboarded" ? r.status : "invited",
        });
        byEmail[emp.email] = emp.id;
        ok++;
      } catch (err) { errors.push(`${r.email}: ${err.message}`); }
    }
    await refresh(["employees", "tasks", "activity", "automations"]);
    m.close();
    toast(`Imported ${plural(ok, "person", "people")}${errors.length ? ` · ${errors.length} failed` : ""}`, { type: errors.length ? "error" : "success" });
    if (errors.length) console.warn(errors);
  };
}

export function bind(root, params, query) {
  on(root, "input", "[data-q]", (e, i) => {
    state.q = i.value;
    app.rerender({ force: true });
    const next = $("[data-q]");
    next.focus();
    next.setSelectionRange(next.value.length, next.value.length);
  });
  on(root, "change", "[data-f]", (e, s) => { state[s.dataset.f] = s.value; app.rerender({ force: true }); });
  on(root, "click", "[data-seg=view] .seg-btn", (e, b) => { state.view = b.dataset.value; app.rerender({ force: true }); });
  on(root, "click", "[data-add]", () => openEmployeeForm());
  on(root, "click", "[data-import]", openImport);
  on(root, "click", "[data-export]", exportCSV);
  on(root, "click", "[data-row-menu]", (e, b) => { e.stopPropagation(); employeeMenu(b, app.emp(b.dataset.rowMenu)); });
  on(root, "click", "[data-open]", (e, el) => {
    if (e.target.closest("[data-row-menu]")) return;
    setHashSilently(`#/app/people/${el.dataset.open}`);
    openProfile(el.dataset.open);
  });
  if (params[0]) openProfile(params[0]);
  else if (profile && document.body.contains(profile.drawer.el)) openProfile(profile.id);
  if (query.import && app.can("people.manage")) { setHashSilently("#/app/people"); openImport(); }
}
