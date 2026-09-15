// Marketing landing page.
import { html, mount, on, $, $$, avatar } from "../lib/dom.js";
import { icon, logo } from "../lib/icons.js";
import { BACKGROUNDS } from "../theme.js";
import { app } from "../app.js";
import { go } from "../router.js";
import { toastError, setBusy } from "../ui/ui.js";
import { priorityMark } from "../ui/bits.js";

const MOCK_BGS = ["none", "fog", "peach", "lagoon", "dusk", "aurora"];

function mockCard(title, who, label, prio, due, extra = "") {
  return html`<div class="m-card">
    ${label ? html`<span class="label-chip">${label}</span>` : ""}
    <p>${title}</p>
    ${extra}
    <div class="m-card-foot">${priorityMark(prio)}<span class="due ${due === "Today" ? "today" : ""}">${due}</span>${avatar(who, "xs")}</div>
  </div>`;
}

function productMock() {
  return html`<div class="mock" data-mock>
    <div class="mock-canvas" data-mock-canvas></div>
    <div class="mock-window">
      <aside class="mock-side">
        <div class="mock-org"><span class="org-mark" style="--h:150">NS</span><b>Northwind</b></div>
        ${["Home", "My tasks", "Boards", "People", "Automations", "Files"].map((n, i) => html`<span class="mock-nav ${i === 2 ? "on" : ""}">${icon(["home", "tasks", "board", "users", "zap", "folder"][i])}${n}</span>`)}
      </aside>
      <div class="mock-main">
        <div class="mock-head"><h4 class="serif">Q4 Launch</h4><span class="mock-avatars">${["Priya N", "Diego A", "Noor H", "Hana S"].map((n) => avatar(n, "xs"))}</span></div>
        <div class="mock-cols">
          <div class="m-col"><h5>This week <i>3</i></h5>
            ${mockCard("Ship Slack digest v2", "Diego Alvarez", "slack", "high", "Wed", html`<span class="progress"><span style="width:50%"></span></span>`)}
            ${mockCard("Fix timezone bug in due dates", "Hana Sato", "bug", "urgent", "Today")}
          </div>
          <div class="m-col"><h5>In review <i>2</i></h5>
            ${mockCard("Role-based access audit", "Priya Natarajan", "security", "high", "Today")}
            ${mockCard("New board templates", "Felix Wagner", "", "low", "Fri")}
          </div>
          <div class="m-col hide-xs"><h5>Done <i>2</i></h5>
            ${mockCard("Migrate auth to passkeys", "Lena Fischer", "", "high", "Sep 9")}
          </div>
        </div>
      </div>
    </div>
    <div class="float float-onboard">
      <div class="float-head">${avatar("Tomás Silva", "sm")}<div><b>Tomás Silva</b><small>Engineer · starts Monday</small></div></div>
      <div class="float-row"><span>Onboarding</span><span>4 / 9</span></div>
      <span class="progress"><span style="width:44%"></span></span>
      <ul>
        <li class="done">${icon("check")}Laptop & accounts</li>
        <li class="done">${icon("check")}Welcome email</li>
        <li>${icon("circle")}I-9 and payroll forms</li>
      </ul>
    </div>
    <div class="float float-slack">
      <div class="slack-row"><span class="slack-app">${logo(26)}</span><div><b>myHR</b><span class="slack-app-tag">APP</span><small>9:41 AM</small>
        <p>✅ <strong>Priya</strong> completed <strong>Role-based access audit</strong> on <em>Q4 Launch</em></p></div></div>
    </div>
  </div>`;
}

