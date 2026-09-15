// Project files backed by Supabase Storage (or IndexedDB in Demo mode).
import { html, on, $, fmtBytes, timeAgo, plural } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { app, refresh } from "../app.js";
import { setHashSilently } from "../router.js";
import { toast, toastError, confirmDialog, emptyState } from "../ui/ui.js";

export const title = "Files";
let q = "";

const kind = (f) => {
  const n = (f.name.split(".").pop() || "").toLowerCase();
  if ((f.mime || "").startsWith("image/")) return ["Image", "tone-sky"];
  if (n === "pdf") return ["PDF", "tone-blush"];
  if (["csv", "xls", "xlsx", "numbers"].includes(n)) return ["Sheet", "tone-mint"];
  if (["doc", "docx", "txt", "md", "pages"].includes(n)) return ["Doc", "tone-butter"];
  return [n.toUpperCase().slice(0, 4) || "File", "tone-lilac"];
};

export function render() {
  const files = app.data.files.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));
  const total = app.data.files.reduce((n, f) => n + (f.size || 0), 0);
  return html`
    <header class="page-head">
      <div><h1 class="serif">Files</h1><p class="page-sub">${plural(app.data.files.length, "file")} · ${fmtBytes(total)} · shared with everyone in ${app.org.name}</p></div>
      <div class="page-actions">
        <label class="search-input">${icon("search")}<input data-q placeholder="Search files" value="${q}" /></label>
        ${app.can("files.upload") ? html`<button class="btn btn-primary" data-pick>${icon("upload")}Upload</button>` : ""}
      </div>
    </header>
    ${app.can("files.upload") ? html`<label class="dropzone card" data-drop>
      <span class="dz-icon">${icon("upload")}</span>
      <span><strong>Drop files to upload</strong><small>Offer letters, handbooks, policies — up to 50 MB each${app.demo ? " (stored in this browser in Demo mode)" : ""}</small></span>
      <input type="file" multiple hidden data-input />
    </label>` : ""}
    <section class="card table-card">
      ${files.length ? html`<div class="table-scroll"><table class="table files-table">
        <thead><tr><th>Name</th><th>Size</th><th>Uploaded by</th><th>Added</th><th></th></tr></thead>
        <tbody>${files.map((f) => {
          const [k, tone] = kind(f);
          const canDelete = app.can("files.deleteAny") || f.uploaded_by === app.user.id;
          return html`<tr>
            <td><span class="file-name"><span class="file-badge ${tone}">${k}</span>${f.name}</span></td>
            <td class="nowrap">${fmtBytes(f.size)}</td>
            <td>${f.uploaded_by_name || "—"}</td>
            <td class="nowrap">${timeAgo(f.created_at)}</td>
            <td class="row-actions nowrap">
              <button class="icon-btn xs" data-download="${f.id}" aria-label="Download">${icon("download")}</button>
              ${canDelete ? html`<button class="icon-btn xs" data-delete="${f.id}" aria-label="Delete">${icon("trash")}</button>` : ""}
            </td></tr>`;
        })}</tbody></table></div>`
      : emptyState({ icon: "folder", title: q ? "No files match" : "No files yet", text: q ? "" : "Upload documents your team needs to find later." })}
    </section>`;
}

async function upload(list) {
  const files = Array.from(list || []);
  if (!files.length) return;
  const big = files.find((f) => f.size > 50 * 1024 * 1024);
  if (big) return toast(`${big.name} is larger than 50 MB.`, { type: "error" });
  toast(`Uploading ${plural(files.length, "file")}…`);
  let ok = 0;
  for (const f of files) {
    try { await app.backend.uploadFile(app.org.id, f, app.me?.full_name); ok++; } catch (err) { toastError(err); }
  }
  await refresh(["files", "activity"]);
  if (ok) toast(`Uploaded ${plural(ok, "file")}`, { type: "success" });
}

export function bind(root, params, query) {
  const input = $("[data-input]", root);
  on(root, "click", "[data-pick]", () => input?.click());
  input?.addEventListener("change", () => upload(input.files));
  const dz = $("[data-drop]", root);
  if (dz) {
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("over"));
    dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); upload(e.dataTransfer.files); });
  }
  on(root, "input", "[data-q]", (e, i) => { q = i.value; app.rerender({ force: true }); const n = $("[data-q]"); n.focus(); n.setSelectionRange(q.length, q.length); });
  on(root, "click", "[data-download]", async (e, b) => {
    const f = app.data.files.find((x) => x.id === b.dataset.download);
    try {
      const url = await app.backend.fileUrl(f);
      const a = Object.assign(document.createElement("a"), { href: url, download: f.name, target: "_blank", rel: "noopener" });
      document.body.appendChild(a); a.click(); a.remove();
    } catch (err) { toastError(err); }
  });
  on(root, "click", "[data-delete]", async (e, b) => {
    const f = app.data.files.find((x) => x.id === b.dataset.delete);
    if (!(await confirmDialog({ title: "Delete file?", message: `"${f.name}" will be permanently deleted.`, confirmLabel: "Delete", danger: true }))) return;
    try { await app.backend.deleteFile(f); await refresh(["files"]); toast("File deleted"); } catch (err) { toastError(err); }
  });
  if (query.upload) { setHashSilently("#/app/files"); input?.click(); }
}
