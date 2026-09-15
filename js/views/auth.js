// Sign in, create organization (wizard), join via invite, password reset.
import { html, mount, on, $, $$, formData, slugify, debounce, avatar } from "../lib/dom.js";
import { icon, logo } from "../lib/icons.js";
import { app, afterSignIn, loadMemberships, selectOrg } from "../app.js";
import { go } from "../router.js";
import { toast, toastError, setBusy } from "../ui/ui.js";
import { appearanceFields, bindAppearance } from "../ui/appearance.js";
import { segmented, progressBar } from "../ui/bits.js";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../data/seed.js";

const INDUSTRIES = ["Software", "Agency & services", "Retail & e-commerce", "Healthcare", "Education", "Finance", "Manufacturing", "Nonprofit", "Hospitality", "Other"];
const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

function shell(root, { title, sub, body, art, wide = false, step }) {
  mount(root, html`<div class="auth">
    <div class="auth-panel ${wide ? "wide" : ""}">
      <header class="auth-top">
        <a class="brand" href="#/">${logo(24)}<span>myHR</span></a>
        ${step ? html`<span class="auth-step">${step}</span>` : ""}
      </header>
      <div class="auth-body">
        <h1 class="serif auth-title">${title}</h1>
        ${sub ? html`<p class="auth-sub">${sub}</p>` : ""}
        ${body}
      </div>
      <footer class="auth-foot muted-text">${app.backend?.mode === "demo" ? html`<span class="demo-dot"></span> Demo mode — accounts are stored only in this browser.` : html`${icon("lock")} Secured by Supabase Auth`}</footer>
    </div>
    <aside class="auth-art" data-art>${art || defaultArt()}</aside>
  </div>`);
  return $(".auth", root);
}

function defaultArt() {
  return html`<div class="art-canvas"></div>
    <div class="art-stack">
      <div class="art-card">
        <div class="float-head">${avatar("Aisha Bello", "sm")}<div><b>Aisha Bello</b><small>Engineering Intern · starts in 9 days</small></div></div>
        <div class="float-row"><span>Onboarding</span><span>2 / 9</span></div>
        ${progressBar(22)}
      </div>
      <div class="art-card art-quote">
        <p class="serif">"The first day used to be a scramble. Now the checklist is waiting before the laptop arrives."</p>
        <span class="muted-text">What your people team will say</span>
      </div>
    </div>`;
}

const pwField = (name = "password", label = "Password", autocomplete = "current-password") => html`
  <label class="field"><span>${label}</span>
    <span class="input-wrap">
      <input class="input" type="password" name="${name}" required minlength="8" autocomplete="${autocomplete}" placeholder="${autocomplete === "new-password" ? "At least 8 characters" : "••••••••"}" />
      <button type="button" class="input-btn" data-toggle-pw aria-label="Show password">${icon("eye")}</button>
    </span>
    ${autocomplete === "new-password" ? html`<span class="pw-meter" data-meter><i></i><i></i><i></i><i></i></span>` : ""}
  </label>`;

function bindPasswordUX(el) {
  on(el, "click", "[data-toggle-pw]", (e, b) => {
    const input = b.previousElementSibling;
    input.type = input.type === "password" ? "text" : "password";
  });
  on(el, "input", "input[autocomplete=new-password]", (e, input) => {
    const v = input.value;
    const score = [v.length >= 8, /[A-Z]/.test(v) && /[a-z]/.test(v), /\d/.test(v), /[^\w]/.test(v) || v.length >= 14].filter(Boolean).length;
    const meter = input.closest(".field").querySelector("[data-meter]");
    if (meter) meter.dataset.score = v ? score : 0;
  });
}

async function enterApp(message) {
  await afterSignIn();
  if (!app.memberships.length) return go("#/new-org");
  go("#/app/home");
  if (message) toast(message, { type: "success" });
}

