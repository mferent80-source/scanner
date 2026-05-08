// ═══════════════════════════════════════════════════════════════
//  Telegram Alerts — modul shared pentru paginile cu alerte din Scanner Hub
//
//  Storage shared:
//    - `tg_cfg_v1` = { token, chatId } (config bot, comun pe toate paginile)
//    - `tg_pages_v1` = { stl, watchlist, pump }: bool (toggle per pagină)
//
//  API public:
//    - window.setupTelegramAlerts({ pageId, pageLabel, btnId, alertLabel, alertHint })
//      apelat o dată la load pe fiecare pagină → adaugă click handler pe buton + UI
//    - window.sendTelegram(html) — trimite mesaj dacă pagina curentă e ON
//      (return Promise<boolean> — true dacă mesajul a plecat cu succes)
//
//  Pe fiecare pagină se include cu:
//    <script defer src="tg-alerts.js"></script>
//    + apel `setupTelegramAlerts({ pageId: 'stl', pageLabel: 'Smart Trade Long', ... })`
// ═══════════════════════════════════════════════════════════════

(function () {
  "use strict";

  const TG_CFG_KEY = "tg_cfg_v1";
  const TG_PAGES_KEY = "tg_pages_v1";

  // State (module-level)
  let tgCfg = { token: "", chatId: "" };
  let tgPageEnabled = false;
  let pageId = "";
  let pageLabel = "";
  let btnId = "tgBtn";
  let alertLabel = "alerte";
  let alertHint = "";
  let onChange = null;

  // ── Storage ──
  function loadCfg() {
    try {
      const raw = localStorage.getItem(TG_CFG_KEY);
      if (raw) tgCfg = { token: "", chatId: "", ...JSON.parse(raw) };
    } catch (e) {}
    try {
      const pages = JSON.parse(localStorage.getItem(TG_PAGES_KEY) || "{}");
      tgPageEnabled = !!pages[pageId];
    } catch (e) {}
  }
  function saveCfg() { localStorage.setItem(TG_CFG_KEY, JSON.stringify(tgCfg)); }
  function setPageEnabled(on) {
    let pages = {};
    try { pages = JSON.parse(localStorage.getItem(TG_PAGES_KEY) || "{}"); } catch (e) {}
    pages[pageId] = !!on;
    localStorage.setItem(TG_PAGES_KEY, JSON.stringify(pages));
    tgPageEnabled = !!on;
  }

  // ── Helpers ──
  function escAttr(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  // Toast generic — folosește toast() global dacă pagina îl expune, altfel alert nativ
  function notify(cls, html) {
    if (typeof window.toast === "function") { window.toast(cls, html, cls === "err" ? 4500 : 3000); return; }
    // Fallback: console + tiny inline toast
    if (cls === "err") console.warn("[TG]", html.replace(/<[^>]+>/g, ""));
    if (typeof window.alert === "function" && cls === "err") window.alert(html.replace(/<[^>]+>/g, ""));
  }

  // ── Send (public) ──
  window.sendTelegram = async function (text) {
    if (!tgPageEnabled || !tgCfg.token || !tgCfg.chatId) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${tgCfg.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: tgCfg.chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        console.warn("[TG] send failed:", r.status, j.description || "");
      }
      return r.ok;
    } catch (e) {
      console.warn("[TG] send error:", e.message);
      return false;
    }
  };

  // ── UI ──
  function updateBtnUI() {
    const b = document.getElementById(btnId);
    if (!b) return;
    const configured = !!(tgCfg.token && tgCfg.chatId);
    if (!configured) {
      // Nu modificăm textul dacă pagina folosește icon-only (gen Pump Radar `📱`)
      const original = b.dataset.tgOriginal || b.textContent;
      b.dataset.tgOriginal = original;
      b.textContent = original.includes("TG") ? "📱 TG" : original;
      b.classList.remove("primary");
      return;
    }
    // Configurat — text "ON" / "OFF"
    b.textContent = tgPageEnabled ? "📱 ON" : "📱 OFF";
    b.classList.toggle("primary", tgPageEnabled);
  }

  function injectModalStyles() {
    if (document.getElementById("tg-alerts-styles")) return;
    const s = document.createElement("style");
    s.id = "tg-alerts-styles";
    s.textContent = `
      .tga-overlay {
        position:fixed; inset:0; background:rgba(5,8,15,.78); z-index:9999;
        display:flex; align-items:center; justify-content:center; padding:16px;
        animation:tga-fadein .2s ease;
      }
      @keyframes tga-fadein { from { opacity:0; } to { opacity:1; } }
      .tga-modal {
        background:#121826; border:1px solid #242b3e; border-radius:14px;
        padding:18px; width:100%; max-width:440px;
        max-height:90vh; overflow-y:auto;
        box-shadow:0 30px 80px rgba(0,0,0,.6);
        color:#d6dde8; font-size:12px;
        font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;
      }
      .tga-head {
        display:flex; justify-content:space-between; align-items:flex-start;
        margin-bottom:12px; gap:10px;
      }
      .tga-head h3 {
        font-size:15px; font-weight:800; letter-spacing:-.2px; margin:0;
        background:linear-gradient(90deg,#0088cc,#33c2ff);
        -webkit-background-clip:text; -webkit-text-fill-color:transparent;
      }
      .tga-head .sub { font-size:10.5px; color:#6b7487; margin-top:3px; }
      .tga-close {
        background:transparent; border:none; color:#6b7487; font-size:18px;
        cursor:pointer; padding:0 4px; line-height:1; font-family:inherit;
      }
      .tga-close:hover { color:#d6dde8; }
      .tga-section {
        background:#1a2032; border:1px solid #1b2133;
        border-radius:8px; padding:10px 12px; margin-bottom:8px;
      }
      .tga-section-title {
        font-size:10px; font-weight:800; letter-spacing:.5px; text-transform:uppercase;
        color:#aab3c2; margin-bottom:6px;
      }
      .tga-field { display:flex; flex-direction:column; gap:8px; }
      .tga-field label {
        font-size:10px; color:#6b7487; display:block; margin-bottom:3px;
        text-transform:uppercase; letter-spacing:.3px; font-weight:600;
      }
      .tga-field input {
        width:100%; padding:7px 10px; background:#1f2638; color:#d6dde8;
        border:1px solid #242b3e; border-radius:5px; font-size:12px;
        font-family:inherit; font-variant-numeric:tabular-nums;
      }
      .tga-field input:focus { outline:none; border-color:#33c2ff; }
      .tga-hint { font-size:10.5px; color:#6b7487; line-height:1.5; }
      .tga-hint code { background:#1f2638; padding:1px 4px; border-radius:3px; font-size:10px; }
      .tga-hint b { color:#aab3c2; }
      .tga-checkbox {
        display:flex; align-items:center; gap:10px; cursor:pointer; padding:6px 0;
      }
      .tga-checkbox input { accent-color:#0088cc; width:18px; height:18px; }
      .tga-actions { display:flex; gap:8px; margin-top:10px; }
      .tga-actions button {
        flex:1; padding:9px 12px; border-radius:7px;
        font-size:12px; font-weight:700; cursor:pointer;
        font-family:inherit; border:1px solid #242b3e;
        background:#1f2638; color:#d6dde8; transition:all .12s;
      }
      .tga-actions button:hover { border-color:#5bb0ff; }
      .tga-actions button.tga-primary {
        background:linear-gradient(135deg,#0088cc,#33c2ff);
        border-color:transparent; color:#fff;
      }
      .tga-actions button.tga-primary:hover { filter:brightness(1.1); }
    `;
    document.head.appendChild(s);
  }

  function openModal() {
    document.getElementById("tgaOverlay")?.remove();

    const ov = document.createElement("div");
    ov.id = "tgaOverlay";
    ov.className = "tga-overlay";
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });

    ov.innerHTML = `
      <div class="tga-modal">
        <div class="tga-head">
          <div>
            <h3>📱 Telegram Alerts</h3>
            <div class="sub">Config bot · alerte ${escAttr(alertLabel)} pe phone</div>
          </div>
          <button class="tga-close" type="button" data-tga="close">×</button>
        </div>

        <div class="tga-section">
          <div class="tga-section-title">⚙️ Config bot (shared cross-page)</div>
          <div class="tga-field">
            <div>
              <label>Bot token</label>
              <input type="password" id="tgaToken" value="${escAttr(tgCfg.token)}" placeholder="123456:ABC-DEF...">
            </div>
            <div>
              <label>Chat ID</label>
              <input type="text" id="tgaChat" value="${escAttr(tgCfg.chatId)}" placeholder="123456789 sau -100...">
            </div>
            <div class="tga-hint">
              <b>Cum:</b> <code>@BotFather</code> → <code>/newbot</code> → token. Trimite-i botului „start" → <code>api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> → <code>chat.id</code>.
            </div>
          </div>
        </div>

        <div class="tga-section">
          <div class="tga-section-title">📍 Pe această pagină (${escAttr(pageLabel)})</div>
          <label class="tga-checkbox">
            <input type="checkbox" id="tgaEnable" ${tgPageEnabled ? "checked" : ""}>
            <span style="font-size:12.5px">Trimite alertă Telegram ${escAttr(alertLabel)}</span>
          </label>
          ${alertHint ? `<div class="tga-hint" style="margin-top:6px">${escAttr(alertHint)}</div>` : ""}
        </div>

        <div class="tga-actions">
          <button type="button" data-tga="test">📤 Test</button>
          <button type="button" class="tga-primary" data-tga="save">💾 Salvează</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    // Wire buttons (no inline onclick — CSP-safer)
    ov.querySelector('[data-tga="close"]').addEventListener("click", () => ov.remove());
    ov.querySelector('[data-tga="test"]').addEventListener("click", testTelegram);
    ov.querySelector('[data-tga="save"]').addEventListener("click", saveAndClose);
  }

  async function testTelegram() {
    const token = document.getElementById("tgaToken").value.trim();
    const chat = document.getElementById("tgaChat").value.trim();
    if (!token || !chat) { notify("err", "Completează token + chat ID"); return; }
    notify("ok", "📤 Trimit test...");
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chat,
          text: `✅ <b>${pageLabel}</b> — test alert\n\nDacă vezi mesajul, integrarea funcționează 🎯`,
          parse_mode: "HTML",
        }),
      });
      if (r.ok) notify("ok", "✅ Test trimis cu succes");
      else { const j = await r.json().catch(() => ({})); notify("err", `Test eșuat: ${j.description || r.status}`); }
    } catch (e) { notify("err", "Test eșuat: " + e.message); }
  }

  function saveAndClose() {
    tgCfg.token = document.getElementById("tgaToken").value.trim();
    tgCfg.chatId = document.getElementById("tgaChat").value.trim();
    saveCfg();
    setPageEnabled(document.getElementById("tgaEnable").checked);
    updateBtnUI();
    document.getElementById("tgaOverlay")?.remove();
    notify("ok", tgPageEnabled ? `📱 Telegram ON pe ${pageLabel}` : `📱 Telegram OFF pe ${pageLabel}`);
    if (typeof onChange === "function") {
      try { onChange({ enabled: tgPageEnabled, configured: !!(tgCfg.token && tgCfg.chatId) }); } catch (e) {}
    }
  }

  // ── Public init ──
  window.setupTelegramAlerts = function (opts) {
    pageId = opts.pageId;
    pageLabel = opts.pageLabel || opts.pageId;
    alertLabel = opts.alertLabel || "alerte noi";
    alertHint = opts.alertHint || "";
    btnId = opts.btnId || "tgBtn";
    onChange = typeof opts.onChange === "function" ? opts.onChange : null;

    loadCfg();
    injectModalStyles();
    updateBtnUI();

    const btn = document.getElementById(btnId);
    if (btn) btn.addEventListener("click", openModal);
  };

  // Re-citește cfg când userul revine din settings (storage event cross-tab)
  window.addEventListener("storage", (e) => {
    if (e.key === TG_CFG_KEY || e.key === TG_PAGES_KEY) {
      loadCfg();
      updateBtnUI();
    }
  });
})();
