/* content.js – läuft auf den Portalseiten (WG-Gesucht, Kleinanzeigen, ImmoScout,
   Immowelt/Immonet). Erkennt Trefferliste vs. Einzelanzeige, füllt das
   Kontaktformular mit dem erzeugten Anschreiben vor und zeigt ein Overlay zur
   Bestätigung. Gesendet wird NIE automatisch – der Nutzer klickt selbst.
   Alle Aktionen sind defensiv: bricht ein Portal aus dem erwarteten HTML aus,
   greifen generische Fallbacks bzw. das Overlay bietet „Anschreiben kopieren".

   ┌─ DESIGN-INVARIANTE (bewusst so, auch rechtlich relevant – NICHT ohne
   │  Rücksprache aufweichen): WohnungsBewerber ist ein ASSISTENT, kein Bot.
   │  1. Es wird NIE automatisch gesendet. Der Nutzer klickt den echten
   │     „Senden"-Knopf des Portals selbst – KEIN programmatischer .click()/
   │     submit() auf den Sende-Button, KEIN Auto-Absenden von Formularen.
   │     (highlightSend/scrollToSend heben den Button nur hervor.)
   │  2. Gelesen wird NUR die vom Nutzer selbst geöffnete Seite – lokal, kein
   │     zentrales/massenhaftes Scraping, keine Weitergabe.
   │  3. Es werden KEINE Logins oder technischen Schutzmaßnahmen umgangen.
   │  Wird eine dieser Regeln aufgeweicht (z. B. Voll-Automatik), kippt die
   │  rechtliche Einordnung vom „Werkzeug in der Hand des Nutzers" hin zu einer
   └─ Automatisierung, die die Portale gezielt behindert. Deshalb: unangetastet. */