// ---------------------------------------------------------------------------
export function renderLogin(root, query) {
  const demo = app.backend.mode === "demo";
  const el = shell(root, {
    title: "Welcome back",
    sub: "Sign in to your organization.",
    body: html`<form class="form" data-login>
      <label class="field"><span>Work email</span><input class="input" type="email" name="email" required autocomplete="email" placeholder="you@company.com" value="${query.email || ""}" autofocus /></label>
      ${pwField()}
      <div class="form-row-between"><span></span><a href="#/forgot" class="link">Forgot password?</a></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
    </form>
    ${demo ? html`<div class="or"><span>or</span></div>
      <button class="btn btn-secondary btn-lg btn-block" data-demo>${icon("play")}Explore the demo workspace</button>
      <p class="fine center">Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}</p>` : ""}
    <p class="auth-switch">New to myHR? <a href="#/signup" class="link">Create an organization</a></p>`,
  });
  bindPasswordUX(el);
  on(el, "submit", "[data-login]", async (e, form) => {
    e.preventDefault();
    const v = formData(form);
    const btn = $("button[type=submit]", form);
    setBusy(btn, true, "Signing in…");
    try {
      await app.backend.signIn(v);
      await afterSignIn();
      if (!app.memberships.length) return go("#/new-org");
      go(query.next && query.next.startsWith("#/app") ? query.next : "#/app/home");
    } catch (err) {
      toastError(err);
      setBusy(btn, false);
    }
  });
  on(el, "click", "[data-demo]", async (e, btn) => {
    setBusy(btn, true, "Opening demo…");
    try {
      await app.backend.signInDemo();
      await enterApp();
    } catch (err) {
      toastError(err);
      setBusy(btn, false);
    }
  });
}

// ---------------------------------------------------------------------------
// Create organization wizard: account → organization → personalize.

function orgFields(v = {}) {
  return html`
    <label class="field"><span>Organization name</span><input class="input" name="org_name" required maxlength="80" value="${v.org_name || ""}" placeholder="Acme Inc." autofocus /></label>
    <label class="field"><span>Workspace URL</span>
      <span class="input-wrap prefix"><span class="input-prefix">myhr/</span><input class="input" name="slug" required maxlength="40" value="${v.slug || ""}" placeholder="acme" autocomplete="off" /></span>
      <small class="field-hint" data-slug-hint>Lowercase letters, numbers and dashes.</small>
    </label>
    <div class="grid-2">
      <label class="field"><span>Industry</span><select class="input" name="industry">${INDUSTRIES.map((i) => html`<option ${v.industry === i ? "selected" : ""}>${i}</option>`)}</select></label>
      <label class="field"><span>Your title</span><input class="input" name="title" value="${v.title || ""}" placeholder="Head of People" /></label>
    </div>
    <div class="field"><span>Team size</span>${segmented("size", SIZES.map((s) => ({ value: s, label: s })), v.size || "11-50")}</div>`;
}

function bindOrgFields(el, state) {
  const form = $("form", el);
  let touchedSlug = !!state.slug;
  const hint = $("[data-slug-hint]", el);
  const checkSlug = debounce(async (slug) => {
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
      hint.className = "field-hint error";
      hint.textContent = "Use 3–40 lowercase letters, numbers or dashes.";
      return (state.slugOk = false);
    }
    try {
      const ok = await app.backend.slugAvailable(slug);
      state.slugOk = ok;
      hint.className = `field-hint ${ok ? "ok" : "error"}`;
      hint.textContent = ok ? `myhr/${slug} is available` : `myhr/${slug} is taken`;
    } catch {
      state.slugOk = true;
    }
  }, 300);
  form.org_name.addEventListener("input", () => {
    if (!touchedSlug) {
      form.slug.value = slugify(form.org_name.value);
      checkSlug(form.slug.value);
    }
  });
  form.slug.addEventListener("input", () => {
    touchedSlug = true;
    form.slug.value = slugify(form.slug.value.replace(/\s/g, "-"));
    checkSlug(form.slug.value);
  });
  on(el, "click", "[data-seg=size] .seg-btn", (e, b) => {
    $$("[data-seg=size] .seg-btn", el).forEach((x) => x.classList.toggle("active", x === b));
    state.size = b.dataset.value;
  });
  if (form.slug.value) checkSlug(form.slug.value);
}

