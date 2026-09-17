const API_BASE = window.location.protocol === "file:" ? "http://127.0.0.1:8080" : "";

const TITLE_MAX = 50;
const RECENT_LIMIT = 4;

const viewEl = document.getElementById("view");
const brandEl = document.getElementById("navbar-brand");
const menuEl = document.getElementById("menu");
const menuBtn = document.getElementById("menu-btn");
const uploadInput = document.getElementById("upload-input");
const toastRoot = document.getElementById("toast-root");
const modalRoot = document.getElementById("modal-root");

function svgMagnify() {
  return `<svg viewBox="0 0 24 24" width="1.25em" height="1.25em" aria-hidden="true"><path fill="currentColor" d="M9.5,4C13.09,4 16,6.91 16,10.5C16,12.12 15.41,13.6 14.43,14.73L20.08,20.38L19.37,21.09L13.72,15.44C12.59,16.41 11.11,17 9.5,17C5.91,17 3,14.09 3,10.5C3,6.91 5.91,4 9.5,4M9.5,5C6.46,5 4,7.46 4,10.5C4,13.54 6.46,16 9.5,16C12.54,16 15,13.54 15,10.5C15,7.46 12.54,5 9.5,5Z"></path></svg>`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function confirmDialog(title, message) {
  return new Promise((resolve) => {
    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(message)}</p>
          <div class="modal-actions">
            <button class="btn" type="button" data-answer="no">Cancel</button>
            <button class="btn btn-danger" type="button" data-answer="yes">Delete</button>
          </div>
        </div>
      </div>`;
    modalRoot.querySelectorAll("[data-answer]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const yes = btn.getAttribute("data-answer") === "yes";
        modalRoot.innerHTML = "";
        resolve(yes);
      });
    });
  });
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    throw new Error("无法连接后端。请先启动 Go 服务，再用前端代理打开页面。");
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || "请求失败";
    throw new Error(msg);
  }
  return data;
}

function parseRoute() {
  const raw = (location.hash || "#/").slice(1);
  const [pathPart, queryPart] = raw.split("?");
  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const query = new URLSearchParams(queryPart || "");
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "search") return { name: "search", q: query.get("q") || "" };
  if (parts[0] === "new") return { name: "edit", id: null };
  if (parts[0] === "notes" && parts[1] && parts[2] === "edit") {
    return { name: "edit", id: parts[1] };
  }
  if (parts[0] === "notes" && parts[1] && parts[2] === "grammar") {
    return { name: "grammar", id: parts[1] };
  }
  if (parts[0] === "notes" && parts[1]) return { name: "view", id: parts[1] };
  return { name: "home" };
}

function sortRecent(notes) {
  return [...notes].sort((a, b) => {
    return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
  });
}

function filterNotes(notes, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return notes;
  return notes.filter((note) => {
    const title = (note.title || "").toLowerCase();
    const content = (note.content || "").toLowerCase();
    return title.includes(needle) || content.includes(needle);
  });
}

function snippet(text, q) {
  const raw = text || "";
  const needle = q.trim();
  if (!needle) return escapeHtml(raw.slice(0, 90));
  const idx = raw.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return escapeHtml(raw.slice(0, 90));
  const start = Math.max(0, idx - 24);
  const end = Math.min(raw.length, idx + needle.length + 40);
  return escapeHtml(raw.slice(start, end));
}

function renderHome(notes) {
  const recent = sortRecent(notes).slice(0, RECENT_LIMIT);
  const recentHtml = recent.length
    ? recent
        .map(
          (note) =>
            `<a class="note-link" href="#/notes/${note.id}">${escapeHtml(note.title)}</a>`
        )
        .join("")
    : `<p class="empty">No notes yet</p>`;

  viewEl.innerHTML = `
    <section class="home">
      <div class="home-logo">
        <span class="logo-mark" aria-hidden="true">G</span>
        <span class="logo-text">GMarkDown</span>
      </div>
      <form class="search-wrap" id="search-form">
        <label class="search-box">
          <span class="search-icon">${svgMagnify()}</span>
          <input id="search-input" type="text" placeholder="Search..." autocomplete="off" aria-label="Search">
        </label>
      </form>
      ${recent.length ? `<p class="section-title">Recently Modified</p>` : ""}
      <div class="recent-list">${recentHtml}</div>
    </section>`;

  const input = document.getElementById("search-input");
  bindSearchForm(input);
  input.focus();
}

function bindSearchForm(input) {
  function go() {
    const q = input.value.trim();
    if (!q) {
      toast("Please enter a search term.", "error");
      return;
    }
    location.hash = `#/search?q=${encodeURIComponent(q)}`;
  }

  document.getElementById("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    go();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      go();
    }
  });
}

