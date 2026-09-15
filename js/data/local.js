// Demo-mode backend: same interface as supabase.js, persisted in localStorage.
// Mirrors the database triggers (activity log, automations, completed_at).
import { uid, todayISO, addDays, fmtDate } from "../lib/dom.js";
import { idbPut, idbGet, idbDel, idbClear } from "../lib/idb.js";
import { buildSeed, DEMO_EMAIL, DEMO_PASSWORD } from "./seed.js";
import { slackMessage } from "../lib/slack.js";

const KEY = "myhr:demo-db:v1";
const EMPTY = () => ({
  users: [], session: null, profiles: {}, organizations: [], employees: [], boards: [], columns: [],
  tasks: [], automations: [], integrations: [], files: [], activity: [],
});

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const fail = (message) => { throw new Error(message); };

export function createLocalAdapter() {
  let db = load();
  const authListeners = new Set();
  const changeListeners = new Set();

  function load() {
    try { return { ...EMPTY(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
    catch { return EMPTY(); }
  }
  // Same-tab writes re-render through app.refresh(); listeners only hear other tabs.
  function save() {
    localStorage.setItem(KEY, JSON.stringify(db));
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    db = load();
    changeListeners.forEach((fn) => fn({ table: "*" }));
  });

  const me = () => db.users.find((u) => u.id === db.session?.user_id) || null;
  const publicUser = (u) => (u ? { id: u.id, email: u.email, full_name: u.full_name } : null);
  const myEmployee = (orgId) => db.employees.find((e) => e.org_id === orgId && e.user_id === db.session?.user_id);
  const actorName = (orgId) => myEmployee(orgId)?.full_name || me()?.full_name || "myHR";
  const emitAuth = (event) => authListeners.forEach((fn) => fn(event, publicUser(me())));

  function log(orgId, verb, target, meta = {}, actor) {
    db.activity.unshift({ id: uid(), org_id: orgId, actor_name: actor || actorName(orgId), verb, target, meta, created_at: new Date().toISOString() });
    db.activity = db.activity.slice(0, 400);
  }

  function notifySlack(orgId, event, data) {
    const integ = db.integrations.find((i) => i.org_id === orgId);
    if (!integ?.slack_webhook_url || integ.events?.[event] === false) return;
    postToSlack(integ.slack_webhook_url, slackMessage(event, data)).catch(() => {});
  }

  async function postToSlack(url, text) {
    // Slack webhooks don't send CORS headers, so the response is opaque in the browser.
    await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ text }) });
  }

  function runAutomations(emp, trigger) {
    let created = 0;
    const creator = myEmployee(emp.org_id);
    for (const a of db.automations.filter((x) => x.org_id === emp.org_id && x.enabled && x.trigger === trigger && x.board_id)) {
      if (a.department && a.department !== emp.department) continue;
      const col = db.columns.filter((c) => c.board_id === a.board_id).sort((x, y) => x.is_done - y.is_done || x.position - y.position)[0];
      if (!col) continue;
      let pos = Math.max(0, ...db.tasks.filter((t) => t.column_id === col.id).map((t) => t.position));
      const base = trigger === "employee_added" ? emp.start_date || todayISO() : todayISO();
      for (const s of a.steps) {
        pos += 1000;
        const assignee = s.assign_to === "employee" ? emp.id : s.assign_to === "manager" ? emp.manager_id : s.assign_to === "creator" ? creator?.id : null;
        db.tasks.push({
          id: uid(), org_id: emp.org_id, board_id: a.board_id, column_id: col.id,
          title: String(s.title || "Untitled step").replaceAll("{name}", emp.full_name).slice(0, 200),
          description: s.description || "", assignee_id: assignee || null, due_date: addDays(base, Number(s.offset_days) || 0),
          priority: s.priority || "medium", labels: [trigger === "employee_added" ? "onboarding" : "offboarding"], checklist: [],
          position: pos, source: "automation", automation_id: a.id, subject_employee_id: emp.id, completed_at: null,
          created_by: db.session?.user_id || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
        created++;
      }
      a.run_count = (a.run_count || 0) + 1;
      a.last_run_at = new Date().toISOString();
      log(emp.org_id, "ran automation", a.name, { employee: emp.full_name, tasks: a.steps.length });
    }
    return created;
  }

  function seedDemo() {
    const s = buildSeed();
    db.users.push({ ...s.user, pw: null, demo: true });
    db.organizations.push(s.org);
    db.employees.push(...s.employees);
    db.boards.push(...s.boards);
    db.columns.push(...s.columns);
    db.tasks.push(...s.tasks);
    db.automations.push(...s.automations);
    db.integrations.push(s.integration);
    db.activity.push(...s.activity);
    // Replay onboarding so the pipeline has realistic, partially-complete checklists.
    const prevSession = db.session;
    db.session = { user_id: s.user.id };
    s.replayOnboarding.forEach((id, i) => {
      const emp = db.employees.find((e) => e.id === id);
      runAutomations(emp, "employee_added");
      const theirs = db.tasks.filter((t) => t.subject_employee_id === id).sort((a, b) => a.due_date.localeCompare(b.due_date));
      const doneCount = [1, 1, 2, 4, 5][i] ?? 0;
      theirs.slice(0, doneCount).forEach((t) => {
        const done = db.columns.find((c) => c.board_id === t.board_id && c.is_done);
        t.column_id = done.id;
        t.completed_at = new Date(Date.now() - 3600e3 * (i + 2)).toISOString();
      });
    });
    db.activity.sort((a, b) => b.created_at.localeCompare(a.created_at));
    db.session = prevSession;
    return s.user.id;
  }

  const byOrg = (list, orgId) => clone(list.filter((x) => x.org_id === orgId));
  const find = (list, id, what) => list.find((x) => x.id === id) || fail(`${what} not found`);

  function applyCompletion(task) {
    const col = db.columns.find((c) => c.id === task.column_id);
    if (col?.is_done) task.completed_at = task.completed_at || new Date().toISOString();
    else task.completed_at = null;
  }

  return {
    mode: "demo",

    // ---------- auth ----------
    async getUser() { return publicUser(me()); },
    onAuthChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },

    async signUp({ email, password, full_name, org }) {
      email = email.toLowerCase();
      if (db.users.some((u) => u.email === email)) fail("An account with this email already exists. Sign in instead.");
      const user = { id: uid(), email, full_name, pw: await sha256(password) };
      db.users.push(user);
      db.session = { user_id: user.id };
      db.profiles[user.id] = { full_name, preferences: {} };
      save("users");
      if (org) await this.createOrg({ ...org, full_name });
      emitAuth("SIGNED_IN");
      return { user: publicUser(user), needsConfirmation: false };
    },

    async signIn({ email, password }) {
      email = email.toLowerCase();
      if (email === DEMO_EMAIL && password === DEMO_PASSWORD) return this.signInDemo();
      const user = db.users.find((u) => u.email === email);
      if (!user || user.demo || user.pw !== (await sha256(password))) fail("Email or password is incorrect.");
      db.session = { user_id: user.id };
      save("session");
      emitAuth("SIGNED_IN");
      return publicUser(user);
    },

    async signInDemo() {
      let user = db.users.find((u) => u.email === DEMO_EMAIL);
      const id = user ? user.id : seedDemo();
      db.session = { user_id: id };
      save("session");
      emitAuth("SIGNED_IN");
      return publicUser(db.users.find((u) => u.id === id));
    },

    async signOut() { db.session = null; save("session"); emitAuth("SIGNED_OUT"); },
    async resetPassword() { return { demo: true }; },
    async updatePassword() { fail("Password reset emails need Supabase. In Demo mode, create a new account instead."); },

    async updateAccount({ full_name, password }) {
      const u = me() || fail("Not signed in");
      if (full_name) {
        u.full_name = full_name;
        db.profiles[u.id] = { ...(db.profiles[u.id] || {}), full_name };
      }
      if (password) {
        if (u.demo) fail("The shared demo account's password can't be changed.");
        u.pw = await sha256(password);
      }
      save("users");
      return publicUser(u);
    },

    async getPreferences() { return clone(db.profiles[db.session?.user_id]?.preferences || null); },
    async savePreferences(preferences) {
      if (!db.session) return;
      db.profiles[db.session.user_id] = { ...(db.profiles[db.session.user_id] || {}), preferences };
      localStorage.setItem(KEY, JSON.stringify(db));
    },

    // ---------- orgs ----------
    async finishSignup() { return null; },

    async claimInvites() {
      const u = me();
      if (!u) return 0;
      let n = 0;
      db.employees.forEach((e) => {
        if (e.email.toLowerCase() === u.email && !e.user_id && e.status !== "offboarded") {
          e.user_id = u.id;
          if (e.status === "invited") e.status = "active";
          log(e.org_id, "joined", "the workspace", {}, e.full_name);
          n++;
        }
      });
      if (n) save("employees");
      return n;
    },

    async listMemberships() {
      const uidNow = db.session?.user_id;
      return db.employees
        .filter((e) => e.user_id === uidNow && e.status !== "offboarded")
        .map((e) => ({ employee: clone(e), org: clone(db.organizations.find((o) => o.id === e.org_id)) }))
        .filter((m) => m.org);
    },

    async slugAvailable(slug) { return !db.organizations.some((o) => o.slug === slug); },
    async orgPublic(slug) {
      const o = db.organizations.find((x) => x.slug === slug);
      return o ? { id: o.id, name: o.name } : null;
    },

    async createOrg({ name, slug, industry, size, full_name, title }) {
      const u = me() || fail("Sign in first.");
      if (db.organizations.some((o) => o.slug === slug)) fail("That workspace URL is taken.");
      const org = { id: uid(), name, slug, industry, size, created_at: new Date().toISOString() };
      db.organizations.push(org);
      db.employees.push({
        id: uid(), org_id: org.id, user_id: u.id, full_name: full_name || u.full_name, email: u.email, title: title || "Founder",
        department: "People", role: "owner", manager_id: null, employment_type: "full_time", location: "", phone: "",
        start_date: todayISO(), status: "active", created_at: new Date().toISOString(),
      });
      const mk = (bname, description, color, cols) => {
        const b = { id: uid(), org_id: org.id, name: bname, description, color, created_at: new Date().toISOString() };
        db.boards.push(b);
        cols.forEach((c, i) => db.columns.push({ id: uid(), board_id: b.id, org_id: org.id, name: c, position: (i + 1) * 1000, is_done: c === "Done" }));
        return b;
      };
      const ops = mk("People Ops", "Onboarding, offboarding and HR operations", "#9bd8a9", ["To do", "In progress", "Done"]);
      mk("Team Tasks", "Day-to-day work for the whole team", "#9cc7f2", ["Backlog", "This week", "In review", "Done"]);
      const seed = buildSeed().automations.filter((a) => !a.department);
      seed.forEach((a) => db.automations.push({ ...a, id: uid(), org_id: org.id, board_id: ops.id, run_count: 0, last_run_at: null, created_at: new Date().toISOString() }));
      db.integrations.push({ org_id: org.id, slack_webhook_url: "", slack_channel: "", events: { task_created: true, task_completed: true, employee_added: true, employee_offboarded: true } });
      log(org.id, "created", org.name, { kind: "organization" });
      save("organizations");
      return clone(org);
    },

    async updateOrg(id, patch) {
      const o = find(db.organizations, id, "Organization");
      if (patch.slug && patch.slug !== o.slug && db.organizations.some((x) => x.slug === patch.slug)) fail("That workspace URL is taken.");
      Object.assign(o, patch);
      save("organizations");
      return clone(o);
    },

    async deleteOrg(id) {
      for (const k of ["employees", "boards", "columns", "tasks", "automations", "integrations", "files", "activity"]) db[k] = db[k].filter((x) => x.org_id !== id);
      db.organizations = db.organizations.filter((o) => o.id !== id);
      save("organizations");
    },

    // ---------- employees ----------
    async listEmployees(orgId) { return byOrg(db.employees, orgId); },

    async createEmployee(orgId, data) {
      const email = String(data.email || "").toLowerCase();
      if (db.employees.some((e) => e.org_id === orgId && e.email.toLowerCase() === email)) fail(`${email} is already in this organization.`);
      const emp = {
        id: uid(), org_id: orgId, user_id: null, full_name: data.full_name, email, title: data.title || "", department: data.department || "",
        role: data.role || "employee", manager_id: data.manager_id || null, employment_type: data.employment_type || "full_time",
        location: data.location || "", phone: data.phone || "", start_date: data.start_date || null, status: data.status || "invited",
        created_at: new Date().toISOString(),
      };
      // Someone who already has a Demo account with this email joins immediately.
      const existing = db.users.find((u) => u.email === email);
      if (existing) { emp.user_id = existing.id; if (emp.status === "invited") emp.status = "active"; }
      db.employees.push(emp);
      log(orgId, "added", emp.full_name, { employee_id: emp.id, title: emp.title });
      const tasks = emp.status !== "offboarded" ? runAutomations(emp, "employee_added") : 0;
      save("employees");
      notifySlack(orgId, "employee_added", { name: emp.full_name, title: emp.title, department: emp.department, start: emp.start_date ? fmtDate(emp.start_date) : "", tasks });
      return clone(emp);
    },

    async updateEmployee(id, patch) {
      const e = find(db.employees, id, "Employee");
      const before = { ...e };
      if (patch.email) patch.email = patch.email.toLowerCase();
      if (before.role === "owner" && ((patch.role && patch.role !== "owner") || patch.status === "offboarded")) {
        const owners = db.employees.filter((x) => x.org_id === e.org_id && x.role === "owner" && x.status !== "offboarded");
        if (owners.length < 2) fail("An organization needs at least one owner.");
      }
      Object.assign(e, patch);
      if (e.status === "offboarded" && before.status !== "offboarded") {
        log(e.org_id, "offboarded", e.full_name, { employee_id: e.id });
        const tasks = runAutomations(e, "employee_offboarded");
        notifySlack(e.org_id, "employee_offboarded", { name: e.full_name, tasks });
      } else if (e.role !== before.role) {
        log(e.org_id, "changed role of", e.full_name, { employee_id: e.id, role: e.role });
      }
      save("employees");
      return clone(e);
    },

    async deleteEmployee(id) {
      const e = find(db.employees, id, "Employee");
      if (e.user_id === db.session?.user_id) fail("You can't remove yourself.");
      db.employees = db.employees.filter((x) => x.id !== id);
      db.tasks.forEach((t) => { if (t.assignee_id === id) t.assignee_id = null; });
      log(e.org_id, "removed", e.full_name);
      save("employees");
    },

    // ---------- boards ----------
    async listBoards(orgId) { return byOrg(db.boards, orgId).sort((a, b) => a.created_at.localeCompare(b.created_at)); },
    async listColumns(orgId) { return byOrg(db.columns, orgId).sort((a, b) => a.position - b.position); },

    async createBoard(orgId, { name, description = "", color = "#9bd8a9", columns = ["To do", "In progress", "Done"] }) {
      const b = { id: uid(), org_id: orgId, name, description, color, created_at: new Date().toISOString() };
      db.boards.push(b);
      columns.forEach((c, i) => db.columns.push({ id: uid(), board_id: b.id, org_id: orgId, name: c, position: (i + 1) * 1000, is_done: i === columns.length - 1 }));
      log(orgId, "created board", name);
      save("boards");
      return clone(b);
    },
    async updateBoard(id, patch) { const b = find(db.boards, id, "Board"); Object.assign(b, patch); save("boards"); return clone(b); },
    async deleteBoard(id) {
      db.boards = db.boards.filter((b) => b.id !== id);
      db.columns = db.columns.filter((c) => c.board_id !== id);
      db.tasks = db.tasks.filter((t) => t.board_id !== id);
      db.automations.forEach((a) => { if (a.board_id === id) a.board_id = null; });
      save("boards");
    },

    async createColumn(orgId, boardId, { name, is_done = false }) {
      const pos = Math.max(0, ...db.columns.filter((c) => c.board_id === boardId).map((c) => c.position)) + 1000;
      const c = { id: uid(), board_id: boardId, org_id: orgId, name, position: pos, is_done };
      db.columns.push(c);
      save("columns");
      return clone(c);
    },
    async updateColumn(id, patch) {
      const c = find(db.columns, id, "Column");
      Object.assign(c, patch);
      db.tasks.filter((t) => t.column_id === id).forEach(applyCompletion);
      save("columns");
      return clone(c);
    },
    async deleteColumn(id) {
      db.columns = db.columns.filter((c) => c.id !== id);
      db.tasks = db.tasks.filter((t) => t.column_id !== id);
      save("columns");
    },

    // ---------- tasks ----------
    async listTasks(orgId) { return byOrg(db.tasks, orgId); },

    async createTask(orgId, data) {
      const col = find(db.columns, data.column_id, "Column");
      const t = {
        id: uid(), org_id: orgId, board_id: col.board_id, column_id: col.id, title: data.title, description: data.description || "",
        assignee_id: data.assignee_id || null, due_date: data.due_date || null, priority: data.priority || "medium", labels: data.labels || [],
        checklist: data.checklist || [], position: data.position ?? Math.max(0, ...db.tasks.filter((x) => x.column_id === col.id).map((x) => x.position)) + 1000,
        source: "manual", automation_id: null, subject_employee_id: null, completed_at: null, created_by: db.session?.user_id,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      applyCompletion(t);
      db.tasks.push(t);
      log(orgId, "created", t.title, { task_id: t.id });
      save("tasks");
      const board = db.boards.find((b) => b.id === t.board_id);
      const assignee = db.employees.find((e) => e.id === t.assignee_id);
      notifySlack(orgId, "task_created", { actor: actorName(orgId), title: t.title, board: board?.name, assignee: assignee?.full_name, due: t.due_date ? fmtDate(t.due_date) : "" });
      return clone(t);
    },

    async updateTask(id, patch) {
      const t = find(db.tasks, id, "Task");
      const wasDone = !!t.completed_at;
      if (patch.column_id) patch.board_id = find(db.columns, patch.column_id, "Column").board_id;
      Object.assign(t, patch, { updated_at: new Date().toISOString() });
      applyCompletion(t);
      if (!wasDone && t.completed_at) {
        log(t.org_id, "completed", t.title, { task_id: t.id });
        notifySlack(t.org_id, "task_completed", { actor: actorName(t.org_id), title: t.title, board: db.boards.find((b) => b.id === t.board_id)?.name });
      }
      save("tasks");
      return clone(t);
    },

    async deleteTask(id) { db.tasks = db.tasks.filter((t) => t.id !== id); save("tasks"); },

    // ---------- automations ----------
    async listAutomations(orgId) { return byOrg(db.automations, orgId).sort((a, b) => a.created_at.localeCompare(b.created_at)); },
    async createAutomation(orgId, data) {
      const a = { id: uid(), org_id: orgId, run_count: 0, last_run_at: null, created_at: new Date().toISOString(), enabled: true, ...data };
      db.automations.push(a);
      log(orgId, "created automation", a.name);
      save("automations");
      return clone(a);
    },
    async updateAutomation(id, patch) { const a = find(db.automations, id, "Automation"); Object.assign(a, patch); save("automations"); return clone(a); },
    async deleteAutomation(id) { db.automations = db.automations.filter((a) => a.id !== id); save("automations"); },

    // ---------- slack ----------
    async getIntegration(orgId) { return clone(db.integrations.find((i) => i.org_id === orgId) || { org_id: orgId, slack_webhook_url: "", slack_channel: "", events: {} }); },
    async saveIntegration(orgId, data) {
      let i = db.integrations.find((x) => x.org_id === orgId);
      if (!i) db.integrations.push((i = { org_id: orgId }));
      Object.assign(i, data);
      save("integrations");
      return clone(i);
    },
    async sendSlack(orgId, kind, text) {
      const integ = db.integrations.find((i) => i.org_id === orgId);
      if (!integ?.slack_webhook_url) fail("Add a Slack webhook URL first.");
      await postToSlack(integ.slack_webhook_url, text);
      log(orgId, kind === "digest" ? "sent Slack digest to" : "sent a test message to", integ.slack_channel || "Slack");
      save("activity");
      return { ok: true, opaque: true };
    },

    // ---------- files ----------
    async listFiles(orgId) { return byOrg(db.files, orgId).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async uploadFile(orgId, file) {
      const id = uid();
      await idbPut(id, file);
      const f = { id, org_id: orgId, name: file.name, size: file.size, mime: file.type, path: `${orgId}/${id}`, uploaded_by: db.session?.user_id, uploaded_by_name: actorName(orgId), created_at: new Date().toISOString() };
      db.files.push(f);
      log(orgId, "uploaded", file.name);
      save("files");
      return clone(f);
    },
    async fileUrl(file) {
      const blob = await idbGet(file.id);
      if (!blob) fail("This file's contents aren't stored in this browser.");
      return URL.createObjectURL(blob);
    },
    async deleteFile(file) { await idbDel(file.id); db.files = db.files.filter((f) => f.id !== file.id); save("files"); },

    // ---------- activity / realtime ----------
    async listActivity(orgId, limit = 30) { return byOrg(db.activity, orgId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit); },
    subscribe(_orgId, fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); },

    async resetDemo() {
      localStorage.removeItem(KEY);
      await idbClear().catch(() => {});
      db = EMPTY();
      emitAuth("SIGNED_OUT");
    },
  };
}
