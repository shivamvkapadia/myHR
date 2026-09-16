// Supabase backend. Same interface as local.js.
import { SLACK_FUNCTION } from "../config.js";
import { uid } from "../lib/dom.js";

const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

function check({ data, error }) {
  if (error) throw new Error(friendly(error));
  return data;
}

function friendly(error) {
  const msg = error.message || String(error);
  if (/duplicate key.*employees_org_id_email/i.test(msg)) return "That email is already in this organization.";
  if (/duplicate key.*organizations_slug/i.test(msg)) return "That workspace URL is taken.";
  if (/row-level security/i.test(msg)) return "You don't have permission to do that.";
  if (/Invalid login credentials/i.test(msg)) return "Email or password is incorrect.";
  if (/Email not confirmed/i.test(msg)) return "Confirm your email first — check your inbox for the link.";
  return msg;
}

export async function createSupabaseAdapter(url, anonKey) {
  const { createClient } = await import(SDK);
  // Read before the client consumes the URL fragment.
  const recovery = /type=recovery/.test(location.hash);
  const sb = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
  });

  const toUser = (u) => (u ? { id: u.id, email: u.email, full_name: u.user_metadata?.full_name || "" } : null);
  const redirectTo = () => location.origin + location.pathname;
  const one = (q) => q.select().single().then(check);

  return {
    mode: "supabase",
    client: sb,
    recovery,

    // ---------- auth ----------
    async getUser() {
      const { data } = await sb.auth.getSession();
      return toUser(data.session?.user);
    },
    onAuthChange(fn) {
      const { data } = sb.auth.onAuthStateChange((event, session) => fn(event, toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },

    async signUp({ email, password, full_name, org }) {
      const data = check(await sb.auth.signUp({
        email, password,
        options: { data: { full_name, pending_org: org || null }, emailRedirectTo: redirectTo() },
      }));
      return { user: toUser(data.user), needsConfirmation: !data.session };
    },

    async signIn({ email, password }) {
      const data = check(await sb.auth.signInWithPassword({ email, password }));
      return toUser(data.user);
    },

    async signInDemo() { throw new Error("The demo workspace is only available when Supabase isn't configured."); },
    async signOut() { await sb.auth.signOut(); },
    async resetPassword(email) { check(await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() })); return {}; },
    async updatePassword(password) { check(await sb.auth.updateUser({ password })); },

    async updateAccount({ full_name, password }) {
      const patch = {};
      if (full_name) patch.data = { full_name };
      if (password) patch.password = password;
      const data = check(await sb.auth.updateUser(patch));
      if (full_name) check(await sb.from("profiles").upsert({ id: data.user.id, full_name }));
      return toUser(data.user);
    },

    async getPreferences() {
      const { data } = await sb.from("profiles").select("preferences").maybeSingle();
      return data?.preferences && Object.keys(data.preferences).length ? data.preferences : null;
    },
    async savePreferences(preferences) {
      const { data } = await sb.auth.getSession();
      if (!data.session) return;
      await sb.from("profiles").upsert({ id: data.session.user.id, preferences, updated_at: new Date().toISOString() });
    },

    // ---------- orgs ----------
    // Creates the organization stored in user metadata at sign-up (used when
    // email confirmation delayed the session).
    async finishSignup() {
      const { data } = await sb.auth.getUser();
      const pending = data.user?.user_metadata?.pending_org;
      if (!pending) return null;
      const org = await this.createOrg({ ...pending, full_name: data.user.user_metadata.full_name });
      await sb.auth.updateUser({ data: { pending_org: null } });
      return org;
    },

    async claimInvites() {
      const { data, error } = await sb.rpc("claim_invites");
      if (error) console.warn("claim_invites:", error.message);
      return data || 0;
    },

    async listMemberships() {
      const { data: s } = await sb.auth.getSession();
      if (!s.session) return [];
      const rows = check(await sb.from("employees").select("*, org:organizations(*)").eq("user_id", s.session.user.id).neq("status", "offboarded"));
      return rows.filter((r) => r.org).map(({ org, ...employee }) => ({ org, employee }));
    },

    async slugAvailable(slug) { return check(await sb.rpc("slug_available", { p_slug: slug })); },
    async orgPublic(slug) { return (check(await sb.rpc("org_public", { p_slug: slug })) || [])[0] || null; },

    async createOrg({ name, slug, industry, size, full_name, title }) {
      return check(await sb.rpc("create_organization", {
        p_name: name, p_slug: slug, p_industry: industry || null, p_size: size || null, p_full_name: full_name || null, p_title: title || null,
      }));
    },
    async updateOrg(id, patch) { return one(sb.from("organizations").update(patch).eq("id", id)); },
    async deleteOrg(id) { check(await sb.from("organizations").delete().eq("id", id)); },

    // ---------- employees ----------
    async listEmployees(orgId) { return check(await sb.from("employees").select("*").eq("org_id", orgId).order("full_name")); },
    async createEmployee(orgId, data) {
      const row = { ...data, org_id: orgId, email: String(data.email).toLowerCase(), manager_id: data.manager_id || null, start_date: data.start_date || null };
      return one(sb.from("employees").insert(row));
    },
    async updateEmployee(id, patch) { return one(sb.from("employees").update(patch).eq("id", id)); },
    async deleteEmployee(id) { check(await sb.from("employees").delete().eq("id", id)); },

    // ---------- boards ----------
    async listBoards(orgId) { return check(await sb.from("boards").select("*").eq("org_id", orgId).order("created_at")); },
    async listColumns(orgId) { return check(await sb.from("board_columns").select("*").eq("org_id", orgId).order("position")); },
    async createBoard(orgId, { name, description = "", color = "#9bd8a9", columns = ["To do", "In progress", "Done"] }) {
      const board = await one(sb.from("boards").insert({ org_id: orgId, name, description, color }));
      check(await sb.from("board_columns").insert(columns.map((c, i) => ({ board_id: board.id, org_id: orgId, name: c, position: (i + 1) * 1000, is_done: i === columns.length - 1 }))));
      return board;
    },
    async updateBoard(id, patch) { return one(sb.from("boards").update(patch).eq("id", id)); },
    async deleteBoard(id) { check(await sb.from("boards").delete().eq("id", id)); },
    async createColumn(orgId, boardId, { name, is_done = false }) {
      const { data } = await sb.from("board_columns").select("position").eq("board_id", boardId).order("position", { ascending: false }).limit(1);
      return one(sb.from("board_columns").insert({ org_id: orgId, board_id: boardId, name, is_done, position: (data?.[0]?.position || 0) + 1000 }));
    },
    async updateColumn(id, patch) { return one(sb.from("board_columns").update(patch).eq("id", id)); },
    async deleteColumn(id) { check(await sb.from("board_columns").delete().eq("id", id)); },

    // ---------- tasks ----------
    async listTasks(orgId) { return check(await sb.from("tasks").select("*").eq("org_id", orgId).order("position")); },
    async createTask(orgId, data) {
      const { data: s } = await sb.auth.getSession();
      const { data: col } = await sb.from("board_columns").select("board_id").eq("id", data.column_id).single();
      let position = data.position;
      if (position == null) {
        const { data: last } = await sb.from("tasks").select("position").eq("column_id", data.column_id).order("position", { ascending: false }).limit(1);
        position = (last?.[0]?.position || 0) + 1000;
      }
      return one(sb.from("tasks").insert({
        org_id: orgId, board_id: col.board_id, column_id: data.column_id, title: data.title, description: data.description || null,
        assignee_id: data.assignee_id || null, due_date: data.due_date || null, priority: data.priority || "medium",
        labels: data.labels || [], checklist: data.checklist || [], position, created_by: s.session.user.id, source: "manual",
      }));
    },
    async updateTask(id, patch) {
      if (patch.column_id && !patch.board_id) {
        const { data: col } = await sb.from("board_columns").select("board_id").eq("id", patch.column_id).single();
        patch = { ...patch, board_id: col.board_id };
      }
      return one(sb.from("tasks").update(patch).eq("id", id));
    },
    async deleteTask(id) { check(await sb.from("tasks").delete().eq("id", id)); },

    // ---------- automations ----------
    async listAutomations(orgId) { return check(await sb.from("automations").select("*").eq("org_id", orgId).order("created_at")); },
    async createAutomation(orgId, data) { return one(sb.from("automations").insert({ ...data, org_id: orgId })); },
    async updateAutomation(id, patch) { return one(sb.from("automations").update(patch).eq("id", id)); },
    async deleteAutomation(id) { check(await sb.from("automations").delete().eq("id", id)); },

    // ---------- slack ----------
    async getIntegration(orgId) {
      const { data } = await sb.from("org_integrations").select("*").eq("org_id", orgId).maybeSingle();
      return data || { org_id: orgId, slack_webhook_url: "", slack_channel: "", events: {} };
    },
    async saveIntegration(orgId, data) {
      return one(sb.from("org_integrations").upsert({ org_id: orgId, ...data, updated_at: new Date().toISOString() }));
    },
    async sendSlack(orgId, kind) {
      const { data, error } = await sb.functions.invoke(SLACK_FUNCTION, { body: { kind, org_id: orgId } });
      if (error) {
        let detail = error.message;
        try { detail = (await error.context?.json())?.error || detail; } catch {}
        throw new Error(/Failed to send|not found|404/i.test(detail)
          ? `Couldn't reach the "${SLACK_FUNCTION}" Edge Function. Deploy it first (see README → Slack).`
          : detail);
      }
      return data;
    },

    // ---------- agent keys ----------
    agentEndpoint() { return `${url.replace(/\/$/, "")}/functions/v1/agent-api`; },
    async listAgentKeys(orgId) {
      return check(await sb.from("agent_keys").select("*").eq("org_id", orgId).order("created_at", { ascending: false }));
    },
    async createAgentKey(orgId, { name, role }) {
      const { generateAgentKey } = await import("../lib/keys.js");
      const { key, hash, prefix } = await generateAgentKey();
      const row = await one(sb.from("agent_keys").insert({ org_id: orgId, name, role, key_hash: hash, key_prefix: prefix }));
      return { key, row };
    },
    async revokeAgentKey(id) {
      return one(sb.from("agent_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id));
    },

    // ---------- files ----------
    async listFiles(orgId) { return check(await sb.from("files").select("*").eq("org_id", orgId).order("created_at", { ascending: false })); },
    async uploadFile(orgId, file, uploaderName) {
      const { data: s } = await sb.auth.getSession();
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${orgId}/${uid()}-${safe}`;
      check(await sb.storage.from("org-files").upload(path, file, { contentType: file.type || "application/octet-stream" }));
      return one(sb.from("files").insert({ org_id: orgId, name: file.name, size: file.size, mime: file.type, path, uploaded_by: s.session.user.id, uploaded_by_name: uploaderName }));
    },
    async fileUrl(file) {
      const data = check(await sb.storage.from("org-files").createSignedUrl(file.path, 120, { download: file.name }));
      return data.signedUrl;
    },
    async deleteFile(file) {
      check(await sb.storage.from("org-files").remove([file.path]));
      check(await sb.from("files").delete().eq("id", file.id));
    },

    // ---------- activity / realtime ----------
    async listActivity(orgId, limit = 30) {
      return check(await sb.from("activity").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit));
    },
    subscribe(orgId, fn) {
      const channel = sb.channel(`org-${orgId}`);
      for (const table of ["tasks", "employees", "activity", "boards", "board_columns"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `org_id=eq.${orgId}` }, () => fn({ table }));
      }
      channel.subscribe();
      return () => sb.removeChannel(channel);
    },

    async resetDemo() {},
  };
}