function readOrg(form, state) {
  const v = formData(form);
  return { name: v.org_name, slug: v.slug, industry: v.industry, size: state.size || "11-50", title: v.title };
}

function previewArt() {
  return html`<div class="art-canvas live-canvas"></div>
    <div class="art-preview">
      <div class="ap-window">
        <div class="ap-side"><span class="org-mark" style="--h:150">A</span>${[1, 2, 3, 4, 5].map(() => html`<i></i>`)}</div>
        <div class="ap-main">
          <div class="ap-top"><b class="serif">Good morning</b><span class="ap-btn">New</span></div>
          <div class="ap-stats">${[1, 2, 3].map(() => html`<div><i></i><b></b></div>`)}</div>
          <div class="ap-cols">${[3, 2, 1].map((n) => html`<div>${Array.from({ length: n }, () => html`<span></span>`)}</div>`)}</div>
        </div>
      </div>
      <p class="art-caption">Live preview of your workspace</p>
    </div>`;
}

export function renderSignup(root, query) {
  const state = { step: 1, size: "11-50" };
  const values = {};

  function draw() {
    const steps = ["Your account", "Organization", "Personalize"];
    const stepper = html`<ol class="stepper">${steps.map((s, i) => html`<li class="${i + 1 === state.step ? "current" : i + 1 < state.step ? "done" : ""}"><span>${i + 1 < state.step ? icon("check") : i + 1}</span>${s}</li>`)}</ol>`;

    let body;
    if (state.step === 1) {
      body = html`${stepper}<form class="form" data-step>
        <label class="field"><span>Full name</span><input class="input" name="full_name" required autocomplete="name" value="${values.full_name || ""}" placeholder="Jordan Reyes" autofocus /></label>
        <label class="field"><span>Work email</span><input class="input" type="email" name="email" required autocomplete="email" value="${values.email || query.email || ""}" placeholder="you@company.com" /></label>
        ${pwField("password", "Password", "new-password")}
        <button class="btn btn-primary btn-lg btn-block" type="submit">Continue ${icon("arrowRight")}</button>
      </form>
      <p class="auth-switch">Already have an account? <a class="link" href="#/login">Sign in</a></p>
      <p class="auth-switch fine">Joining an existing team? Use the invite link your admin sent you.</p>`;
    } else if (state.step === 2) {
      body = html`${stepper}<form class="form" data-step>${orgFields(values)}
        <div class="form-actions"><button type="button" class="btn btn-ghost btn-lg" data-back>${icon("chevronLeft")}Back</button><button class="btn btn-primary btn-lg" type="submit">Continue ${icon("arrowRight")}</button></div>
      </form>`;
    } else {
      body = html`${stepper}<form class="form" data-step>
        <div data-ap></div>
        <div class="form-actions"><button type="button" class="btn btn-ghost btn-lg" data-back>${icon("chevronLeft")}Back</button><button class="btn btn-primary btn-lg" type="submit">Create organization</button></div>
      </form>`;
    }

    const el = shell(root, {
      title: ["Create your organization", "Tell us about your team", "Make it feel like home"][state.step - 1],
      sub: ["You'll be the owner. Invite your team next.", "This is the workspace your team will join.", "Choose a background and accent. You can change this anytime."][state.step - 1],
      step: `Step ${state.step} of 3`,
      wide: state.step === 3,
      body,
      art: state.step === 3 ? previewArt() : null,
    });
    bindPasswordUX(el);
    if (state.step === 2) bindOrgFields(el, state);
    if (state.step === 3) bindAppearance($("[data-ap]", el), { compact: true });
    on(el, "click", "[data-back]", () => { state.step--; draw(); });

    on(el, "submit", "[data-step]", async (e, form) => {
      e.preventDefault();
      if (state.step === 1) {
        Object.assign(values, formData(form));
        if (!values.full_name) return form.full_name.focus();
        if (!form.email.checkValidity()) { form.email.focus(); return toast("Enter a valid email.", { type: "error" }); }
        if ((values.password || "").length < 8) { form.password.focus(); return toast("Password must be at least 8 characters.", { type: "error" }); }
        state.step = 2;
        return draw();
      }
      if (state.step === 2) {
        Object.assign(values, formData(form), { size: state.size });
        if (!values.org_name) return form.org_name.focus();
        if (state.slugOk === false || !values.slug) { form.slug.focus(); return toast("Pick an available workspace URL.", { type: "error" }); }
        state.step = 3;
        return draw();
      }
      const btn = $("button[type=submit]", form);
      setBusy(btn, true, "Creating…");
      try {
        const org = { name: values.org_name, slug: values.slug, industry: values.industry, size: values.size, title: values.title };
        const res = await app.backend.signUp({ email: values.email, password: values.password, full_name: values.full_name, org });
        if (res.needsConfirmation) return go(`#/check-email?email=${encodeURIComponent(values.email)}`);
        await enterApp(`${values.org_name} is ready. Add your first employee next.`);
      } catch (err) {
        toastError(err);
        setBusy(btn, false);
      }
    });
  }
  draw();
}

