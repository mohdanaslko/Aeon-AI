/* ═══════════════════════════════════════════════
   GemAI Chat — app.js
   Connects to FastAPI backend at localhost:8000
═══════════════════════════════════════════════ */

/* ── State ─────────────────────────────────── */
const state = {
  sessions: [],
  activeId: null,
  messages: {},   // { sessionId: [{ id, role, text, ts }] }
  loading: false,
};

/* ── DOM refs ──────────────────────────────── */
const $ = (id) => document.getElementById(id);
const sessionsList   = $("sessionsList");
const msgList        = $("msgList");
const messagesEnd    = $("messagesEnd");
const emptyState     = $("emptyState");
const chatInput      = $("chatInput");
const sendBtn        = $("sendBtn");
const sessionBadge   = $("sessionBadgeId");
const menuToggle     = $("menuToggle");
const sidebar        = $("sidebar");
const sidebarOverlay = $("sidebarOverlay");
const newSessionBtn  = $("newSessionBtn");

/* ── Utilities ─────────────────────────────── */
function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── Markdown → HTML ───────────────────────── */
function renderMarkdown(text) {
  if (!text) return "";

  let html = text
    // Fenced code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const langLabel = lang ? lang : "code";
      return `<pre><span class="pre-lang">${escapeHtml(langLabel)}</span><code>${escapeHtml(code.trim())}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`\n]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`)
    // Bold
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,  "<h2>$1</h2>")
    .replace(/^# (.+)$/gm,   "<h1>$1</h1>")
    // Blockquote
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Unordered list items
    .replace(/^[\*\-] (.+)$/gm, "<li>$1</li>")
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    // Double newlines → paragraph break
    .replace(/\n{2,}/g, "</p><p>")
    // Single newlines → <br>
    .replace(/\n/g, "<br>");

  return `<p>${html}</p>`;
}

/* ── Typewriter effect ─────────────────────── */
function typewriterEffect(el, fullHTML, onDone) {
  // We type character-by-character on the raw text, then render markdown at end
  const rawText = el.dataset.rawText || "";
  let i = 0;
  el.classList.add("cursor-blink");

  // Clear any previous interval
  if (el._typeInterval) clearInterval(el._typeInterval);

  el._typeInterval = setInterval(() => {
    i++;
    const partial = rawText.slice(0, i);
    el.innerHTML = renderMarkdown(partial);
    if (i >= rawText.length) {
      clearInterval(el._typeInterval);
      el.classList.remove("cursor-blink");
      if (onDone) onDone();
    }
    messagesEnd.scrollIntoView({ behavior: "smooth" });
  }, 15);
}

/* ── Session management ────────────────────── */
function createSession() {
  const id = "session-" + genId();
  const session = { id, title: "New Conversation", ts: new Date() };
  state.sessions.unshift(session);
  state.messages[id] = [];
  setActiveSession(id);
  renderSidebar();
  return id;
}

function setActiveSession(id) {
  state.activeId = id;
  const shortId = id.slice(8, 15);
  sessionBadge.textContent = shortId;
  renderMessages();
  renderSidebar();
}

/* ── Sidebar render ────────────────────────── */
function renderSidebar() {
  sessionsList.innerHTML = "";
  state.sessions.forEach((s) => {
    const item = document.createElement("div");
    item.className = "session-item" + (s.id === state.activeId ? " active" : "");
    item.innerHTML = `
      <div class="session-dot"></div>
      <div class="session-info">
        <div class="session-title">${escapeHtml(s.title)}</div>
        <div class="session-meta">${s.id.slice(8, 15)} · ${fmtTime(s.ts)}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      setActiveSession(s.id);
      closeSidebar();
    });
    sessionsList.appendChild(item);
  });
}

/* ── Messages render ───────────────────────── */
function renderMessages() {
  const msgs = state.messages[state.activeId] || [];
  msgList.innerHTML = "";

  if (msgs.length === 0 && !state.loading) {
    emptyState.style.display = "flex";
  } else {
    emptyState.style.display = "none";
  }

  msgs.forEach((m, i) => {
    const isLastBot = m.role === "bot" && i === msgs.length - 1;
    const row = buildMessageRow(m, isLastBot);
    msgList.appendChild(row);
  });

  if (state.loading) {
    msgList.appendChild(buildTypingRow());
  }

  messagesEnd.scrollIntoView({ behavior: "auto" });
}

