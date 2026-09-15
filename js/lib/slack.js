// Slack message text shared by Demo mode and the UI preview.
// The Edge Function (supabase/functions/slack-notify) builds the same messages server-side.

export function slackMessage(event, d = {}) {
  switch (event) {
    case "task_created":
      return `:memo: *${d.actor || "Someone"}* created *${d.title}*${d.assignee ? ` for ${d.assignee}` : ""}${d.due ? ` · due ${d.due}` : ""} on _${d.board || "a board"}_`;
    case "task_completed":
      return `:white_check_mark: *${d.actor || "Someone"}* completed *${d.title}* on _${d.board || "a board"}_`;
    case "employee_added":
      return `:wave: *${d.name}* is joining${d.department ? ` ${d.department}` : ""}${d.title ? ` as ${d.title}` : ""}${d.start ? ` on ${d.start}` : ""}. ${d.tasks ? `${d.tasks} onboarding tasks were created.` : ""}`;
    case "employee_offboarded":
      return `:outbox_tray: *${d.name}* has been offboarded. ${d.tasks ? `${d.tasks} offboarding tasks were created.` : ""}`;
    case "digest":
      return `:sunrise: *Daily digest for ${d.org}*\n${d.open} open tasks · ${d.overdue} overdue · ${d.dueToday} due today${d.lines?.length ? "\n" + d.lines.join("\n") : ""}`;
    case "test":
    default:
      return `:zap: myHR is connected to *${d.org || "your workspace"}*. You'll see task and people updates here.`;
  }
}

// Renders Slack mrkdwn-lite into safe display HTML for the in-app preview.
export function slackPreviewHTML(text) {
  const EMOJI = { memo: "📝", white_check_mark: "✅", wave: "👋", outbox_tray: "📤", sunrise: "🌅", zap: "⚡" };
  return String(text)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
    .replace(/:([a-z_]+):/g, (m, k) => EMOJI[k] || m)
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}
