// ---- Login gate ----
const ADMIN_EMAIL = "svk7@illinois.edu";

const loginForm = document.getElementById("loginForm");
const loginMsg = document.getElementById("loginMsg");
const loginScreen = document.getElementById("loginScreen");
const appRoot = document.getElementById("appRoot");

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();

  if (email === ADMIN_EMAIL) {
    loginMsg.textContent = "✅ Admin approval needed — request sent. Redirecting to dashboard...";
    loginMsg.className = "login-msg show approved";
    setTimeout(() => {
      loginScreen.style.display = "none";
      appRoot.style.display = "grid";
    }, 1200);
  } else {
    loginMsg.textContent = "🚫 Access denied. This account is not authorized for myHR.";
    loginMsg.className = "login-msg show rejected";
  }
});

// ---- Demo data ----
const employees = [
  { name: "Ava Martinez", role: "Manager", dept: "Engineering", email: "ava@myhr.demo", status: "Active" },
  { name: "Liam Chen", role: "Employee", dept: "Engineering", email: "liam@myhr.demo", status: "Active" },
  { name: "Sofia Rossi", role: "Employee", dept: "Design", email: "sofia@myhr.demo", status: "On Leave" },
  { name: "Noah Patel", role: "Employee", dept: "Sales", email: "noah@myhr.demo", status: "Active" },
  { name: "Mia Johnson", role: "Admin", dept: "HR", email: "mia@myhr.demo", status: "Active" },
  { name: "Ethan Kim", role: "Employee", dept: "Support", email: "ethan@myhr.demo", status: "Active" },
];

const tasks = [
  { task: "Complete onboarding paperwork", owner: "Noah Patel", done: true },
  { task: "Finish sprint board review", owner: "Liam Chen", done: false },
  { task: "Submit weekly status report", owner: "Sofia Rossi", done: false },
  { task: "Approve leave requests", owner: "Ava Martinez", done: true },
  { task: "Update client ticket queue", owner: "Ethan Kim", done: false },
];

let currentRole = "admin";

// ---- Navigation ----
const navItems = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const viewTitle = document.getElementById("viewTitle");

navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    navItems.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.view;
    views.forEach((v) => v.classList.toggle("active", v.id === `view-${target}`));
    viewTitle.textContent = btn.textContent;
    if (target === "employees") renderEmployees();
  });
});

// ---- Role switch (RBAC) ----
const roleSelect = document.getElementById("roleSelect");
const roleBadge = document.getElementById("roleBadge");

roleSelect.addEventListener("change", (e) => {
  currentRole = e.target.value;
  roleBadge.textContent = currentRole.toUpperCase();
  roleBadge.className = `badge ${currentRole === "admin" ? "badge-admin" : "badge-employee"}`;
  renderEmployees();
});

function renderEmployees() {
  const wrap = document.getElementById("employeeTableWrap");
  const locked = document.getElementById("lockedNotice");

  if (currentRole !== "admin") {
    wrap.style.display = "none";
    locked.style.display = "block";
    return;
  }
  wrap.style.display = "block";
  locked.style.display = "none";

  const tbody = document.getElementById("employeeTableBody");
  tbody.innerHTML = employees
    .map(
      (e) => `
      <tr>
        <td>${e.name}</td>
        <td>${e.role}</td>
        <td>${e.dept}</td>
        <td>${e.email}</td>
        <td><span class="status-pill ${e.status === "Active" ? "status-active" : "status-onleave"}">${e.status}</span></td>
      </tr>`
    )
    .join("");
}

// ---- Checklist ----
function renderChecklist() {
  const wrap = document.getElementById("checklistWrap");
  wrap.innerHTML = tasks
    .map(
      (t, i) => `
      <div class="checklist-row">
        <input type="checkbox" data-index="${i}" ${t.done ? "checked" : ""} />
        <span class="checklist-task ${t.done ? "done" : ""}">${t.task}</span>
        <span class="checklist-owner">${t.owner}</span>
      </div>`
    )
    .join("");

  wrap.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const idx = e.target.dataset.index;
      tasks[idx].done = e.target.checked;
      renderChecklist();
      updateStats();
    });
  });
}

function updateStats() {
  const done = tasks.filter((t) => t.done).length;
  document.getElementById("statDone").textContent = done;
  document.getElementById("statPending").textContent = tasks.length - done;
}

// ---- Slack sync button (demo only) ----
const syncBtn = document.getElementById("syncBtn");
const slackStatusMini = document.getElementById("slackStatusMini");

syncBtn.addEventListener("click", () => {
  const dot = syncBtn.querySelector(".dot");
  dot.classList.add("syncing");
  syncBtn.disabled = true;
  syncBtn.querySelector("span:last-child") ? null : null;
  syncBtn.lastChild.textContent = " Syncing...";

  setTimeout(() => {
    dot.classList.remove("syncing");
    syncBtn.disabled = false;
    syncBtn.lastChild.textContent = " Sync with Slack";
    slackStatusMini.textContent = "Synced ✓";
  }, 1400);
});

// ---- Slack config save (demo only, no backend) ----
document.getElementById("saveSlackBtn").addEventListener("click", () => {
  const msg = document.getElementById("slackSavedMsg");
  msg.textContent = "Saved locally (demo only — not sent anywhere).";
  setTimeout(() => (msg.textContent = ""), 3000);
});

// ---- Project files dropzone ----
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");

dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => addFiles(e.target.files));

["dragover", "dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.toggle("dragover", evt === "dragover");
    if (evt === "drop") addFiles(e.dataTransfer.files);
  });
});

function addFiles(fileArr) {
  Array.from(fileArr).forEach((f) => {
    const li = document.createElement("li");
    const sizeKb = (f.size / 1024).toFixed(1);
    li.innerHTML = `<span>${f.name}</span><span class="file-size">${sizeKb} KB</span>`;
    fileList.appendChild(li);
  });
}

// ---- Init ----
renderChecklist();
updateStats();
renderEmployees();