function renderSearch(notes, q) {
  const matches = filterNotes(notes, q);
  const items = matches.length
    ? matches
        .map((note) => {
          const hay = note.content || note.title || "";
          return `<a class="note-link" href="#/notes/${note.id}">
            <strong>${escapeHtml(note.title)}</strong>
            <div class="muted">${snippet(hay, q)}</div>
          </a>`;
        })
        .join("")
    : `<p class="empty">No notes found</p>`;

  viewEl.innerHTML = `
    <section class="page search-page">
      <form class="search-wrap" id="search-form">
        <label class="search-box">
          <span class="search-icon">${svgMagnify()}</span>
          <input id="search-input" type="text" placeholder="Search..." value="${escapeHtml(q)}" aria-label="Search">
        </label>
      </form>
      <p class="section-title">Search Results</p>
      <div class="result-list">${items}</div>
    </section>`;

  bindSearchForm(document.getElementById("search-input"));
}

function renderView(note, html) {
  viewEl.innerHTML = `
    <section class="page">
      <div class="page-head">
        <div>
          <h1>${escapeHtml(note.title)}</h1>
          <p class="muted">Updated ${escapeHtml(formatDate(note.updated_at))}</p>
        </div>
        <div class="page-actions">
          <a class="btn" href="#/notes/${note.id}/edit">Edit</a>
          <a class="btn" href="#/notes/${note.id}/grammar">Check Grammar</a>
          <button class="btn btn-danger" type="button" id="delete-btn">Delete</button>
        </div>
      </div>
      <article class="markdown-body">${html || "<p class='empty'>This note is empty.</p>"}</article>
    </section>`;

  document.getElementById("delete-btn").addEventListener("click", async () => {
    const ok = await confirmDialog("Delete note", `Delete “${note.title}”? This is a soft delete.`);
    if (!ok) return;
    try {
      await api(`/api/notes/${note.id}`, { method: "DELETE" });
      toast("Note deleted.", "success");
      location.hash = "#/";
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

function renderEditor(note) {
  const isNew = !note;
  const title = note ? note.title : "";
  const content = note ? note.content : "";
  viewEl.innerHTML = `
    <section class="page">
      <form class="form" id="note-form">
        <div class="page-head">
          <h1>${isNew ? "New Note" : "Edit Note"}</h1>
          <div class="page-actions">
            <a class="btn" href="${isNew ? "#/" : `#/notes/${note.id}`}">Cancel</a>
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </div>
        <label for="note-title">Title</label>
        <input id="note-title" name="title" maxlength="${TITLE_MAX}" required value="${escapeHtml(title)}">
        <label for="note-content">Markdown</label>
        <textarea id="note-content" name="content">${escapeHtml(content)}</textarea>
      </form>
    </section>`;

  const form = document.getElementById("note-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextTitle = document.getElementById("note-title").value.trim();
    const nextContent = document.getElementById("note-content").value;
    if (!nextTitle) {
      toast("Title is required.", "error");
      return;
    }
    try {
      if (isNew) {
        const created = await api("/api/notes", {
          method: "POST",
          body: JSON.stringify({ title: nextTitle, content: nextContent }),
        });
        toast("Note created.", "success");
        location.hash = `#/notes/${created.id}`;
      } else {
        await api(`/api/notes/${note.id}`, {
          method: "PUT",
          body: JSON.stringify({ title: nextTitle, content: nextContent }),
        });
        toast("Note updated.", "success");
        location.hash = `#/notes/${note.id}`;
      }
    } catch (err) {
      toast(err.message, "error");
    }
  });

  form.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      form.requestSubmit();
    }
  });
}