/* Build a single message row */
function buildMessageRow(msg, animate) {
  const row = document.createElement("div");
  row.className = `msg-row ${msg.role}`;
  row.dataset.id = msg.id;

  const avatarHtml = msg.role === "bot"
    ? `<svg width="20" height="20" viewBox="0 0 32 32" fill="none">
        <path d="M16 3L29 11V21L16 29L3 21V11L16 3Z" stroke="#7c5cfc" stroke-width="1.5" fill="rgba(124,92,252,.12)"/>
        <path d="M16 3L23 11H9L16 3Z" fill="rgba(157,124,255,.35)"/>
        <path d="M9 11L3 21H16L9 11Z" fill="rgba(92,224,255,.20)"/>
        <path d="M23 11L29 21H16L23 11Z" fill="rgba(157,124,255,.25)"/>
        <circle cx="16" cy="16" r="2.5" fill="#9d7cff"/>
      </svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5ce0ff" stroke-width="2">
        <circle cx="12" cy="7" r="4"/>
        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>
       </svg>`;

  const bubbleContent = msg.role === "bot"
    ? renderMarkdown(msg.text)
    : escapeHtml(msg.text).replace(/\n/g, "<br>");

  row.innerHTML = `
    <div class="avatar ${msg.role}">${avatarHtml}</div>
    <div class="bubble-wrap">
      <div class="bubble ${msg.role}">${bubbleContent}</div>
      <div class="msg-time">${fmtTime(msg.ts)}</div>
    </div>
  `;

  // Apply typewriter only for last bot message when it's newly added
  if (animate && msg.role === "bot") {
    const bubble = row.querySelector(".bubble");
    bubble.dataset.rawText = msg.text;
    bubble.innerHTML = "";
    typewriterEffect(bubble, null, null);
  }

  return row;
}

/* Typing indicator row */
function buildTypingRow() {
  const row = document.createElement("div");
  row.className = "msg-row bot";
  row.id = "typingRow";
  row.innerHTML = `
    <div class="avatar bot">
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
        <path d="M16 3L29 11V21L16 29L3 21V11L16 3Z" stroke="#7c5cfc" stroke-width="1.5" fill="rgba(124,92,252,.12)"/>
        <circle cx="16" cy="16" r="2.5" fill="#9d7cff"/>
      </svg>
    </div>
    <div class="bubble-wrap">
      <div class="bubble bot">
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>
  `;
  return row;
}

/* ── Append a single message (no full re-render) */
function appendMessage(msg, doTypewriter = false) {
  emptyState.style.display = "none";

  const row = buildMessageRow(msg, doTypewriter);
  msgList.appendChild(row);
  messagesEnd.scrollIntoView({ behavior: "smooth" });
}

/* ── Send message ──────────────────────────── */
async function sendMessage(text) {
  const msgText = (text || chatInput.value).trim();
  if (!msgText || state.loading) return;

  // Clear input
  chatInput.value = "";
  chatInput.style.height = "auto";
  sendBtn.disabled = true;

  // User message
  const userMsg = { id: genId(), role: "user", text: msgText, ts: new Date() };
  state.messages[state.activeId].push(userMsg);
  appendMessage(userMsg, false);

  // Auto-title session from first message
  const session = state.sessions.find(s => s.id === state.activeId);
  if (session && session.title === "New Conversation") {
    session.title = msgText.slice(0, 40) + (msgText.length > 40 ? "…" : "");
    renderSidebar();
  }

  // Show typing
  state.loading = true;
  const typingRow = buildTypingRow();
  msgList.appendChild(typingRow);
  messagesEnd.scrollIntoView({ behavior: "smooth" });

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: state.activeId, message: msgText }),
    });

    if (!res.ok) throw new Error(`Server error: HTTP ${res.status}`);
    const data = await res.json();

    // Remove typing indicator
    typingRow.remove();
    state.loading = false;

    const botMsg = { id: genId(), role: "bot", text: data.response, ts: new Date() };
    state.messages[state.activeId].push(botMsg);
    appendMessage(botMsg, true);

  } catch (err) {
    typingRow.remove();
    state.loading = false;

    const errMsg = {
      id: genId(),
      role: "bot",
      text: `**Connection error:** ${err.message}\n\nMake sure your FastAPI server is running:\n\`\`\`bash\npython app.py\n\`\`\``,
      ts: new Date(),
    };
    state.messages[state.activeId].push(errMsg);
    appendMessage(errMsg, false);
  }
}

/* ── Sidebar open/close ────────────────────── */
function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("visible");
}

function closeSidebar() {
  if (window.innerWidth < 768) {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("visible");
  }
}

/* ── Auto-resize textarea ─────────────────── */
function autoResize() {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + "px";
}

/* ── Event listeners ───────────────────────── */
chatInput.addEventListener("input", () => {
  autoResize();
  sendBtn.disabled = chatInput.value.trim().length === 0;
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", () => sendMessage());

newSessionBtn.addEventListener("click", () => {
  createSession();
  closeSidebar();
});

menuToggle.addEventListener("click", () => {
  if (sidebar.classList.contains("open")) {
    closeSidebar();
  } else {
    openSidebar();
  }
});

sidebarOverlay.addEventListener("click", closeSidebar);

// Suggestion chips
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const prompt = chip.dataset.prompt;
    sendMessage(prompt);
  });
});

/* ── Init ──────────────────────────────────── */
function init() {
  const id = createSession();
  state.activeId = id;
  sessionBadge.textContent = id.slice(8, 15);
  renderSidebar();
  renderMessages();
  chatInput.focus();

  // On desktop, sidebar is always visible (no .open class needed)
  if (window.innerWidth >= 768) {
    sidebar.style.transform = ""; // reset any mobile transform
  }
}

// Handle resize (sidebar visibility)
window.addEventListener("resize", () => {
  if (window.innerWidth >= 768) {
    sidebar.classList.remove("open"); // desktop: visible via CSS width
    sidebarOverlay.classList.remove("visible");
    sidebar.style.transform = "";
  }
});

init();