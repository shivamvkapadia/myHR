// Small presentational pieces shared across views.
import { html, avatar, dueLabel, todayISO } from "../lib/dom.js";
import { ROLE_META } from "../lib/perms.js";

export const DEPARTMENTS = ["Engineering", "Design", "Product", "Sales", "Marketing", "Support", "People", "Operations", "Finance"];

export const STATUS = {
  invited: "Invited",
  active: "Active",
  on_leave: "On leave",
  offboarded: "Offboarded",
};

export const EMPLOYMENT = { full_time: "Full-time", part_time: "Part-time", contractor: "Contractor", intern: "Intern" };

export const PRIORITY = {
  urgent: { label: "Urgent", bars: 4 },
  high: { label: "High", bars: 3 },
  medium: { label: "Medium", bars: 2 },
  low: { label: "Low", bars: 1 },
};

export const BOARD_COLORS = ["#9bd8a9", "#9cc7f2", "#f3d37a", "#f2b3a8", "#c5b6f0", "#d9d6cf"];

export const rolePill = (role) => html`<span class="pill role-${role}">${ROLE_META[role]?.label || role}</span>`;

export const statusPill = (status) => html`<span class="pill status status-${status}"><i></i>${STATUS[status] || status}</span>`;

export function priorityMark(p = "medium", withLabel = false) {
  const meta = PRIORITY[p] || PRIORITY.medium;
  const bars = [1, 2, 3, 4].map((n) => html`<b class="${n <= meta.bars ? "on" : ""}"></b>`);
  return html`<span class="prio prio-${p}" title="${meta.label} priority"><span class="prio-bars">${bars}</span>${withLabel ? html`<span>${meta.label}</span>` : ""}</span>`;
}

export function dueChip(t) {
  if (!t.due_date) return "";
  const today = todayISO();
  const cls = t.completed_at ? "done" : t.due_date < today ? "overdue" : t.due_date === today ? "today" : "";
  return html`<span class="due ${cls}">${dueLabel(t.due_date)}</span>`;
}

export function person(emp, { sub, size = "" } = {}) {
  if (!emp) return html`<span class="person muted-text">Unassigned</span>`;
  return html`<span class="person">${avatar(emp.full_name, size)}<span class="person-text"><span class="person-name">${emp.full_name}</span>${sub ? html`<span class="person-sub">${sub}</span>` : ""}</span></span>`;
}

export const progressBar = (pct, cls = "") =>
  html`<span class="progress ${cls}"><span style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></span></span>`;

export const labelChips = (labels = []) => labels.map((l) => html`<span class="label-chip">${l}</span>`);

export function segmented(name, options, value) {
  return html`<div class="seg" role="radiogroup" data-seg="${name}">
    ${options.map((o) => html`<button type="button" role="radio" class="seg-btn ${o.value === value ? "active" : ""}" aria-checked="${o.value === value}" data-value="${o.value}">${o.icon || ""}${o.label}</button>`)}
  </div>`;
}

export const kbd = (k) => html`<kbd>${k}</kbd>`;

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
