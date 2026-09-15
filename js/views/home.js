// Home dashboard.
import { html, on, todayISO, addDays, daysBetween, fmtDate, timeAgo, avatar, plural } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { app, isDone, isOverdue } from "../app.js";
import { go } from "../router.js";
import { emptyState } from "../ui/ui.js";
import { progressBar, statusPill } from "../ui/bits.js";
import { openEmployeeForm, quickTask, openBoardForm } from "./modals.js";
import { taskRow, bindTaskRows } from "./tasks.js";
import { openAppearanceDrawer } from "../ui/appearance.js";

export const title = "Home";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function onboardingPipeline() {
  const today = todayISO();
  const hires = new Map();
  for (const t of app.data.tasks) {
    if (!t.subject_employee_id || !(t.labels || []).includes("onboarding")) continue;
    const e = app.emp(t.subject_employee_id);
    if (!e || e.status === "offboarded") continue;
    const h = hires.get(e.id) || { e, total: 0, done: 0, overdue: 0 };
    h.total++;
    if (isDone(t)) h.done++;
    else if (t.due_date && t.due_date < today) h.overdue++;
    hires.set(e.id, h);
  }
  return [...hires.values()].filter((h) => h.done < h.total).sort((a, b) => (a.e.start_date || "").localeCompare(b.e.start_date || ""));
}

function activityLine(a) {
  const role = a.meta?.role ? html` to <strong>${a.meta.role}</strong>` : "";
  const extra = a.verb === "ran automation" && a.meta?.employee ? html` for <strong>${a.meta.employee}</strong>` : "";
  return html`<li class="activity-item">
    ${avatar(a.actor_name, "sm")}
    <div><p><strong>${a.actor_name}</strong> ${a.verb} <span class="target">${a.target}</span>${role}${extra}</p><time>${timeAgo(a.created_at)}</time></div>
  </li>`;
}

