// Demo workspace used by "Explore the live demo" and the local adapter.
import { uid, todayISO, addDays } from "../lib/dom.js";

export const DEMO_EMAIL = "demo@myhr.app";
export const DEMO_PASSWORD = "demo-workspace";

const PEOPLE = [
  // name, title, department, role, status, startOffsetDays, type, location
  ["Jordan Reyes", "Head of People", "People", "owner", "active", -900, "full_time", "Chicago"],
  ["Priya Natarajan", "VP Engineering", "Engineering", "admin", "active", -820, "full_time", "Chicago"],
  ["Marcus Okafor", "Engineering Manager", "Engineering", "manager", "active", -640, "full_time", "Remote"],
  ["Lena Fischer", "Staff Engineer", "Engineering", "employee", "active", -560, "full_time", "Berlin"],
  ["Diego Alvarez", "Senior Engineer", "Engineering", "employee", "active", -410, "full_time", "Austin"],
  ["Hana Sato", "Engineer", "Engineering", "employee", "active", -150, "full_time", "Remote"],
  ["Tomás Silva", "Engineer", "Engineering", "employee", "invited", 4, "full_time", "Lisbon"],
  ["Aisha Bello", "Engineering Intern", "Engineering", "employee", "invited", 9, "intern", "Chicago"],
  ["Noor Haddad", "Design Lead", "Design", "manager", "active", -700, "full_time", "New York"],
  ["Felix Wagner", "Product Designer", "Design", "employee", "active", -300, "full_time", "Remote"],
  ["Mei Lin", "Brand Designer", "Design", "employee", "on_leave", -260, "part_time", "Toronto"],
  ["Samuel Price", "Product Manager", "Product", "manager", "active", -520, "full_time", "Chicago"],
  ["Grace Owusu", "Product Analyst", "Product", "employee", "active", -60, "full_time", "Remote"],
  ["Ravi Kapoor", "Head of Sales", "Sales", "manager", "active", -610, "full_time", "New York"],
  ["Chloé Martin", "Account Executive", "Sales", "employee", "active", -330, "full_time", "Paris"],
  ["Ben Carter", "Account Executive", "Sales", "employee", "active", -12, "full_time", "Austin"],
  ["Isabela Costa", "Sales Development Rep", "Sales", "employee", "invited", 14, "full_time", "Remote"],
  ["Owen Brooks", "Support Lead", "Support", "manager", "active", -480, "full_time", "Denver"],
  ["Yara Nasser", "Support Specialist", "Support", "employee", "active", -200, "full_time", "Remote"],
  ["Kenji Watanabe", "Support Specialist", "Support", "employee", "active", -90, "contractor", "Osaka"],
  ["Elena Petrova", "People Partner", "People", "admin", "active", -450, "full_time", "Chicago"],
  ["Luca Romano", "Recruiter", "People", "employee", "active", -180, "full_time", "Milan"],
  ["Zoe Adams", "Operations Manager", "Operations", "manager", "active", -380, "full_time", "Chicago"],
  ["Daniel Kim", "Finance Associate", "Operations", "employee", "active", -240, "full_time", "Seattle"],
  ["Fatima Zahra", "IT Administrator", "Operations", "employee", "active", -350, "full_time", "Remote"],
  ["Arjun Mehta", "Data Engineer", "Engineering", "employee", "offboarded", -700, "full_time", "Remote"],
];

const MANAGER_OF = {
  Engineering: "Marcus Okafor",
  Design: "Noor Haddad",
  Product: "Samuel Price",
  Sales: "Ravi Kapoor",
  Support: "Owen Brooks",
  People: "Jordan Reyes",
  Operations: "Zoe Adams",
};