// ---------------------------------------------------------------------------
export function renderNewOrg(root) {
  const state = { size: "11-50" };
  const el = shell(root, {
    title: app.memberships.length ? "Create another organization" : "Set up your organization",
    sub: app.memberships.length ? "You can switch between organizations from the sidebar." : "You're signed in, but not part of an organization yet. Create one, or ask your admin for an invite link.",
    body: html`<form class="form" data-org>${orgFields({})}
      <button class="btn btn-primary btn-lg btn-block" type="submit">Create organization</button>
    </form>
    <p class="auth-switch">${app.memberships.length ? html`<a class="link" href="#/app/home">Back to ${app.org?.name || "workspace"}</a>` : html`Wrong account? <a class="link" href="#/" data-signout>Sign out</a>`}</p>`,
  });
  bindOrgFields(el, state);
  on(el, "click", "[data-signout]", async (e) => {
    e.preventDefault();
    await app.backend.signOut();
    const { resetApp } = await import("../app.js");
    resetApp();
    go("#/");
  });
  on(el, "submit", "[data-org]", async (e, form) => {
    e.preventDefault();
    const org = readOrg(form, state);
    if (!org.name) return form.org_name.focus();
    if (state.slugOk === false || !org.slug) return toast("Pick an available workspace URL.", { type: "error" });
    const btn = $("button[type=submit]", form);
    setBusy(btn, true, "Creating…");
    try {
      const created = await app.backend.createOrg({ ...org, full_name: app.user.full_name });
      await loadMemberships();
      await selectOrg(created.id);
      go("#/app/home");
      toast(`${created.name} is ready`, { type: "success" });
    } catch (err) {
      toastError(err);
      setBusy(btn, false);
    }
  });
}