export function render() {
  const today = todayISO();
  const people = app.data.employees.filter((e) => e.status !== "offboarded");
  const joining = people.filter((e) => e.start_date && e.start_date >= today && e.start_date <= addDays(today, 30));
  const open = app.data.tasks.filter((t) => !isDone(t));
  const overdue = open.filter(isOverdue);
  const doneWeek = app.data.tasks.filter((t) => t.completed_at && t.completed_at.slice(0, 10) >= addDays(today, -7));
  const pipeline = onboardingPipeline();
  const mine = open.filter((t) => t.assignee_id === app.me?.id && (!t.due_date || t.due_date <= addDays(today, 7)))
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999")).slice(0, 6);

  const depts = {};
  people.forEach((e) => (depts[e.department || "Unassigned"] = (depts[e.department || "Unassigned"] || 0) + 1));
  const deptRows = Object.entries(depts).sort((a, b) => b[1] - a[1]);
  const maxDept = Math.max(1, ...deptRows.map((d) => d[1]));
  const first = (app.me?.full_name || "").split(" ")[0];
  const isNewOrg = people.length <= 1;

  return html`
    <header class="page-head home-head">
      <div>
        <p class="kicker">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 class="serif">${greeting()}${first ? `, ${first}` : ""}.</h1>
        <p class="page-sub">${overdue.length ? html`${plural(overdue.length, "task")} overdue across the team. ` : ""}${joining.length ? html`${plural(joining.length, "person", "people")} joining in the next 30 days.` : "Here's what's happening today."}</p>
      </div>
      <div class="page-actions">
        ${app.can("people.manage") ? html`<button class="btn btn-secondary" data-add-emp>${icon("userPlus")}Add employee</button>` : ""}
        ${app.can("tasks.create") ? html`<button class="btn btn-primary" data-new-task>${icon("plus")}New task</button>` : ""}
      </div>
    </header>

    ${isNewOrg && app.can("people.manage") ? html`<section class="card setup">
      <div class="setup-copy"><h2 class="serif">Let's set up ${app.org.name}</h2><p>Three quick steps to a working people team.</p></div>
      <ol class="setup-steps">
        <li class="done">${icon("check")}<div><strong>Create your organization</strong><span>Done — you're the owner.</span></div></li>
        <li><span class="n">2</span><div><strong>Add your first employees</strong><span>Onboarding tasks are generated automatically.</span></div><button class="btn btn-primary btn-sm" data-add-emp>Add employee</button></li>
        <li><span class="n">3</span><div><strong>Connect Slack</strong><span>Post new hires and completed work to a channel.</span></div><a class="btn btn-secondary btn-sm" href="#/app/slack">Connect</a></li>
        <li><span class="n">4</span><div><strong>Pick a background</strong><span>Make the workspace feel like yours.</span></div><button class="btn btn-secondary btn-sm" data-appearance>Choose</button></li>
      </ol>
    </section>` : ""}

    <section class="stats">
      <a class="stat tone-mint" href="#/app/people"><span class="stat-label">${icon("users")}People</span><strong class="stat-value">${people.length}</strong><span class="stat-foot">${joining.length ? `+${joining.length} joining soon` : `${app.data.employees.filter((e) => e.status === "invited").length} invited`}</span></a>
      <a class="stat tone-sky" href="#/app/tasks"><span class="stat-label">${icon("tasks")}Open tasks</span><strong class="stat-value">${open.length}</strong><span class="stat-foot">${doneWeek.length} completed this week</span></a>
      <a class="stat tone-blush" href="#/app/tasks"><span class="stat-label">${icon("alert")}Overdue</span><strong class="stat-value">${overdue.length}</strong><span class="stat-foot">${overdue.length ? "Needs attention" : "Nothing overdue"}</span></a>
      <a class="stat tone-butter" href="#/app/people"><span class="stat-label">${icon("zap")}Onboarding</span><strong class="stat-value">${pipeline.length}</strong><span class="stat-foot">${pipeline.length ? "hires in progress" : "No active onboarding"}</span></a>
    </section>

    <div class="home-grid">
      <div class="home-col">
        <section class="card">
          <header class="card-head"><h2>Onboarding pipeline</h2>${app.can("people.manage") ? html`<button class="btn btn-ghost btn-sm" data-add-emp>${icon("plus")}Add hire</button>` : ""}</header>
          ${pipeline.length ? html`<ul class="pipeline">${pipeline.map(({ e, total, done, overdue: od }) => {
            const days = e.start_date ? daysBetween(today, e.start_date) : null;
            const when = days == null ? "No start date" : days > 0 ? `Starts in ${plural(days, "day")}` : days === 0 ? "Starts today" : `Day ${-days + 1}`;
            return html`<li><a href="#/app/people/${e.id}">
              ${avatar(e.full_name)}
              <span class="pipe-main"><strong>${e.full_name}</strong><small>${e.title || "—"}${e.department ? ` · ${e.department}` : ""}</small></span>
              <span class="pipe-when"><small>${when}</small>${od ? html`<span class="due overdue">${od} overdue</span>` : statusPill(e.status)}</span>
              <span class="pipe-progress"><small>${done}/${total}</small>${progressBar((done / total) * 100)}</span>
            </a></li>`;
          })}</ul>` : emptyState({ icon: "userPlus", title: "No one onboarding right now", text: "When you add an employee, their onboarding checklist appears here." })}
        </section>

        <section class="card">
          <header class="card-head"><h2>Your week</h2><a class="btn btn-ghost btn-sm" href="#/app/tasks">All my tasks ${icon("arrowRight")}</a></header>
          ${mine.length ? html`<div class="task-list">${mine.map((t) => taskRow(t))}</div>` : emptyState({ icon: "circleCheck", title: "Clear for the week", text: "Nothing assigned to you is due in the next 7 days." })}
        </section>
      </div>

      <div class="home-col">
        <section class="card">
          <header class="card-head"><h2>Activity</h2><span class="live-dot" title="Updates live"></span></header>
          ${app.data.activity.length ? html`<ul class="activity">${app.data.activity.slice(0, 12).map(activityLine)}</ul>` : emptyState({ icon: "activity", title: "No activity yet" })}
        </section>

        <section class="card">
          <header class="card-head"><h2>Team by department</h2></header>
          <ul class="bars">${deptRows.map(([d, n]) => html`<li><span>${d}</span><span class="bar"><span style="width:${(n / maxDept) * 100}%"></span></span><b>${n}</b></li>`)}</ul>
        </section>

        <section class="card boards-mini">
          <header class="card-head"><h2>Boards</h2>${app.can("boards.manage") ? html`<button class="btn btn-ghost btn-sm" data-new-board>${icon("plus")}New</button>` : ""}</header>
          ${app.data.boards.map((b) => {
            const bt = app.data.tasks.filter((t) => t.board_id === b.id);
            const done = bt.filter(isDone).length;
            return html`<a class="board-mini" href="#/app/boards/${b.id}"><span class="board-dot lg" style="--c:${b.color}"></span><span><strong>${b.name}</strong><small>${bt.length - done} open · ${done} done</small></span>${icon("chevronRight", "dim")}</a>`;
          })}
        </section>
      </div>
    </div>`;
}

export function bind(root) {
  bindTaskRows(root);
  on(root, "click", "[data-add-emp]", () => openEmployeeForm());
  on(root, "click", "[data-new-task]", () => quickTask());
  on(root, "click", "[data-new-board]", () => openBoardForm());
  on(root, "click", "[data-appearance]", () => openAppearanceDrawer());
}

export { go, fmtDate };