(function () {
  "use strict";
  if (!window.WBA || !WBA.portals) return;
  const { parse, letter, store, portals } = WBA;
  const portal = portals.forUrl(location.href);
  if (!portal) return;

  const dom = portals.dom;
  const CFG = WBA.CONFIG || {};
  const log = WBA.log || console;
  const i18n = WBA.i18n;
  // Oberflächensprache des Overlays. Der ANSCHREIBEN-TEXT bleibt immer deutsch –
  // er geht an die Vermietung (Invariante in lib/i18n.js).
  const tr = (k, p) => i18n.t(k, p);
  // Build-Kennung: macht auf einen Blick (Konsole + Overlay) erkennbar, ob nach einem
  // Update wirklich die NEUE Version läuft. Wichtig, weil Content-Scripts in bereits
  // offenen Tabs erst nach einem Tab-Reload neu injiziert werden.
  const BUILD = (function () { try { return chrome.runtime.getManifest().version; } catch (e) { return "?"; } })();
  try { log.info("Build " + BUILD + " aktiv auf " + portal.name); } catch (e) {}
  let host, shadow, panel;
  // Letzte Overlay-Ansicht als Neuzeichen-Funktion. Wird der Sprachschalter im
  // Dashboard umgelegt, während hier ein Portal-Tab offen ist, soll das Overlay
  // sofort mitwechseln, statt bis zur nächsten Anzeige deutsch zu bleiben.
  let lastRender = null;
  let generated = "";
  let currentSalut = null; // aktuelle Anrede-Klassifikation (WBA.salutation), vom Nutzer korrigierbar
  let state = { run: null, profile: {}, filters: {}, aiReady: false, docs: {} };

  /* ---------- kleine Helfer ---------- */
  /**
   * Wartet per MutationObserver darauf, dass fn() einen (truthy) Wert liefert –
   * statt fester Timeouts, damit auch langsam rendernde SPA-Portale (Immowelt,
   * ImmoScout) zuverlässig erkannt werden. Checks sind gedrosselt
   * (CONFIG.MUTATION_THROTTLE_MS), damit mutationsreiche Seiten nicht
   * ausgebremst werden. Nach `timeout` ms wird ein letztes Mal geprüft und mit
   * dem Ergebnis (oder null) aufgelöst.
   * @template T
   * @param {() => T} fn - Prüf-Funktion; truthy-Rückgabe beendet das Warten.
   * @param {number} [timeout] - Max. Wartezeit in ms (Default: DETECT_TIMEOUT_MS).
   * @returns {Promise<T|null>}
   */
  function waitFor(fn, timeout) {
    return new Promise((resolve) => {
      let done = false, scheduled = false;
      const safe = () => { try { return fn(); } catch (e) { return null; } };
      const obs = new MutationObserver(schedule);
      const timer = setTimeout(() => finish(safe() || null), timeout || CFG.DETECT_TIMEOUT_MS || 9000);
      function finish(v) { if (done) return; done = true; obs.disconnect(); clearTimeout(timer); resolve(v); }
      function check() { scheduled = false; if (done) return; const v = safe(); if (v) finish(v); }
      function schedule() { if (!scheduled && !done) { scheduled = true; setTimeout(check, CFG.MUTATION_THROTTLE_MS || 250); } }
      obs.observe(document.documentElement, { childList: true, subtree: true });
      check();
    });
  }
  function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  // Statische Inline-SVG-Icons (lib/icons.js) – kein Nutzer-Input, innerHTML-sicher.
  const ic = (name, size) => (WBA.icons ? WBA.icons.svg(name, size || 13) : "");
  // Einheitliche Kopfzeile des Overlays (Logo-Kachel, Name, Version, Fenster-Knöpfe).
  function headHtml(opts) {
    opts = opts || {};
    return '<div class="hd"><span class="logo">' + ic("home", 14) + '</span><span>WohnungsBewerber</span>' +
      (opts.ver ? '<span class="ver">v' + esc(BUILD) + "</span>" : "") +
      '<span class="grow"></span>' +
      (opts.min ? '<button class="ic" data-act="min" title="' + esc(tr("ov.minimize")) + '">' + ic("minus", 14) + "</button>" : "") +
      '<button class="ic" data-act="close" title="' + esc(tr("ov.close")) + '">' + ic("x", 14) + "</button></div>";
  }

  /* ---------- Overlay-Gerüst (Shadow DOM, damit Portal-CSS nicht stört) ----------
     Design 2.1.0 „Ruhig & professionell": neutraler Kopf mit kleiner Gradient-
     Logo-Kachel, EIN Primär-Button, klare Sekundär-/Werkzeug-Hierarchie,
     dezente Tints statt Leucht-Schatten. Gleiche Tokens wie shared.css. */
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .box { --acc: #17795A; --acc2: #0f6047; --tint: rgba(23,121,90,0.09);
      --text: #1B2420; --muted: #56615A; --bdr: rgba(27,36,32,0.14);
      --bg: #ffffff; --inp: #F5EEE2; --ok: #16a34a; --warn: #b45309;
      position: fixed; top: 16px; right: 16px; width: 364px; max-height: calc(100vh - 32px);
      display: flex; flex-direction: column; z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--text); background: var(--bg); border: 1px solid var(--bdr);
      border-radius: 18px; overflow: hidden;
      box-shadow: 0 1px 2px rgba(27,36,32,0.06), 0 18px 50px -22px rgba(27,36,32,0.35); }
    svg { display: inline-block; vertical-align: -2px; }
    .hd { display: flex; align-items: center; gap: 9px; padding: 11px 12px;
      border-bottom: 1px solid var(--bdr); font-weight: 700; font-size: 13.5px; }
    .hd .logo { display: inline-grid; place-items: center; width: 26px; height: 26px; flex: 0 0 auto;
      border-radius: 8px; color: #fff; background: linear-gradient(135deg, var(--acc), var(--acc2)); }
    .hd .ver { font-size: 10px; font-weight: 600; color: var(--muted);
      background: var(--tint); padding: 1px 7px; border-radius: 999px; }
    .hd .grow { flex: 1; }
    .hd button.ic { all: unset; cursor: pointer; display: inline-grid; place-items: center;
      width: 26px; height: 26px; border-radius: 8px; color: var(--muted); }
    .hd button.ic:hover { background: var(--tint); color: var(--text); }
    .bd { padding: 13px; overflow: auto; }
    .prog { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
      color: var(--muted); margin: 0 0 8px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .chip { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px;
      color: var(--text); background: var(--tint); border: 1px solid rgba(23,121,90,0.28); }
    textarea { width: 100%; min-height: 190px; resize: vertical;
      border: 1px solid var(--bdr); border-radius: 12px; padding: 10px 11px; font-size: 12.5px;
      line-height: 1.55; font-family: inherit; color: var(--text); background: var(--inp); }
    textarea:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px rgba(23,121,90,0.18); }
    .msg { font-size: 12px; margin: 8px 0 0; padding: 8px 10px; border-radius: 8px; line-height: 1.45; }
    .msg.ok { background: rgba(22,163,74,0.1); color: #15803d; }
    .msg.warn { background: rgba(180,83,9,0.1); color: var(--warn); }
    .row { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 9px; }
    button.b { all: unset; cursor: pointer; text-align: center; box-sizing: border-box;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 600;
      font-family: inherit; border: 1px solid var(--bdr); background: var(--bg);
      color: var(--text); flex: 1 1 auto; transition: background .15s, border-color .15s; }
    button.b:hover { border-color: rgba(23,121,90,0.5); background: var(--tint); }
    button.b.primary { background: linear-gradient(135deg, var(--acc), var(--acc2)); color: #fff;
      border: none; flex-basis: 100%; padding: 11px 12px; font-size: 13px; font-weight: 700; }
    button.b.primary:hover { filter: brightness(1.06); background: linear-gradient(135deg, var(--acc), var(--acc2)); }
    button.b.go { background: rgba(22,163,74,0.1); color: #15803d; border-color: rgba(22,163,74,0.4); }
    button.b.go:hover { background: rgba(22,163,74,0.16); border-color: rgba(22,163,74,0.55); }
    button.b.sm { flex: 1 1 auto; padding: 7px 9px; font-size: 11.5px; color: var(--muted); }
    button.b.sm:hover { color: var(--text); }
    .tools { display: flex; gap: 6px; margin-top: 8px; }
    button.link { all: unset; cursor: pointer; display: block; width: 100%; text-align: center;
      margin-top: 9px; font-size: 11.5px; font-weight: 600; font-family: inherit;
      color: var(--warn); padding: 5px; border-radius: 8px; }
    button.link:hover { background: rgba(180,83,9,0.08); }
    .foot { font-size: 10.5px; color: var(--muted); margin: 10px 0 0; text-align: center; line-height: 1.4; }
    .salut { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 0 0 10px; }
    .salut .lbl { display: inline-flex; align-items: center; gap: 5px;
      font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
    .salut .lbl.ok { background: rgba(22,163,74,0.1); color: #15803d; }
    .salut .lbl.warn { background: rgba(180,83,9,0.1); color: var(--warn); }
    .salut select { flex: 1 1 auto; min-width: 130px; font-size: 12px; padding: 5px 7px;
      border-radius: 8px; border: 1px solid var(--bdr); background: var(--inp); color: var(--text); font-family: inherit; }
    @media (prefers-color-scheme: dark) {
      .box { --text: #F2EDE3; --muted: #A79F92; --bdr: rgba(255,249,240,0.15);
        --bg: #1C1A16; --inp: rgba(255,249,240,0.05); --tint: rgba(63,190,142,0.14);
        --acc: #3FBE8E; --acc2: #0f6047;
        box-shadow: 0 1px 2px rgba(0,0,0,0.4), 0 18px 50px -22px rgba(0,0,0,0.7); }
      .msg.ok, button.b.go { color: #34d399; }
      .salut .lbl.ok { color: #34d399; }
    }
  `;

  function mountHost() {
    if (host) return;
    host = document.createElement("div");
    host.id = "wba-copilot-host";
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style"); style.textContent = CSS; shadow.appendChild(style);
    panel = document.createElement("div"); shadow.appendChild(panel);
    (document.body || document.documentElement).appendChild(host);
  }
  function removeHost() { if (host) { host.remove(); host = null; } lastRender = null; }

  // Sprachwechsel aus einem anderen Kontext (Dashboard) → aktuelle Ansicht neu
  // zeichnen. Der Entwurf selbst bleibt deutsch und darf dabei NICHT verloren
  // gehen: von Hand geänderten Text vorher aus dem Textfeld zurückholen.
  i18n.onChange(() => {
    if (!host || !lastRender) return;
    try {
      const ta = panel && panel.querySelector('[data-el="ta"]');
      if (ta) generated = ta.value;
      lastRender();
    } catch (e) { log.debug("Overlay-Neuaufbau nach Sprachwechsel:", e); }
  });

  /* ---------- Dashboard öffnen (robust) ---------- */
  // Nach einem Extension-Update sind Content-Scripts in offenen Tabs „verwaist":
  // chrome.runtime.sendMessage wirft dann synchron („Extension context invalidated").
  // Ohne Fangnetz stürbe der Klick-Handler still – der Nutzer sähe gar nichts.
  function openDashboard(hash) {
    try {
      chrome.runtime.sendMessage({ type: "openDashboard", hash }, () => { void chrome.runtime.lastError; });
    } catch (e) {
      flashMsg(tr("ov.updated"), true);
    }
  }

  /* ---------- Schreiben ins ECHTE Nachrichtenfeld ---------- */
  // Merkt sich, was WIR zuletzt ins Portal-Formular geschrieben haben. Nur eigener
  // Text darf still ersetzt werden (Anrede-Korrektur, „Neu") – fremder Text (selbst
  // getippte Nachricht, Chat-Antwort, Entwurf nach Reload) NIE, außer der Nutzer
  // klickt explizit „Einfügen" (force).
  let lastInserted = "";
  function setDraftIntoForm(box, text, force) {
    if (!box) return false;
    const cur = (box.value || "").trim();
    if (!force && cur && cur !== lastInserted.trim()) return false;
    dom.setMessage(box, text);
    lastInserted = text;
    return true;
  }

  /* ---------- Senden-Button hervorheben ---------- */
  let highlighted = null;
  function highlightSend() {
    const btn = dom.findSendButton(portal, document);
    if (btn) { btn.classList.add("wba-cp-pulse"); highlighted = btn; injectPulseStyle(); }
    return btn;
  }
  function injectPulseStyle() {
    if (document.getElementById("wba-cp-pulse-style")) return;
    const s = document.createElement("style"); s.id = "wba-cp-pulse-style";
    s.textContent = ".wba-cp-pulse{outline:3px solid #17795A !important;outline-offset:2px;border-radius:6px;animation:wbaCpPulse 1.3s ease-in-out infinite}@keyframes wbaCpPulse{0%,100%{outline-color:#17795A}50%{outline-color:rgba(203,110,69,.45)}}";
    (document.head || document.documentElement).appendChild(s);
  }
  function scrollToSend() {
    const btn = highlighted || highlightSend();
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------- Trefferliste ---------- */
  async function handleResults() {
    const results = dom.scrapeResults(portal, document);
    if (!results.length) return; // nichts erkannt → still bleiben
    mountHost();
    panel.dataset.view = "results";
    lastRender = () => handleResults();
    const resumable = state.run && state.run.active && state.run.portal === portal.id;
    panel.innerHTML = `
      <div class="box">
        ${headHtml()}
        <div class="bd">
          <p class="prog">${esc(tr("ov.found", { n: results.length }))}</p>
          <p style="font-size:12.5px;margin:0 0 4px">${esc(tr("ov.foundText"))}</p>
          ${resumable ? '<div class="msg ok">' + esc(tr("ov.resumable")) + '</div>' : '<div class="msg" hidden></div>'}
          <div class="row">
            <button class="b primary" data-act="start">${ic("play")} ${esc(tr("ov.start", { n: results.length }))}</button>
            ${resumable ? '<button class="b" data-act="resume">' + ic("refresh") + " " + esc(tr("ov.resume")) + '</button>' : ''}
          </div>
          <p class="foot">${tr("ov.resultsFoot")}</p>
        </div>
      </div>`;
    panel.querySelector('[data-act="close"]').onclick = removeHost;
    const startBtn = panel.querySelector('[data-act="start"]');
    startBtn.onclick = async () => {
      if (startBtn.disabled) return; // Doppelklick → doppelter Run-Setup
      startBtn.disabled = true;
      // Bereits beworbene herausfiltern – Tracker EINMAL lesen statt je Treffer
      // (hasApplied lädt sonst bei 100 Treffern 100-mal die komplette Liste).
      const tracker = await store.getTracker();
      const applied = new Set(tracker
        .filter((e) => store.APPLIED_STATUS.includes(e.status))
        .map((e) => store.trackerKey(e.portal, e.listingId)));
      const filtered = results.filter((r) => !applied.has(store.trackerKey(portal.id, r.id)));
      // Kein Rückfall auf die ungefilterte Liste: sind alle Treffer beworben,
      // ehrlich sagen statt den Nutzer durch lauter alte Anzeigen zu führen (FUN-05).
      if (!filtered.length) { flashMsg(tr("ov.allApplied"), true); startBtn.disabled = false; return; }
      const queue = filtered;
      // Ohne gespeicherten Run NICHT losnavigieren – der Durchlauf würde nach
      // der ersten Anzeige orientierungslos abbrechen (FUN-03).
      try { await store.setRun({ active: true, portal: portal.id, tone: state.filters.ton || "standard", queue, index: 0, startedAt: Date.now() }); }
      catch (e) { flashMsg(tr("err.save", { err: (e && e.message) || String(e) }), true); startBtn.disabled = false; return; }
      location.href = queue[0].url;
    };
    const res = panel.querySelector('[data-act="resume"]');
    if (res) res.onclick = () => { const q = state.run.queue || []; const i = Math.min(state.run.index || 0, q.length - 1); if (q[i]) location.href = q[i].url; };
  }

  // Ermittelt die Ansprechperson und klassifiziert sie FAIL-SAFE über WBA.salutation.
  // Priorität:
  //  1) WG-Gesucht-Composer („Nachricht senden an <Name>", Nachname gekürzt) →
  //     informelle Vornamen-Anrede „Hallo <Vorname>,".
  //  2) Anbietername aus der Verkäufer-/Kontaktbox: Person NUR bei explizitem
  //     „Frau/Herr"; Firma → neutrale Anrede.
  //  3) explizites „Frau/Herr X" aus dem Anzeigen-Fließtext (ohne Formular/Impressum).
  // Grundsatz: Geschlecht wird NIE aus einem Vornamen geraten – Unsicheres bleibt neutral.
  function resolveContact() {
    const sal = WBA.salutation;
    if (portal.informalGreeting) {
      const rec = dom.recipientName(portal, document);
      if (rec) {
        const c = sal.classify(rec, { expectFirstName: true });
        if (c.category !== "neutral") return c;
      }
    }
    // ALLE Quellen einsammeln und die verlässlichste Anrede wählen (pickBest):
    // der vollständigste Frau/Herr-Name gewinnt, Quellen werden zusammengeführt
    // („Herr Jens" + „Jens Trautmann" → „Sehr geehrter Herr Trautmann,"),
    // Personen schlagen Firmenfelder.
    const strings = dom.sellerNames(portal, document);
    const cands = strings.map((s) => sal.classify(s));
    const t = parse.extractContact(parse.pageTextForContact());
    if (t && t.name) cands.push(sal.classify(t.anrede + " " + t.name));
    const best = sal.pickBest(cands);
    log.debug("Anrede-Kandidaten:", strings, "→", best);
    return best;
  }

  // Verlässlichkeits-Rang einer Klassifikation – für die Frage „ist eine später
  // gefundene Quelle (z. B. im nachgeladenen Kontaktformular) besser?".
  function salutScore(c) {
    if (!c) return 0;
    if ((c.category === "frau" || c.category === "herr") && c.name) return (c.count || 1) >= 2 ? 5 : 4;
    if (c.category === "familie" || c.category === "vorname") return 4;
    if (c.personLike) return 2;
    if (c.category === "firma") return 2;
    return 1;
  }

  /* ---------- Einzelanzeige ---------- */
  async function handleListing() {
    // URL-Guard: zwischen den awaits (KI-Anfrage, Formular-Warten) kann die SPA
    // weiternavigieren – dann gehören Overlay und Tracker-Eintrag zur ALTEN
    // Anzeige und dürfen nicht mehr auf der neuen landen (watchUrlChanges hat
    // bereits eine frische Erkennung angestoßen).
    const startUrl = location.href.split("#")[0];
    const urlChanged = () => location.href.split("#")[0] !== startUrl;
    // Extraktion NUR aus anzeigen-eigenen Bereichen (contentSel) bzw. Titel/Meta –
    // nie aus „Ähnliche Anzeigen"/Werbung (Fix 2.0.2, falsche Terrasse/Eckdaten).
    let scoped = false;
    try { scoped = !!(portal.contentSel && document.querySelector(portal.contentSel)); } catch (e) {}
    log.debug("Extraktion", scoped ? "scoped (contentSel trifft)" : "Fallback: nur Titel/Meta/ld+json");
    const text = parse.pageExtractor(portal.contentSel);
    const info = parse.extractFlatInfo(text);
    currentSalut = resolveContact();
    const run = state.run && state.run.active && state.run.portal === portal.id ? state.run : null;
    const tone = (run && run.tone) || state.filters.ton || "standard";
    const flat = { desc: parse.summaryFromInfo(info), salutation: currentSalut };

    const queue = run ? run.queue || [] : [];
    let qIndex = queue.findIndex((e) => (e.url || "").split("#")[0] === location.href.split("#")[0]);
    if (qIndex < 0) qIndex = run ? (run.index || 0) : -1;

    const p = state.profile || {};
    generated = "";
    if (p.name) {
      // KI bevorzugt (im Hintergrund via Service-Worker), sonst der kompositorische Generator.
      if (state.aiReady && WBA.ai) {
        try { generated = (await WBA.ai.request({ profile: p, flat, mode: tone, info, docs: state.docs })) || ""; }
        catch (e) { log.debug("KI-Anfrage fehlgeschlagen, nutze Generator:", e); generated = ""; }
        // Blacklist gilt auch für KI-Texte: Floskel drin → Vorlage nutzen.
        if (generated && letter.containsBlacklisted(generated, p.about)) {
          log.debug("KI-Text enthielt Floskel, nutze Generator");
          generated = "";
        }
      }
      if (!generated) generated = await letter.generate(p, flat, tone, info, { docs: state.docs });
    }

    if (urlChanged()) return; // während der KI-Anfrage weiternavigiert → Text gehört zur alten Anzeige

    // Formular aufdecken + befüllen (MutationObserver wartet auf dynamische Seiten)
    let box = null, filled = false, hadText = false;
    if (p.name) {
      dom.revealContactForm(portal, document);
      box = await waitFor(() => dom.findMessageBox(portal, document), CFG.FORM_TIMEOUT_MS || 5000);
      if (box) {
        // NIE fremden Text überschreiben (setDraftIntoForm): nur der EXPLIZITE
        // „Einfügen"-Klick darf ersetzen. Profilfelder füllen ist unkritisch
        // (überschreibt nie bereits gefüllte Felder).
        filled = setDraftIntoForm(box, generated);
        hadText = !filled;
        dom.fillProfileFields(portal, document, p); highlightSend();
        // Die Ansprechperson erscheint oft erst MIT dem Kontaktformular (z. B.
        // ImmoScout-Modal „Anbieter:in Herr <Vor- und Nachname>") – also nach dem
        // Aufdecken NEU auflösen und eine bessere Erkennung (vollständigerer
        // Name) in die Anrede-Zeile des Entwurfs UND des Formulars übernehmen.
        const better = resolveContact();
        if (salutScore(better) > salutScore(currentSalut)) {
          log.debug("Bessere Anrede-Quelle nach Formular-Öffnung:", better);
          currentSalut = better;
          generated = replaceGreetingLine(generated, WBA.salutation.greeting(currentSalut, tone));
          if (filled) setDraftIntoForm(box, generated);
        }
      }
    }

    if (urlChanged()) return; // Seite gewechselt → alles hier gehört zur alten Anzeige

    // Nur vormerken, wenn ein echtes Kontaktformular gefunden wurde ODER ein Durchlauf läuft
    // (kein Zumüllen des Trackers durch bloßes Durchblättern).
    // Bereits beworbene Anzeigen NIE anfassen: der Upsert würde „beworben"/
    // „antwort"/„besichtigung" auf „vorbereitet" zurückstufen – Statistik,
    // Nachfass-Erinnerung und Queue-Filter wären danach falsch (Doppelbewerbung).
    const listingId = dom.listingId(portal, location.href);
    const alreadyApplied = p.name ? await store.hasApplied(portal.id, listingId) : false;
    let appliedAt = 0;
    if (alreadyApplied) {
      const key = store.trackerKey(portal.id, listingId);
      const entry = (await store.getTracker()).find((e) => store.trackerKey(e.portal, e.listingId) === key);
      appliedAt = (entry && (entry.appliedAt || entry.ts)) || 0;
    }
    let trackerSaveError = null;
    if (p.name && (filled || run) && !alreadyApplied) {
      try {
        await store.upsertTracker({
          portal: portal.id, listingId,
          title: (document.title || "").slice(0, 120), url: location.href.split("#")[0],
          ort: info.ort || "", qm: info.groesse || "", preis: info.preis || "", ton: tone,
          status: "vorbereitet",
        });
      } catch (e) { log.warn("Anzeige konnte nicht vorgemerkt werden:", e); trackerSaveError = e; }
    }

    renderListingOverlay({ info, run, qIndex, queueLen: queue.length, filled, hadText, hasProfile: !!p.name, alreadyApplied, appliedAt });
    if (trackerSaveError) flashMsg(tr("err.save", { err: trackerSaveError.message || String(trackerSaveError) }), true);
  }

  function chipsHtml(info) {
    const c = [];
    if (info.zimmer) c.push(tr("chip.roomsShort", { n: info.zimmer }));
    if (info.groesse) c.push(info.groesse + " m²");
    if (info.preis) c.push(info.preis + (info.preisLabel && info.preisLabel !== "Miete" ? " " + info.preisLabel : ""));
    if (info.ort) c.push(info.ort);
    return c.map((x) => '<span class="chip">' + esc(x) + "</span>").join("");
  }

  // Auswahl-Optionen für die Anrede-Korrektur: nur Varianten anbieten, für die
  // Daten vorliegen (Name/Vorname) – plus immer die neutrale Anrede.
  // „Frau/Herr/Familie" bleiben auch in der englischen Oberfläche deutsch: es ist
  // exakt das Wort, das anschließend im Brief steht.
  function salutOptionsHtml() {
    const c = currentSalut || { category: "neutral" };
    const opts = [];
    if (c.name) {
      opts.push(["frau", "Frau " + c.name]);
      opts.push(["herr", "Herr " + c.name]);
      opts.push(["familie", "Familie " + c.name]);
    }
    if (c.vorname) opts.push(["vorname", tr("ov.salutHallo", { name: c.vorname })]);
    opts.push(["neutral", tr("ov.salutNeutral")]);
    const sel = opts.some(([v]) => v === c.category) ? c.category : "neutral";
    return opts.map(([v, l]) => '<option value="' + v + '"' + (v === sel ? " selected" : "") + ">" + esc(l) + "</option>").join("");
  }

  // Erste Zeile (Anrede) im Text ersetzen – nur wenn sie wie eine Anrede aussieht,
  // damit auch KI-generierte Texte erhalten bleiben.
  function replaceGreetingLine(text, g) {
    const i = text.indexOf("\n");
    const first = (i < 0 ? text : text.slice(0, i)).trim();
    if (/^(sehr geehrte|guten tag|hallo|liebe)/i.test(first)) return g + (i < 0 ? "" : text.slice(i));
    return g + "\n\n" + text;
  }

  function renderListingOverlay(o) {
    mountHost();
    panel.dataset.view = "listing";
    lastRender = () => renderListingOverlay(o);
    const prog = o.run && o.qIndex >= 0 ? tr("ov.progress", { i: o.qIndex + 1, n: o.queueLen }) : tr("ov.single");
    const sb = WBA.salutation.badge(currentSalut);
    let statusKey = "ov.noForm";
    if (!o.hasProfile) statusKey = "ov.noProfile";
    else if (o.filled) statusKey = "ov.filled";
    else if (o.hadText) statusKey = "ov.hadText";
    const statusMsg = '<div class="msg ' + (o.filled ? "ok" : "warn") + '">' + esc(tr(statusKey)) + "</div>";
    // FUN-01: Wiederbesuch einer bereits beworbenen Anzeige deutlich machen,
    // statt still ein frisches Anschreiben anzubieten.
    const appliedMsg = o.alreadyApplied
      ? '<div class="msg warn">' + esc(o.appliedAt
          ? tr("ov.alreadyAppliedOn", { d: new Date(o.appliedAt).toLocaleDateString(i18n.locale()) })
          : tr("ov.alreadyApplied")) + "</div>"
      : "";

    panel.innerHTML = `
      <div class="box">
        ${headHtml({ ver: true, min: true })}
        <div class="bd">
          <p class="prog">${esc(prog)}</p>
          ${appliedMsg}
          <div class="chips">${chipsHtml(o.info)}</div>
          ${o.hasProfile ? '<div class="salut"><span class="lbl ' + (sb.ok ? "ok" : "warn") + '" title="' + esc(tr("ov.salutTitle")) + '">' + ic("mail", 12) + " " + esc(sb.text) + '</span><select data-el="salutSel" title="' + esc(tr("ov.salutCorrect")) + '">' + salutOptionsHtml() + "</select></div>" : ""}
          ${o.hasProfile ? '<textarea data-el="ta">' + esc(generated) + "</textarea>" : ""}
          ${statusMsg}
          ${o.hasProfile
            ? '<div class="tools"><button class="b sm" data-act="insert">' + ic("clipboard", 12) + " " + esc(tr("ov.insert")) + '</button><button class="b sm" data-act="reroll">' + ic("refresh", 12) + " " + esc(tr("ov.new")) + '</button><button class="b sm" data-act="copy">' + ic("copy", 12) + " " + esc(tr("ov.copy")) + "</button></div>"
            : '<div class="row"><button class="b primary" data-act="profile">' + esc(tr("ov.fillProfile")) + "</button></div>"}
          ${o.hasProfile ? '<div class="row"><button class="b primary" data-act="send">' + ic("send") + " " + tr("ov.send") + "</button></div>" : ""}
          ${o.run
            ? '<div class="row"><button class="b go" data-act="next">' + ic("check") + " " + esc(tr("ov.nextSent")) + '</button><button class="b sm" data-act="skip" style="flex:0 1 auto">' + ic("skipForward", 12) + " " + esc(tr("ov.skip")) + '</button></div><button class="link" data-act="stop">' + esc(tr("ov.stop")) + "</button>"
            : (o.hasProfile ? '<div class="row"><button class="b go" data-act="markSent">' + ic("check") + " " + esc(tr("ov.markSent")) + "</button></div>" : '')}
          <p class="foot">${esc(tr("ov.foot"))}</p>
        </div>
      </div>`;

    const ta = () => panel.querySelector('[data-el="ta"]');
    const on = (act, fn) => { const el = panel.querySelector(`[data-act="${act}"]`); if (el) el.onclick = fn; };

    on("close", removeHost);
    on("min", () => { const bd = panel.querySelector(".bd"); bd.style.display = bd.style.display === "none" ? "" : "none"; });
    // Anrede-Korrektur mit einem Klick: erste Zeile im Entwurf UND im echten
    // Formular austauschen (KI-/Vorlagentext bleibt ansonsten unverändert).
    const salutSel = panel.querySelector('[data-el="salutSel"]');
    if (salutSel) salutSel.onchange = () => {
      currentSalut = Object.assign({}, currentSalut || {}, { category: salutSel.value });
      const tone = (o.run && o.run.tone) || state.filters.ton || "standard";
      const g = WBA.salutation.greeting(currentSalut, tone);
      const t = ta();
      if (t) { t.value = replaceGreetingLine(t.value, g); generated = t.value; }
      setDraftIntoForm(dom.findMessageBox(portal, document), generated);
      flashMsg(tr("ov.salutChanged", { g }));
    };
    on("profile", () => openDashboard("profil"));
    on("insert", () => {
      const box = dom.findMessageBox(portal, document) || (dom.revealContactForm(portal, document), dom.findMessageBox(portal, document));
      // force: der explizite Klick ist die bewusste Nutzer-Entscheidung zu ersetzen.
      if (box && ta()) { setDraftIntoForm(box, ta().value, true); dom.fillProfileFields(portal, document, state.profile); highlightSend(); flashMsg(tr("ov.inserted")); }
      else flashMsg(tr("ov.noFormFound"), true);
    });
    on("reroll", async () => {
      const btn = panel.querySelector('[data-act="reroll"]');
      if (btn && btn.disabled) return; // Doppelklick = doppelter (ggf. kostenpflichtiger) KI-Call
      if (btn) btn.disabled = true;
      try {
        const cf = currentFlat();
        const tone = (state.run && state.run.tone) || state.filters.ton || "standard";
        // Gleiche Logik wie bei der Erst-Generierung und im Dashboard (FUN-12):
        // KI bevorzugt, Vorlage als Rückfall – wer für die KI zahlt, bekommt beim
        // „Neu"-Klick nicht mehr stillschweigend den Vorlagentext. Blacklist gilt
        // auch für KI-Texte.
        let text = "";
        if (state.aiReady && WBA.ai) {
          try { text = (await WBA.ai.request({ profile: state.profile, flat: cf, mode: tone, info: cf.info, docs: state.docs })) || ""; }
          catch (e) { log.debug("KI-Anfrage fehlgeschlagen, nutze Generator:", e); text = ""; }
          if (text && letter.containsBlacklisted(text, state.profile.about)) text = "";
        }
        // generate() prüft gegen die Fingerprints der letzten Texte (inkl. des gerade
        // angezeigten) → der Vorlagen-Rückfall liefert garantiert eine andere Variante.
        if (!text) text = await letter.generate(state.profile, cf, tone, cf.info, { docs: state.docs });
        generated = text;
        if (ta()) ta().value = generated;
        // auch ins echte Formular übernehmen – aber nur, wenn dort UNSER Text steht
        setDraftIntoForm(dom.findMessageBox(portal, document), generated);
      } finally { if (btn) btn.disabled = false; }
    });
    on("copy", async () => { try { await navigator.clipboard.writeText(ta() ? ta().value : generated); flashMsg(tr("ov.copied")); } catch (e) { flashMsg(tr("ov.copyFailed"), true); } });
    on("send", scrollToSend);
    on("markSent", async () => {
      try {
        await store.upsertTracker({
          portal: portal.id, listingId: dom.listingId(portal, location.href),
          title: (document.title || "").slice(0, 120), url: location.href.split("#")[0],
          ort: o.info.ort || "", qm: o.info.groesse || "", preis: o.info.preis || "",
          ton: (state.run && state.run.tone) || state.filters.ton || "standard", status: "beworben",
        });
      } catch (e) { flashMsg(tr("err.save", { err: (e && e.message) || String(e) }), true); return; } // Knopf nicht umschalten
      flashMsg(tr("ov.markedMsg"));
      const b = panel.querySelector('[data-act="markSent"]'); if (b) { b.textContent = tr("ov.marked"); b.style.opacity = ".7"; }
    });
    on("skip", () => advance("übersprungen"));
    on("next", () => advance("beworben"));
    on("stop", async () => {
      if (state.run) {
        state.run.active = false;
        try { await store.setRun(state.run); }
        catch (e) { state.run.active = true; flashMsg(tr("err.save", { err: (e && e.message) || String(e) }), true); return; } // Run läuft real weiter → Overlay offen lassen
      }
      removeHost();
    });
  }

  function currentFlat() {
    const text = parse.pageExtractor(portal.contentSel); const info = parse.extractFlatInfo(text);
    if (!currentSalut) currentSalut = resolveContact(); // Nutzer-Korrektur nicht überschreiben
    return { desc: parse.summaryFromInfo(info), salutation: currentSalut, info };
  }
  function flashMsg(msg, warn) {
    const box = panel && panel.querySelector(".msg");
    if (box) { box.hidden = false; box.className = "msg " + (warn ? "warn" : "ok"); box.textContent = msg; }
  }

  // Aktuelle Anzeige im Tracker markieren und zur nächsten der Queue springen.
  async function advance(status) {
    const listingId = dom.listingId(portal, location.href);
    // Titel/URL mitgeben, damit auch ein hier NEU entstehender Eintrag (Edge-Case:
    // vorheriger Upsert schlug fehl) nicht leer in der Bewerbungsliste steht.
    // Schlägt das Speichern fehl, NICHT weiternavigieren: sonst ginge genau die
    // „beworben"-Markierung verloren, die Doppelbewerbungen verhindert (FUN-03).
    const saveFailed = (e) => flashMsg(tr("err.save", { err: (e && e.message) || String(e) }), true);
    try {
      await store.upsertTracker({
        portal: portal.id, listingId, status,
        title: (document.title || "").slice(0, 120), url: location.href.split("#")[0],
      });
    } catch (e) { saveFailed(e); return; }
    const run = state.run;
    if (!run || !run.active) { removeHost(); return; }
    const queue = run.queue || [];
    let i = queue.findIndex((e) => (e.url || "").split("#")[0] === location.href.split("#")[0]);
    if (i < 0) i = run.index || 0;
    const next = queue[i + 1];
    if (next) {
      run.index = i + 1;
      try { await store.setRun(run); } catch (e) { saveFailed(e); return; }
      location.href = next.url;
    } else {
      run.active = false;
      try { await store.setRun(run); } catch (e) { run.active = true; saveFailed(e); return; } // Run gilt real als aktiv
      alertDone();
    }
  }
  function alertDone() {
    mountHost();
    panel.dataset.view = "done";
    lastRender = alertDone;
    panel.innerHTML = `<div class="box">${headHtml()}
      <div class="bd"><div class="msg ok" style="margin-top:0">${esc(tr("ov.doneMsg"))}</div>
      <div class="row"><button class="b primary" data-act="dash">${ic("inbox")} ${esc(tr("ov.toApplications"))}</button></div></div></div>`;
    panel.querySelector('[data-act="close"]').onclick = removeHost;
    panel.querySelector('[data-act="dash"]').onclick = () => openDashboard("bewerbungen");
  }

  // Freundlicher Hinweis, wenn die Suche nicht automatisch ausgefüllt werden konnte
  // (Portal-Umbau o. ä.) – damit niemand ratlos vor einer leeren Seite steht.
  function showSearchHint(filters) {
    mountHost();
    const parts = [];
    if (filters) {
      if (filters.ort) parts.push(filters.ort);
      if (filters.qmMin) parts.push(tr("ov.filterFrom", { n: filters.qmMin }));
      if (filters.preisMax) parts.push(tr("ov.filterUpTo", { n: filters.preisMax }));
    }
    panel.dataset.view = "hint";
    lastRender = () => showSearchHint(filters);
    panel.innerHTML = '<div class="box">' + headHtml() +
      '<div class="bd"><div class="msg warn" style="margin-top:0">' + esc(tr("ov.searchHint")) +
      (parts.length ? tr("ov.searchHintFilters", { filters: esc(parts.join(" · ")) }) : '') +
      esc(tr("ov.searchHintEnd")) + '</div></div></div>';
    panel.querySelector('[data-act="close"]').onclick = removeHost;
    // Nur den Hinweis selbst wegräumen – ist inzwischen ein anderes Overlay
    // gemountet (SPA-Navigation zur Anzeige), darf der Timer es nicht entfernen.
    setTimeout(function () { if (host && panel && panel.dataset.view === "hint") removeHost(); }, 12000);
  }

  /* ---------- Start ---------- */
  // Erkennung von Listing/Trefferliste – wartet per MutationObserver, bis die Seite
  // (auch SPA-gerendert) so weit ist, statt fester Timeouts. Lädt den Zustand frisch,
  // weil er sich seit dem letzten Lauf geändert haben kann (Durchlauf gestoppt etc.).
  // Läuft bereits eine Erkennung (waitFor bis 9 s), wird ein weiterer Aufruf
  // (SPA-URL-Wechsel) NICHT verschluckt, sondern nach Abschluss nachgeholt –
  // sonst bliebe die neue Seite ohne Overlay.
  let detecting = false, redetect = false;
  async function runDetection() {
    if (detecting) { redetect = true; return null; }
    detecting = true;
    try {
      state.run = await store.getRun();
      // Verfallene Durchläufe (Tabs einfach geschlossen, nie gestoppt) deaktivieren –
      // sonst zeigt eine Anzeige Tage später noch „Anzeige 3/12" und springt weiter.
      const expiry = CFG.RUN_EXPIRY_MS || 12 * 60 * 60 * 1000;
      if (state.run && state.run.active && state.run.startedAt && Date.now() - state.run.startedAt > expiry) {
        log.debug("Durchlauf abgelaufen (gestartet " + new Date(state.run.startedAt).toLocaleString() + ") → deaktiviert");
        state.run.active = false;
        // Best-Effort-Aufräumen: in-memory ist der Run schon aus; ein Storage-Fehler
        // hier darf die Seiten-Erkennung nicht stoppen.
        try { await store.setRun(state.run); } catch (e) { log.warn("Abgelaufenen Durchlauf nicht deaktivierbar:", e); }
      }
      state.profile = await store.getProfile();
      state.filters = await store.getFilters();
      // Bewusst NUR das Konfiguriert-Flag behalten: der API-Key hat im
      // Content-Script-Kontext (läuft in der Portalseite) nichts verloren.
      state.aiReady = !!(WBA.ai && WBA.ai.isConfigured(await store.getSettings()));
      state.docs = await store.getDocs(); // Unterlagen-Checkliste: nur Vorhandenes erwähnen
      const runActive = state.run && state.run.active && state.run.portal === portal.id;
      const listingGate = !runActive && state.filters && state.filters.autoOverlay === false;

      const kind = await waitFor(() => {
        if (dom.isListing(portal, location.href, document)) return "listing";
        if (dom.isResults(portal, location.href, document)) return "results";
        return null;
      }, 9000);

      if (kind === "listing") {
        if (!listingGate) await handleListing(); // Auto-Overlay abgeschaltet (außerhalb eines Durchlaufs) → still
      } else if (kind === "results") {
        await handleResults();
      }
      return kind;
    } finally {
      detecting = false;
      if (redetect) { redetect = false; runDetection(); }
    }
  }

  // SPA-Navigation (Immowelt/ImmoScout wechseln teils per pushState von der
  // Trefferliste zur Anzeige, ohne die Seite neu zu laden → das Content-Script
  // würde sonst nie wieder aktiv): URL-Wechsel beobachten und neu erkennen.
  function watchUrlChanges() {
    let lastUrl = location.href;
    let scheduled = false;
    const check = () => {
      scheduled = false;
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      removeHost();        // Overlay gehört zur alten Seite
      // Puls-Markierung auch OPTISCH entfernen: Immowelt/ImmoScout behalten DOM-Teile
      // über SPA-Navigationen – sonst pulsiert ein Button der alten Ansicht weiter (FUN-14).
      if (highlighted) highlighted.classList.remove("wba-cp-pulse");
      highlighted = null;  // hervorgehobener Senden-Button ebenso
      currentSalut = null; // Anrede der alten Anzeige verwerfen
      lastInserted = "";   // „unser Text im Formular"-Marker gilt nur je Anzeige
      runDetection();
    };
    const schedule = () => { if (!scheduled) { scheduled = true; setTimeout(check, CFG.URL_WATCH_DEBOUNCE_MS || 300); } };
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("popstate", schedule);
    window.addEventListener("hashchange", schedule);
  }

  async function init() {
    await i18n.init(); // Oberflächensprache vor dem ersten Overlay-Aufbau
    state.filters = await store.getFilters();
    let pending = await store.getPending();
    let triedSearch = false;

    // Verfallene Suchaufträge verwerfen (FUN-04): ohne Frist würde ein Wochen
    // alter Auftrag beim nächsten beiläufigen Portal-Besuch ungefragt die
    // Suchmaske füllen und abschicken. Aufträge ohne Zeitstempel (Altbestand)
    // gelten als abgelaufen.
    const pendingExpiry = CFG.PENDING_EXPIRY_MS || 10 * 60 * 1000;
    if (pending && (!pending.ts || Date.now() - pending.ts > pendingExpiry)) {
      log.debug("Suchauftrag verfallen (ts:", pending.ts, ") → verworfen");
      try { await store.setPending(null); } catch (e) { log.warn("Verfallener Suchauftrag nicht löschbar:", e); }
      pending = null;
    }

    // Angeforderte Suche? Filter in die echte Portal-Suchmaske eintragen und absenden.
    // (Nur für Portale, deren buildSearchUrl NICHT schon zuverlässig filtert – sonst
    //  ginge z. B. der Preisfilter aus der URL verloren.)
    if (pending && pending.portals && pending.portals.indexOf(portal.id) >= 0) {
      const rest = pending.portals.filter((id) => id !== portal.id);
      // Verbrauch best-effort persistieren: schlägt es fehl, feuert der Auftrag
      // schlimmstenfalls innerhalb der 10-min-Frist noch einmal (FUN-04 begrenzt das).
      try { await store.setPending(rest.length ? { portals: rest, filters: pending.filters, ts: pending.ts } : null); }
      catch (e) { log.warn("Suchauftrag-Verbrauch nicht speicherbar:", e); }
      if (portal.driveSearch !== false && !dom.isListing(portal, location.href, document)) {
        triedSearch = true;
        try {
          // auf ein gerendertes Eingabefeld warten statt pauschal zu schlafen
          await waitFor(() => document.querySelector("input"), CFG.SEARCH_FORM_TIMEOUT_MS || 4000);
          const submitted = await dom.driveSearchForm(portal, document, pending.filters || state.filters);
          if (submitted) { watchUrlChanges(); return; } // Seite navigiert → Erkennung greift danach
        } catch (e) { log.debug("Suchmaske nicht befüllbar, normaler Ablauf:", e); }
      }
    }

    const kind = await runDetection();
    // Nichts erkannt, obwohl eine Suche angefordert war → freundlich hinweisen.
    if (!kind && triedSearch) showSearchHint(pending && pending.filters);
    watchUrlChanges();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