export function renderLanding(root) {
  const signedIn = app.user && app.memberships.length;
  const demo = app.backend?.mode === "demo";
  mount(root, html`<div class="landing">
    <header class="l-nav">
      <a class="brand" href="#/">${logo(26)}<span>myHR</span></a>
      <nav class="l-links hide-sm">
        <a href="#features" data-scroll>Product</a>
        <a href="#automations" data-scroll>Automations</a>
        <a href="#how" data-scroll>How it works</a>
        <a href="#security" data-scroll>Security</a>
      </nav>
      <div class="l-actions">
        ${signedIn
          ? html`<a class="btn btn-primary" href="#/app/home">Open workspace ${icon("arrowRight")}</a>`
          : html`<a class="btn btn-ghost hide-xs" href="#/login">Sign in</a><a class="btn btn-primary" href="#/signup">Create organization</a>`}
      </div>
    </header>

    <section class="hero">
      <a class="eyebrow" href="#automations" data-scroll><span class="eyebrow-dot"></span>Onboarding automations are here ${icon("arrowRight")}</a>
      <h1 class="serif display">People operations,<br /><em>beautifully</em> organized.</h1>
      <p class="lede">myHR brings your team directory, onboarding and everyday work into one calm workspace — with roles that are actually enforced and updates that land in Slack.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="${signedIn ? "#/app/home" : "#/signup"}">${signedIn ? "Open your workspace" : "Create your organization"}</a>
        ${demo ? html`<button class="btn btn-secondary btn-lg" data-demo>Explore the live demo ${icon("arrowUpRight")}</button>` : html`<a class="btn btn-secondary btn-lg" href="#/login">Sign in ${icon("arrowRight")}</a>`}
      </div>
      <p class="fine">Free to start · No credit card · Your data in your own Supabase project</p>
    </section>

    <section class="showcase">
      ${productMock()}
      <div class="bg-switch" role="group" aria-label="Preview workspace backgrounds">
        <span>Try a background</span>
        ${MOCK_BGS.map((id, i) => {
          const b = BACKGROUNDS.find((x) => x.id === id);
          return html`<button class="bg-chip ${i === 4 ? "active" : ""}" data-mock-bg="${id}" style="background:${id === "none" ? "#f4f4f1" : b.css}" title="${b.name}" aria-label="${b.name}"></button>`;
        })}
      </div>
    </section>

    <section class="section" id="features">
      <div class="section-head">
        <p class="kicker">The workspace</p>
        <h2 class="serif">Everything your people team runs on. Nothing it doesn't.</h2>
      </div>
      <div class="bento">
        <article class="tile tile-mint tile-wide">
          <div class="tile-copy"><h3 class="serif">A directory that knows who does what</h3><p>Profiles, managers, departments and start dates in one place. Import a CSV, export anytime, and invite people with a link.</p></div>
          <div class="tile-art dir-art">
            ${[["Priya Natarajan", "VP Engineering", "Admin"], ["Marcus Okafor", "Engineering Manager", "Manager"], ["Hana Sato", "Engineer", "Employee"], ["Tomás Silva", "Engineer", "Invited"]].map(([n, t, r]) => html`<div class="dir-row">${avatar(n, "sm")}<span><b>${n}</b><small>${t}</small></span><span class="pill ${r === "Invited" ? "status status-invited" : "role-" + r.toLowerCase()}">${r === "Invited" ? html`<i></i>` : ""}${r}</span></div>`)}
          </div>
        </article>
        <article class="tile tile-butter" id="automations">
          <div class="tile-copy"><h3 class="serif">Onboarding on autopilot</h3><p>Add a hire and their checklist builds itself — assigned to the right people, due on the right days.</p></div>
          <div class="tile-art flow-art">
            ${[["When", "Employee is added"], ["Day −3", "Welcome email · Manager"], ["Day −2", "Laptop & accounts · IT"], ["Day 0", "Payroll forms · New hire"], ["Day 30", "Check-in · Manager"]].map(([k, v], i) => html`<div class="flow-step ${i === 0 ? "trigger" : ""}"><span>${k}</span><b>${v}</b></div>`)}
          </div>
        </article>
        <article class="tile tile-sky">
          <div class="tile-copy"><h3 class="serif">Slack, in sync</h3><p>New hires, finished tasks and a morning digest, posted to the channel your team already lives in.</p></div>
          <div class="tile-art slack-art">
            <div class="slack-bubble"><b>#people-ops</b><p>👋 <strong>Tomás Silva</strong> is joining Engineering on Monday. 9 onboarding tasks were created.</p></div>
            <div class="slack-bubble"><p>🌅 <strong>Daily digest</strong> · 14 open · 2 overdue · 5 due today</p></div>
          </div>
        </article>
        <article class="tile tile-blush" id="security">
          <div class="tile-copy"><h3 class="serif">Roles that are enforced, not suggested</h3><p>Owner, Admin, Manager and Employee permissions live in Postgres row-level security — the UI can't be talked around.</p></div>
          <div class="tile-art perm-art">
            <div class="perm-row head"><span></span><span>Owner</span><span>Admin</span><span>Mgr</span><span>Emp</span></div>
            ${[["Add employees", 1, 1, 0, 0], ["Edit any task", 1, 1, 1, 0], ["Automations", 1, 1, 0, 0], ["View directory", 1, 1, 1, 1]].map(([l, ...v]) => html`<div class="perm-row"><span>${l}</span>${v.map((x) => html`<span class="${x ? "yes" : "no"}">${icon(x ? "check" : "x")}</span>`)}</div>`)}
          </div>
        </article>
        <article class="tile tile-lilac">
          <div class="tile-copy"><h3 class="serif">Make it feel like yours</h3><p>Pick a live background, an accent and light or dark mode. It follows you on every device.</p></div>
          <div class="tile-art swatch-art">
            ${["dusk", "lagoon", "aurora", "peach", "moss", "topo"].map((id) => html`<span style="background:${BACKGROUNDS.find((b) => b.id === id).css}"></span>`)}
          </div>
        </article>
      </div>
    </section>

    <section class="section how" id="how">
      <div class="section-head">
        <p class="kicker">Get started in minutes</p>
        <h2 class="serif">From sign-up to a running people team in three steps.</h2>
      </div>
      <ol class="how-steps">
        <li><span class="serif num">1</span><h3>Create your organization</h3><p>Claim your workspace URL. You're the owner, with a People Ops board and automations ready to go.</p></li>
        <li><span class="serif num">2</span><h3>Add your people</h3><p>One at a time or a whole CSV. Everyone gets an invite link that connects them to their profile.</p></li>
        <li><span class="serif num">3</span><h3>Let the work flow</h3><p>Onboarding tasks appear, boards fill up, and Slack keeps everyone posted without another meeting.</p></li>
      </ol>
    </section>

    <section class="cta-band">
      <h2 class="serif">Give your team a better first day.</h2>
      <div class="hero-cta">
        <a class="btn btn-accent btn-lg" href="${signedIn ? "#/app/home" : "#/signup"}">${signedIn ? "Open your workspace" : "Create your organization"}</a>
        ${demo && !signedIn ? html`<button class="btn btn-ghost-inverse btn-lg" data-demo>Try the demo first</button>` : ""}
      </div>
    </section>

    <footer class="l-foot">
      <a class="brand" href="#/">${logo(22)}<span>myHR</span></a>
      <span class="muted-text">Built with Supabase · Hosted on GitHub Pages</span>
      <span class="spacer"></span>
      <a href="#/login">Sign in</a><a href="#/signup">Create organization</a>
    </footer>
  </div>`);

  const page = $(".landing", root);
  const canvas = $("[data-mock-canvas]", page);
  const setMockBg = (id) => {
    const b = BACKGROUNDS.find((x) => x.id === id);
    canvas.style.background = id === "none" ? "#f4f4f1" : b.css;
    canvas.dataset.anim = b.animated ? b.id : "";
    $$("[data-mock-bg]", page).forEach((c) => c.classList.toggle("active", c.dataset.mockBg === id));
  };
  setMockBg("dusk");
  on(page, "click", "[data-mock-bg]", (e, b) => setMockBg(b.dataset.mockBg));
  on(page, "click", "[data-scroll]", (e, a) => {
    e.preventDefault();
    document.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  on(page, "click", "[data-demo]", async (e, btn) => {
    setBusy(btn, true, "Opening demo…");
    try {
      await app.backend.signInDemo();
      const { afterSignIn } = await import("../app.js");
      await afterSignIn();
      go("#/app/home");
    } catch (err) {
      toastError(err);
      setBusy(btn, false);
    }
  });
  window.scrollTo(0, 0);
}
