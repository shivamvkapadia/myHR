// Global app state: backend, session, current organization and its data.
import { can as canRole, rank } from "./lib/perms.js";
import { todayISO, debounce } from "./lib/dom.js";
import { getAppearance, setAppearance, onAppearance } from "./theme.js";

const ORG_KEY = "myhr:org";
const EMPTY_DATA = () => ({ employees: [], boards: [], columns: [], tasks: [], activity: [], automations: [], files: [] });

export const app = {
  backend: null,
  user: null,
  memberships: [],
  org: null,
  me: null,
  realRole: null,
  previewRole: null,
  data: EMPTY_DATA(),
  unsubscribe: null,
  rerender: () => {},

  get role() { return this.previewRole || this.realRole; },
  get demo() { return this.backend?.mode === "demo"; },
  can(key) { return canRole(this.role, key); },
  emp(id) { return id ? this.data.employees.find((e) => e.id === id) || null : null; },
  board(id) { return this.data.boards.find((b) => b.id === id) || null; },
  column(id) { return this.data.columns.find((c) => c.id === id) || null; },
  columnsOf(boardId) { return this.data.columns.filter((c) => c.board_id === boardId).sort((a, b) => a.position - b.position); },
  canEditTask(t) {
    if (this.can("tasks.editAny")) return true;
    if (this.me && t.assignee_id === this.me.id) return true;
    return !this.previewRole && t.created_by === this.user?.id;
  },
  inviteLink(emp) {
    return `${location.origin}${location.pathname}#/join/${this.org.slug}?email=${encodeURIComponent(emp.email)}`;
  },
  setPreviewRole(role) {
    this.previewRole = role && rank(role) < rank(this.realRole) ? role : null;
  },
};

export const isDone = (t) => !!t.completed_at;
export const isOverdue = (t) => !t.completed_at && t.due_date && t.due_date < todayISO();

// ---------- session ----------
export async function afterSignIn() {
  app.user = await app.backend.getUser();
  if (!app.user) return false;
  await app.backend.claimInvites();
  try {
    await app.backend.finishSignup();
  } catch (e) {
    console.warn("finishSignup:", e.message);
  }
  const prefs = await app.backend.getPreferences().catch(() => null);
  if (prefs) setAppearance({ ...prefs, customImage: prefs.customImage ?? getAppearance().customImage }, { silent: true });
  await loadMemberships();
  return true;
}

export async function loadMemberships() {
  app.memberships = (await app.backend.listMemberships()).sort((a, b) => a.org.name.localeCompare(b.org.name));
  return app.memberships;
}

export function preferredOrgId() {
  const saved = localStorage.getItem(ORG_KEY);
  return app.memberships.find((m) => m.org.id === saved)?.org.id || app.memberships[0]?.org.id;
}

export async function selectOrg(orgId) {
  const m = app.memberships.find((x) => x.org.id === orgId) || app.memberships[0];
  if (!m) return;
  app.org = m.org;
  app.me = m.employee;
  app.realRole = m.employee.role;
  app.previewRole = null;
  localStorage.setItem(ORG_KEY, m.org.id);
  app.data = EMPTY_DATA();
  app.unsubscribe?.();
  await loadOrgData();
  let timer;
  app.unsubscribe = app.backend.subscribe(m.org.id, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await loadOrgData();
      app.rerender();
    }, 350);
  });
}

export async function loadOrgData(keys) {
  const b = app.backend;
  const id = app.org.id;
  const loaders = {
    employees: () => b.listEmployees(id),
    boards: () => b.listBoards(id),
    columns: () => b.listColumns(id),
    tasks: () => b.listTasks(id),
    activity: () => b.listActivity(id, 40),
    automations: () => (canRole(app.realRole, "automations.view") ? b.listAutomations(id) : Promise.resolve([])),
    files: () => b.listFiles(id),
  };
  const list = keys || Object.keys(loaders);
  const results = await Promise.all(list.map((k) => loaders[k]()));
  list.forEach((k, i) => (app.data[k] = results[i]));
  if (list.includes("employees")) {
    const me = app.data.employees.find((e) => e.user_id === app.user.id);
    if (me) {
      app.me = me;
      app.realRole = me.role;
      if (app.previewRole && rank(app.previewRole) >= rank(me.role)) app.previewRole = null;
    }
  }
}

export async function refresh(keys, opts = { force: true }) {
  await loadOrgData(keys);
  app.rerender(opts);
}

export function resetApp() {
  app.unsubscribe?.();
  Object.assign(app, { user: null, memberships: [], org: null, me: null, realRole: null, previewRole: null, unsubscribe: null, data: EMPTY_DATA() });
}

// Sync appearance to the profile so it follows the user across devices.
const persist = debounce((a) => {
  if (!app.user) return;
  const prefs = { ...a };
  if (prefs.customImage?.startsWith("data:") && prefs.customImage.length > 400_000) delete prefs.customImage;
  app.backend.savePreferences(prefs).catch(() => {});
}, 800);
onAppearance(persist);