// ---------------------------------------------------------------------------
export async function renderJoin(root, slug, query) {
  const org = slug ? await app.backend.orgPublic(slug).catch(() => null) : null;
  const el = shell(root, {
    title: org ? html`Join <em>${org.name}</em>` : "Join your team",
    sub: org ? "Create your account with the email your admin invited. You'll be connected to your profile automatically." : "This invite link looks incomplete. Ask your admin to send it again.",
    body: html`<form class="form" data-join>
      <label class="field"><span>Full name</span><input class="input" name="full_name" required autocomplete="name" autofocus /></label>
      <label class="field"><span>Invited email</span><input class="input" type="email" name="email" required autocomplete="email" value="${query.email || ""}" ${query.email ? "readonly" : ""} /></label>
      ${pwField("password", "Create a password", "new-password")}
      <button class="btn btn-primary btn-lg btn-block" type="submit">Join ${org?.name || "workspace"}</button>
    </form>
    <p class="auth-switch">Already have a myHR account? <a class="link" href="#/login?email=${encodeURIComponent(query.email || "")}">Sign in</a> — the invite links automatically.</p>`,
  });
  bindPasswordUX(el);
  on(el, "submit", "[data-join]", async (e, form) => {
    e.preventDefault();
    const v = formData(form);
    if (!v.full_name) return form.full_name.focus();
    if (v.password.length < 8) return toast("Password must be at least 8 characters.", { type: "error" });
    const btn = $("button[type=submit]", form);
    setBusy(btn, true, "Joining…");
    try {
      const res = await app.backend.signUp({ email: v.email, password: v.password, full_name: v.full_name });
      if (res.needsConfirmation) return go(`#/check-email?email=${encodeURIComponent(v.email)}&join=1`);
      await enterApp(org ? `Welcome to ${org.name}` : "Welcome to myHR");
    } catch (err) {
      toastError(err);
      setBusy(btn, false);
    }
  });
}

// ---------------------------------------------------------------------------
export function renderForgot(root) {
  const el = shell(root, {
    title: "Reset your password",
    sub: "We'll email you a secure link to choose a new one.",
    body: html`<form class="form" data-forgot>
      <label class="field"><span>Work email</span><input class="input" type="email" name="email" required autofocus /></label>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Send reset link</button>
    </form>
    <p class="auth-switch"><a class="link" href="#/login">${icon("chevronLeft")} Back to sign in</a></p>`,
  });
  on(el, "submit", "[data-forgot]", async (e, form) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    setBusy(btn, true, "Sending…");
    try {
      const res = await app.backend.resetPassword(formData(form).email);
      mount($(".auth-body", el), html`<div class="notice-big">${icon("mail")}<h1 class="serif auth-title">Check your inbox</h1>
        <p class="auth-sub">${res?.demo ? "Password emails need Supabase. In Demo mode, create a new account instead." : "If an account exists for that email, a reset link is on its way."}</p>
        <a class="btn btn-secondary btn-lg btn-block" href="#/login">Back to sign in</a></div>`);
    } catch (err) {
      toastError(err);
      setBusy(btn, false);
    }
  });
}

export function renderReset(root) {
  const el = shell(root, {
    title: "Choose a new password",
    body: html`<form class="form" data-reset>${pwField("password", "New password", "new-password")}
      <button class="btn btn-primary btn-lg btn-block" type="submit">Update password</button></form>`,
  });
  bindPasswordUX(el);
  on(el, "submit", "[data-reset]", async (e, form) => {
    e.preventDefault();
    const { password } = formData(form);
    if (password.length < 8) return toast("Password must be at least 8 characters.", { type: "error" });
    const btn = $("button[type=submit]", form);
    setBusy(btn, true, "Updating…");
    try {
      await app.backend.updatePassword(password);
      await enterApp("Password updated");
    } catch (err) {
      toastError(err);
      setBusy(btn, false);
    }
  });
}

export function renderCheckEmail(root, query) {
  shell(root, {
    title: "Confirm your email",
    body: html`<div class="notice-big">
      <div class="notice-icon">${icon("mail")}</div>
      <p class="auth-sub">We sent a confirmation link to <strong>${query.email || "your inbox"}</strong>. Open it on this device and ${query.join ? "you'll land in your team's workspace." : "your organization will be created automatically."}</p>
      <a class="btn btn-secondary btn-lg btn-block" href="#/login?email=${encodeURIComponent(query.email || "")}">I've confirmed — sign in</a>
      <p class="fine center">Can't find it? Check spam, or wait a minute and try again.</p>
    </div>`,
  });
}
