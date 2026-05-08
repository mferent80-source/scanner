// ═══════════════════════════════════════════════════════════════
//  AI Bubble — modul shared pentru toate paginile din Scanner Hub
//  Expune `window.setupAiBubble({ page, getContext, systemHint })`
//  Storage: `ai_cfg_v1` (shared cross-page) + `ai_history_<page>_v1`
//
//  Pe fiecare pagină se include cu:
//    <script defer src="ai-bubble.js"></script>
//    + apel `setupAiBubble({ page: 'news', getContext: () => '...' })`
// ═══════════════════════════════════════════════════════════════

(function () {
  "use strict";

  const AI_CFG_KEY = "ai_cfg_v1";
  const AI_API_URL = "https://api.anthropic.com/v1/messages";
  const AI_API_VERSION = "2023-06-01";
  const AI_MODEL_DEFAULT = "claude-sonnet-4-6";
  const AI_MODEL_PREMIUM = "claude-opus-4-7";
  const DEFAULT_CFG = { apiKey: "", model: AI_MODEL_DEFAULT, enabled: false };

  const SYSTEM_PROMPT = `Ești un trader pro Pionex futures cu experiență concretă pe piață crypto. User-ul folosește un suite de scannere/dashboard-uri și te întreabă lucruri concrete despre datele afișate.

Reguli:
- Răspunde ÎNTOTDEAUNA în română.
- Răspunsuri concise (3-6 propoziții) — fără markdown excesiv (fără ###).
- Citează cifre specifice când există în context (ex: „RSI 67 + funding +0.05%").
- Fără disclaimere generice gen „consultă consilier financiar" — userul e trader real.
- Când userul întreabă ceva ce nu e în context, spune clar „n-am datele aici" și sugerează unde să caute.
- Pentru ranking/comparație — fii decisiv (1-2-3 cu motiv), nu echivalent.`;

  let aiCfg = { ...DEFAULT_CFG };
  let history = [];
  let bubbleOpen = false;
  let pageName = "";
  let getContext = () => "";
  let extraHint = "";
  let historyKey = "";

  // ── Storage ──
  function loadCfg() {
    try {
      const raw = localStorage.getItem(AI_CFG_KEY);
      if (raw) aiCfg = { ...DEFAULT_CFG, ...JSON.parse(raw) };
    } catch (e) {}
  }
  function loadHistory() {
    try {
      const h = JSON.parse(localStorage.getItem(historyKey) || "[]");
      if (Array.isArray(h)) history = h.slice(-30);
    } catch (e) { history = []; }
  }
  function saveHistory() {
    try { localStorage.setItem(historyKey, JSON.stringify(history.slice(-30))); } catch (e) {}
  }

  // ── CSS injection (idempotent) ──
  function injectStyles() {
    if (document.getElementById("ai-bubble-styles")) return;
    const s = document.createElement("style");
    s.id = "ai-bubble-styles";
    s.textContent = `
      .aib-fab {
        position:fixed; bottom:20px; right:20px; z-index:8500;
        width:54px; height:54px; border-radius:50%;
        background:linear-gradient(135deg, #d946ef, #a78bfa);
        color:#fff; font-size:24px; font-weight:800;
        border:none; cursor:pointer;
        box-shadow:0 8px 24px rgba(217,70,239,.5);
        transition:transform .15s ease;
        font-family:inherit;
      }
      .aib-fab:hover { transform:scale(1.08); }
      .aib-panel {
        position:fixed; bottom:84px; right:20px; z-index:8501;
        width:380px; max-width:calc(100vw - 40px);
        height:520px; max-height:calc(100vh - 120px);
        background:#121826; border:1px solid #242b3e;
        border-radius:14px; box-shadow:0 20px 50px rgba(0,0,0,.6);
        display:flex; flex-direction:column;
        animation:aib-in .25s ease;
        color:#d6dde8; font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;
      }
      @keyframes aib-in { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      .aib-head {
        padding:12px 14px; border-bottom:1px solid #1b2133;
        display:flex; align-items:center; gap:10px;
        background:linear-gradient(180deg, rgba(217,70,239,.08), transparent);
      }
      .aib-head h3 {
        flex:1; font-size:13px; font-weight:800; margin:0;
        background:linear-gradient(90deg, #d946ef, #a78bfa);
        -webkit-background-clip:text; -webkit-text-fill-color:transparent;
      }
      .aib-tag {
        font-size:9px; padding:2px 6px; border-radius:3px;
        background:rgba(167,139,250,.18); color:#a78bfa;
        border:1px solid rgba(167,139,250,.35); font-weight:700;
      }
      .aib-close {
        background:transparent; border:none; color:#6b7487;
        font-size:18px; cursor:pointer; padding:0 4px; line-height:1;
        font-family:inherit;
      }
      .aib-close:hover { color:#d6dde8; }
      .aib-msgs {
        flex:1; overflow-y:auto; padding:12px;
        display:flex; flex-direction:column; gap:8px;
        font-size:12px; line-height:1.45;
      }
      .aib-msg { padding:8px 10px; border-radius:10px; max-width:88%; word-wrap:break-word; }
      .aib-msg.user { background:#1f2638; color:#d6dde8; align-self:flex-end; border:1px solid #242b3e; }
      .aib-msg.bot { background:rgba(217,70,239,.10); color:#d6dde8; align-self:flex-start; border:1px solid rgba(217,70,239,.30); }
      .aib-msg.err { background:rgba(239,68,68,.12); color:#fca5a5; border:1px solid rgba(239,68,68,.35); align-self:flex-start; }
      .aib-empty {
        color:#6b7487; font-size:11.5px; text-align:center;
        padding:20px 12px; line-height:1.6;
      }
      .aib-cfg-prompt {
        background:rgba(217,70,239,.08); border:1px solid rgba(217,70,239,.30);
        border-radius:10px; padding:14px;
        text-align:center; color:#d6dde8; font-size:12px; line-height:1.6;
      }
      .aib-cfg-prompt a {
        color:#d946ef; text-decoration:none; font-weight:700;
      }
      .aib-input {
        padding:10px; border-top:1px solid #1b2133;
        display:flex; gap:6px; align-items:flex-end;
      }
      .aib-input textarea {
        flex:1; padding:8px 10px; background:#1f2638; color:#d6dde8;
        border:1px solid #242b3e; border-radius:8px;
        font-size:12px; font-family:inherit; resize:none; min-height:38px; max-height:120px;
      }
      .aib-input textarea:focus { outline:none; border-color:#a78bfa; }
      .aib-input button {
        background:linear-gradient(135deg, #d946ef, #a78bfa); color:#fff; border:none;
        padding:9px 14px; border-radius:8px; font-size:12px; font-weight:700;
        cursor:pointer; font-family:inherit;
      }
      .aib-input button:disabled { opacity:.5; cursor:not-allowed; }
    `;
    document.head.appendChild(s);
  }

  // ── Streaming API call ──
  async function* callClaudeStream(messages, opts = {}) {
    if (!aiCfg.apiKey) throw new Error("API key Claude lipsă — configurează în ⚙️ Settings");
    const model = opts.model || aiCfg.model || AI_MODEL_DEFAULT;
    const body = {
      model,
      max_tokens: opts.maxTokens || 800,
      stream: true,
      system: [
        { type: "text", text: SYSTEM_PROMPT + (extraHint ? "\n\n" + extraHint : ""), cache_control: { type: "ephemeral" } },
      ],
      messages,
    };
    const res = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": aiCfg.apiKey,
        "anthropic-version": AI_API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try { const j = await res.json(); errMsg = j.error?.message || errMsg; } catch (e) {}
      throw new Error(errMsg);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            yield evt.delta.text;
          }
        } catch (e) {}
      }
    }
  }

  // ── HTML escape ──
  function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  // ── Render ──
  function renderBubble() {
    document.getElementById("aib-fab")?.remove();
    document.getElementById("aib-panel")?.remove();

    // FAB always visible (chiar dacă nu e configurat — click → settings)
    const fab = document.createElement("button");
    fab.id = "aib-fab";
    fab.className = "aib-fab";
    fab.title = "AI Trader Chat (Claude)";
    fab.textContent = bubbleOpen ? "×" : "🪄";
    fab.addEventListener("click", toggleBubble);
    document.body.appendChild(fab);

    if (!bubbleOpen) return;

    const panel = document.createElement("div");
    panel.id = "aib-panel";
    panel.className = "aib-panel";

    if (!aiCfg.apiKey) {
      // Nu e configurat — prompt cu link la settings
      panel.innerHTML = `
        <div class="aib-head">
          <h3>🪄 AI Trader Chat</h3>
          <button class="aib-close" onclick="window.aibToggle()">×</button>
        </div>
        <div class="aib-msgs">
          <div class="aib-cfg-prompt">
            🔑 Configurează API key Claude<br>
            în <a href="settings.html">⚙️ Settings central</a><br>
            ca să folosești AI chat aici.<br><br>
            <span style="color:#6b7487;font-size:10.5px">Default: Claude Sonnet 4.6 ($3/$15 per 1M)<br>Premium: Opus 4.7 ($5/$25 per 1M)</span>
          </div>
        </div>
      `;
      document.body.appendChild(panel);
      return;
    }

    const modelTag = aiCfg.model === AI_MODEL_PREMIUM ? "Opus 4.7" : "Sonnet 4.6";
    panel.innerHTML = `
      <div class="aib-head">
        <h3>🪄 AI Trader Chat — ${esc(pageName)}</h3>
        <span class="aib-tag">${modelTag}</span>
        <button class="aib-close" onclick="window.aibClear()" title="Curăță istoricul">🗑</button>
        <button class="aib-close" onclick="window.aibToggle()">×</button>
      </div>
      <div class="aib-msgs" id="aib-msgs"></div>
      <div class="aib-input">
        <textarea id="aib-input" placeholder="Întreabă ceva despre datele afișate..." rows="2"></textarea>
        <button id="aib-send" onclick="window.aibSend()">📤</button>
      </div>
    `;
    document.body.appendChild(panel);
    renderHistory();
    const ta = document.getElementById("aib-input");
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); window.aibSend(); }
    });
    ta.focus();
  }

  function renderHistory() {
    const box = document.getElementById("aib-msgs");
    if (!box) return;
    if (!history.length) {
      box.innerHTML = `<div class="aib-empty">
        Întreabă-mă orice despre datele afișate pe această pagină.<br>
        <span style="color:#aab3c2">Am context din ${pageName}.</span>
      </div>`;
      return;
    }
    box.innerHTML = history.map(m => `<div class="aib-msg ${m.role}">${esc(m.text).replace(/\n/g, "<br>")}</div>`).join("");
    box.scrollTop = box.scrollHeight;
  }

  // ── Public window actions ──
  function toggleBubble() {
    bubbleOpen = !bubbleOpen;
    renderBubble();
  }
  window.aibToggle = toggleBubble;

  window.aibClear = function () {
    history = [];
    saveHistory();
    renderHistory();
  };

  window.aibSend = async function () {
    const ta = document.getElementById("aib-input");
    const text = (ta?.value || "").trim();
    if (!text) return;
    ta.value = "";
    ta.disabled = true;
    document.getElementById("aib-send").disabled = true;

    history.push({ role: "user", text });
    renderHistory();

    // Build context: page-specific
    let ctx = "";
    try { ctx = getContext() || ""; } catch (e) { ctx = "(eroare la citirea contextului paginii)"; }

    // Build messages: include context la ULTIMUL user message
    const recent = history.slice(-20);
    const msgs = recent.map(m => ({ role: m.role === "bot" ? "assistant" : "user", content: m.text }));
    if (msgs.length && msgs[msgs.length - 1].role === "user" && ctx) {
      msgs[msgs.length - 1].content = `Context (${pageName}):\n${ctx}\n\n---\n\nÎntrebare: ${msgs[msgs.length - 1].content}`;
    }

    history.push({ role: "bot", text: "" });
    renderHistory();

    let acc = "";
    try {
      for await (const chunk of callClaudeStream(msgs, { maxTokens: 700 })) {
        acc += chunk;
        history[history.length - 1].text = acc;
        renderHistory();
      }
    } catch (e) {
      history[history.length - 1] = { role: "err", text: "Eroare: " + e.message };
      renderHistory();
    } finally {
      saveHistory();
      ta.disabled = false;
      const sendBtn = document.getElementById("aib-send");
      if (sendBtn) sendBtn.disabled = false;
      ta.focus();
    }
  };

  // ── Public init ──
  window.setupAiBubble = function (opts) {
    pageName = opts.page || "page";
    getContext = typeof opts.getContext === "function" ? opts.getContext : () => "";
    extraHint = opts.systemHint || "";
    historyKey = `ai_history_${pageName}_v1`;
    loadCfg();
    loadHistory();
    injectStyles();
    renderBubble();
  };

  // Re-citește cfg când userul revine din settings (storage event cross-tab)
  window.addEventListener("storage", (e) => {
    if (e.key === AI_CFG_KEY) {
      loadCfg();
      if (bubbleOpen) renderBubble();
    }
  });
})();
