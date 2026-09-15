// Client-side mirror of the RLS policies in supabase/schema.sql.
// The UI uses this to hide actions; the database is what actually enforces them.

export const ROLES = ["owner", "admin", "manager", "employee"];

export const ROLE_META = {
  owner: { label: "Owner", blurb: "Full control, billing and deleting the organization." },
  admin: { label: "Admin", blurb: "Manages people, roles, automations and integrations." },
  manager: { label: "Manager", blurb: "Runs boards and tasks, sees automations." },
  employee: { label: "Employee", blurb: "Works on tasks, sees the directory." },
};

const ALL = ROLES;
const MGR = ["owner", "admin", "manager"];
const ADM = ["owner", "admin"];

export const PERMISSIONS = [
  { key: "people.view", label: "View the people directory", roles: ALL },
  { key: "people.manage", label: "Add, edit and offboard employees", roles: ADM },
  { key: "roles.manage", label: "Change member roles", roles: ADM },
  { key: "tasks.create", label: "Create tasks", roles: ALL },
  { key: "tasks.editAny", label: "Edit or move anyone's tasks", roles: MGR },
  { key: "boards.manage", label: "Create boards and columns", roles: MGR },
  { key: "automations.view", label: "View automations", roles: MGR },
  { key: "automations.manage", label: "Build and toggle automations", roles: ADM },
  { key: "files.upload", label: "Upload project files", roles: ALL },
  { key: "files.deleteAny", label: "Delete anyone's files", roles: ADM },
  { key: "integrations.manage", label: "Configure Slack", roles: ADM },
  { key: "org.manage", label: "Edit organization settings", roles: ADM },
  { key: "org.delete", label: "Delete the organization", roles: ["owner"] },
];

const MAP = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.roles]));

export const can = (role, key) => !!role && (MAP[key] || []).includes(role);

export const rank = (role) => ROLES.length - ROLES.indexOf(role);