function renderGrammar(note, matches) {
  const items = (matches || []).map((match) => {
    const start = match.offset || 0;
    const length = match.length || 0;
    const before = note.content.slice(Math.max(0, start - 20), start);
    const hit = note.content.slice(start, start + length);
    const after = note.content.slice(start + length, start + length + 20);
    const replacements = (match.replacements || [])
      .slice(0, 5)
      .map((item) => escapeHtml(item.value))
      .join(", ");
    return `<article class="grammar-item">
      <p><mark>${escapeHtml(hit)}</mark></p>
      <p>${escapeHtml(match.message || "")}</p>
      <p class="muted">${escapeHtml(before)}<strong>${escapeHtml(hit)}</strong>${escapeHtml(after)}</p>
      ${replacements ? `<p class="muted">Suggestions: ${replacements}</p>` : ""}
    </article>`;
  });

  viewEl.innerHTML = `
    <section class="page">
      <div class="page-head">
        <h1>Grammar: ${escapeHtml(note.title)}</h1>
        <div class="page-actions">
          <a class="btn" href="#/notes/${note.id}">Back</a>
        </div>
      </div>
      ${
        items.length
          ? `<div class="grammar-list">${items.join("")}</div>`
          : `<p class="empty">No grammar issues found.</p>`
      }
    </section>`;
}

function setLoading(text = "Loading...") {
  viewEl.innerHTML = `<p class="loading">${escapeHtml(text)}</p>`;
}

async function route() {
  const current = parseRoute();
  brandEl.hidden = current.name === "home";
  menuEl.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");

  try {
    if (current.name === "home") {
      setLoading();
      const notes = await api("/api/notes");
      renderHome(Array.isArray(notes) ? notes : []);
      return;
    }

    if (current.name === "search") {
      setLoading();
      const notes = await api("/api/notes");
      renderSearch(Array.isArray(notes) ? notes : [], current.q);
      return;
    }

    if (current.name === "edit") {
      if (!current.id) {
        renderEditor(null);
        return;
      }
      setLoading();
      const note = await api(`/api/notes/${current.id}`);
      renderEditor(note);
      return;
    }

    if (current.name === "view") {
      setLoading();
      const [note, rendered] = await Promise.all([
        api(`/api/notes/${current.id}`),
        api(`/api/notes/${current.id}/render`),
      ]);
      renderView(note, rendered && rendered.html);
      return;
    }

    if (current.name === "grammar") {
      setLoading("Checking grammar...");
      const note = await api(`/api/notes/${current.id}`);
      const result = await api(`/api/notes/${current.id}/check`, { method: "POST" });
      renderGrammar(note, result && result.matches);
      return;
    }
  } catch (err) {
    viewEl.innerHTML = `<section class="page"><p class="empty">${escapeHtml(err.message)}</p></section>`;
    toast(err.message, "error");
  }
}

function closeMenu() {
  menuEl.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
}

menuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  const open = menuEl.hidden;
  menuEl.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (event) => {
  if (!menuEl.hidden && !menuEl.contains(event.target) && event.target !== menuBtn) {
    closeMenu();
  }
});

document.getElementById("upload-btn").addEventListener("click", () => {
  closeMenu();
  uploadInput.click();
});

document.getElementById("theme-btn").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("gm-theme", document.body.classList.contains("dark") ? "dark" : "light");
  closeMenu();
});

uploadInput.addEventListener("change", async () => {
  const file = uploadInput.files && uploadInput.files[0];
  uploadInput.value = "";
  if (!file) return;
  const data = new FormData();
  data.append("file", file);
  try {
    const created = await api("/api/notes/upload", { method: "POST", body: data });
    toast("Markdown uploaded.", "success");
    location.hash = `#/notes/${created.id}`;
  } catch (err) {
    toast(err.message, "error");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "/") return;
  const tag = (event.target && event.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  event.preventDefault();
  if (parseRoute().name !== "home") {
    location.hash = "#/";
    return;
  }
  const input = document.getElementById("search-input");
  if (input) input.focus();
});

if (localStorage.getItem("gm-theme") === "dark") {
  document.body.classList.add("dark");
}

window.addEventListener("hashchange", route);
if (!location.hash || location.hash === "#") {
  location.hash = "#/";
} else {
  route();
}