export function buildSeed() {
  const today = todayISO();
  const orgId = uid();
  const userId = uid();
  const now = Date.now();
  const ts = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();

  const org = { id: orgId, name: "Northwind Studio", slug: "northwind", industry: "Software", size: "11-50", created_at: ts(900 * 1440) };

  const employees = PEOPLE.map(([full_name, title, department, role, status, start, employment_type, location], i) => {
    const first = full_name.split(" ")[0].toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
    return {
      id: uid(), org_id: orgId, user_id: i === 0 ? userId : status === "invited" ? null : uid(),
      full_name, email: i === 0 ? DEMO_EMAIL : `${first}@northwind.studio`, title, department, role,
      manager_id: null, employment_type, location, phone: "", start_date: addDays(today, start), status,
      created_at: ts(Math.max(5, -start) * 1440),
    };
  });
  const byName = Object.fromEntries(employees.map((e) => [e.full_name, e]));
  employees.forEach((e) => {
    const m = byName[MANAGER_OF[e.department]];
    if (m && m.id !== e.id) e.manager_id = m.id;
    if (e.role === "manager" || e.role === "admin") e.manager_id = byName["Jordan Reyes"].id;
    if (e.full_name === "Jordan Reyes") e.manager_id = null;
  });

  const board = (name, description, color, cols) => {
    const b = { id: uid(), org_id: orgId, name, description, color, created_at: ts(800 * 1440) };
    const columns = cols.map((c, i) => ({ id: uid(), board_id: b.id, org_id: orgId, name: c, position: (i + 1) * 1000, is_done: c === "Done" }));
    return { b, columns };
  };

  const ops = board("People Ops", "Onboarding, offboarding and HR operations", "#9bd8a9", ["To do", "In progress", "Done"]);
  const launch = board("Q4 Launch", "Everything shipping for the November release", "#9cc7f2", ["Backlog", "This week", "In review", "Done"]);
  const support = board("Support Desk", "Escalations and customer follow-ups", "#f3d37a", ["New", "Investigating", "Done"]);

  const tasks = [];
  const t = (bd, colName, title, who, dueOffset, priority = "medium", labels = [], extra = {}) => {
    const col = bd.columns.find((c) => c.name === colName);
    const pos = (tasks.filter((x) => x.column_id === col.id).length + 1) * 1000;
    tasks.push({
      id: uid(), org_id: orgId, board_id: bd.b.id, column_id: col.id, title, description: extra.description || "",
      assignee_id: who ? byName[who].id : null, due_date: dueOffset == null ? null : addDays(today, dueOffset),
      priority, labels, checklist: extra.checklist || [], position: pos, source: extra.source || "manual",
      automation_id: null, subject_employee_id: null, completed_at: col.is_done ? ts(60 * (tasks.length + 3)) : null,
      created_by: userId, created_at: ts(1440 * 3 + tasks.length * 97), updated_at: ts(60 * tasks.length),
    });
  };

  t(launch, "Backlog", "Usage-based billing: pricing page copy", "Samuel Price", 12, "medium", ["marketing"]);
  t(launch, "Backlog", "Audit onboarding emails for tone", "Felix Wagner", 16, "low", ["design"]);
  t(launch, "Backlog", "Load test the new sync service", "Lena Fischer", 18, "high", ["infra"]);
  t(launch, "This week", "Ship Slack digest v2", "Diego Alvarez", 2, "high", ["slack", "backend"], {
    description: "Morning digest grouped by assignee, with links back to each board.",
    checklist: [
      { id: uid(), text: "Group tasks by assignee", done: true },
      { id: uid(), text: "Add overdue section", done: true },
      { id: uid(), text: "Deep links into boards", done: false },
      { id: uid(), text: "QA in #eng-sandbox", done: false },
    ],
  });
  t(launch, "This week", "Design review: kanban density", "Noor Haddad", 1, "medium", ["design"]);
  t(launch, "This week", "Customer interviews — 5 accounts", "Grace Owusu", 3, "medium", ["research"]);
  t(launch, "This week", "Fix timezone bug in due dates", "Hana Sato", -1, "urgent", ["bug"]);
  t(launch, "In review", "Role-based access audit", "Priya Natarajan", 0, "high", ["security"]);
  t(launch, "In review", "New board templates", "Felix Wagner", 4, "low", ["design"]);
  t(launch, "Done", "Migrate auth to passkeys", "Lena Fischer", -6, "high", ["security"]);
  t(launch, "Done", "Q4 roadmap sign-off", "Samuel Price", -9, "medium", []);

  t(ops, "To do", "Open enrollment reminder to all staff", "Elena Petrova", 5, "medium", ["benefits"]);
  t(ops, "To do", "Quarterly compensation review", "Jordan Reyes", 21, "high", ["comp"]);
  t(ops, "In progress", "Update remote work policy", "Elena Petrova", 7, "medium", ["policy"]);
  t(ops, "In progress", "Source 3 senior engineers", "Luca Romano", 14, "high", ["hiring"]);
  t(ops, "Done", "Holiday calendar published", "Zoe Adams", -4, "low", []);

  t(support, "New", "Enterprise SSO question — Acme Corp", "Yara Nasser", 0, "high", ["enterprise"]);
  t(support, "New", "Export CSV missing manager column", "Kenji Watanabe", 2, "medium", ["bug"]);
  t(support, "Investigating", "Slack notifications delayed for EU workspaces", "Owen Brooks", -2, "urgent", ["slack"]);
  t(support, "Done", "Refund request #4821", "Yara Nasser", -3, "low", []);

  const automations = [
    {
      id: uid(), org_id: orgId, name: "New hire onboarding", trigger: "employee_added", department: null, board_id: ops.b.id, enabled: true,
      run_count: 0, last_run_at: null, created_at: ts(700 * 1440),
      steps: [
        { title: "Send welcome email to {name}", offset_days: -3, assign_to: "manager", priority: "medium" },
        { title: "Provision laptop and accounts for {name}", offset_days: -2, assign_to: "creator", priority: "high" },
        { title: "Complete I-9, tax and payroll forms", offset_days: 0, assign_to: "employee", priority: "high" },
        { title: "First 1:1 with {name}", offset_days: 1, assign_to: "manager", priority: "medium" },
        { title: "Finish security & compliance training", offset_days: 5, assign_to: "employee", priority: "medium" },
        { title: "30-day check-in with {name}", offset_days: 30, assign_to: "manager", priority: "low" },
      ],
    },
    {
      id: uid(), org_id: orgId, name: "Engineering environment setup", trigger: "employee_added", department: "Engineering", board_id: launch.b.id, enabled: true,
      run_count: 0, last_run_at: null, created_at: ts(500 * 1440),
      steps: [
        { title: "Pair {name} with an onboarding buddy", offset_days: 0, assign_to: "manager", priority: "medium" },
        { title: "Local dev environment running", offset_days: 1, assign_to: "employee", priority: "high" },
        { title: "Ship a first pull request", offset_days: 7, assign_to: "employee", priority: "medium" },
      ],
    },
    {
      id: uid(), org_id: orgId, name: "Offboarding checklist", trigger: "employee_offboarded", department: null, board_id: ops.b.id, enabled: true,
      run_count: 0, last_run_at: null, created_at: ts(700 * 1440),
      steps: [
        { title: "Revoke system access for {name}", offset_days: 0, assign_to: "creator", priority: "urgent" },
        { title: "Collect equipment from {name}", offset_days: 1, assign_to: "manager", priority: "high" },
        { title: "Exit interview with {name}", offset_days: 2, assign_to: "creator", priority: "medium" },
        { title: "Process final payroll", offset_days: 5, assign_to: "creator", priority: "high" },
      ],
    },
  ];

  const activity = [
    ["Priya Natarajan", "completed", "Migrate auth to passkeys", 50],
    ["Owen Brooks", "created", "Slack notifications delayed for EU workspaces", 140],
    ["Jordan Reyes", "changed role of", "Elena Petrova", 380, { role: "admin" }],
    ["Samuel Price", "completed", "Q4 roadmap sign-off", 900],
    ["Zoe Adams", "uploaded", "Holiday calendar 2026.pdf", 1300],
  ].map(([actor_name, verb, target, mins, meta = {}]) => ({
    id: uid(), org_id: orgId, actor_name, verb, target, meta, created_at: ts(mins),
  }));

  return {
    user: { id: userId, email: DEMO_EMAIL, full_name: "Jordan Reyes" },
    org,
    employees,
    boards: [ops.b, launch.b, support.b],
    columns: [...ops.columns, ...launch.columns, ...support.columns],
    tasks,
    automations,
    integration: { org_id: orgId, slack_webhook_url: "", slack_channel: "#people-ops", events: { task_created: true, task_completed: true, employee_added: true, employee_offboarded: true } },
    activity,
    // Employees whose onboarding automations should be replayed so the demo has live pipelines.
    replayOnboarding: ["Tomás Silva", "Aisha Bello", "Isabela Costa", "Ben Carter", "Grace Owusu"].map((n) => byName[n].id),
  };
}
