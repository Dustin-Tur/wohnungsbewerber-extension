/* WBA.ai – optionale KI-Textgenerierung (Claude).
   - buildPrompt(): baut aus Profil + Wohnung + Ton einen Prompt.
   - request(): Client-Helfer (Popup/Dashboard/Content) → schickt die Anfrage an den
     Service-Worker (background.js), der den eigentlichen API-Call macht (umgeht die CSP
     der Portalseiten und hält den Key aus dem Seitenkontext heraus).
   - callProvider(): läuft im Service-Worker und ruft Anthropic auf.
   Ist keine KI konfiguriert oder schlägt sie fehl → Aufrufer nutzen die Vorlage (WBA.letter). */
(function (root) {
  "use strict";
  const WBA = (root.WBA = root.WBA || {});

  /**
   * Ist eine KI-Anbindung nutzbar konfiguriert?
   * @param {{mode?: string, apiKey?: string}} s - KI-Einstellungen (WBA.store.getSettings()).
   * @returns {boolean}
   */
  function isConfigured(s) {
    if (!s) return false;
    if (s.mode === "anthropic") return !!s.apiKey;
    return false;
  }

  const TONE = {
    standard: "freundlich, natürlich und sympathisch",
    formal: "formell, höflich und seriös",
    kurz: "kurz, knackig und freundlich",
    herzlich: "warm, herzlich und persönlich",
    selbstbewusst: "selbstbewusst, aber sympathisch und nicht überheblich",
  };
  const EMP = {
    unbefristet: "unbefristet angestellt", befristet: "befristet angestellt",
    selbststaendig: "selbstständig", azubi: "in Ausbildung/Studium",
    rente: "in Rente", buergergeld: "arbeitslos, Miete läuft über das Jobcenter (Kosten der Unterkunft)",
  };

  /**
   * Baut den KI-Prompt – mit denselben Ehrlichkeits- und Anti-Floskel-Regeln
   * wie der eingebaute Generator (WBA.letter).
   * @param {Object} p - Nutzerprofil.
   * @param {{salutation?: Object, desc?: string}} flat - Wohnungs-Kontext inkl. Anrede-Klassifikation.
   * @param {string} mode - Tonlage (standard|formal|kurz|herzlich|selbstbewusst).
   * @param {Object} info - Extrahierte Anzeigen-Daten (WBA.parse.extractFlatInfo).
   * @param {Object} [docs] - Unterlagen-Checkliste; nur Vorhandenes darf erwähnt werden.
   * @returns {string} Prompt-Text.
   */
  function buildPrompt(p, flat, mode, info, docs) {
    p = p || {}; flat = flat || {}; info = info || {}; docs = docs || {};
    const tone = TONE[mode] || TONE.standard;
    const L = [];
    L.push("Du schreibst für eine echte Person eine Bewerbung um eine Mietwohnung, auf Deutsch.");
    L.push("Klinge wie ein echter Mensch – warm, konkret und glaubwürdig. KEINE Vorlagen-Floskeln, keine aneinandergereihten Standardsätze, keine Aufzählungen. Erfinde NICHTS dazu und übertreibe nichts; nutze nur die Angaben unten. Aktive Verben, keine Schachtelsätze über 25 Wörter, höchstens EIN Ausrufezeichen.");
    L.push("Diese Formulierungen sind VERBOTEN (auch sinngemäß): „hiermit bewerbe ich mich“, „hat mein Interesse geweckt“, „würde mich freuen, von Ihnen zu hören“, „entspricht genau meinen Vorstellungen“, „passt genau zu meiner Suche“.");
    L.push("Ton: " + tone + ". Länge: " + (mode === "kurz" ? "sehr kurz, 60–90 Wörter" : mode === "formal" ? "120–180 Wörter" : "100–150 Wörter") + ".");

    // Anrede-Logik identisch zu WBA.letter.greeting(): fail-safe Klassifikation
    // (WBA.salutation) hat Vorrang; danach der Handeingabe-Pfad des Dashboards.
    const anrede = (flat.salutation && WBA.salutation)
      ? WBA.salutation.greeting(flat.salutation, mode)
      : (flat.contactHallo || "").trim()
      ? "Hallo " + flat.contactHallo.trim() + ","
      : (flat.contactAnrede && flat.contactName)
      ? "Sehr geehrte" + (flat.contactAnrede === "Frau" ? " Frau " : "r Herr ") + flat.contactName + ","
      : "Sehr geehrte Damen und Herren,";
    L.push("Beginne exakt mit dieser Anrede: „" + anrede + "\"");
    L.push("Erfinde KEINE Anrede, keinen Namen und keinen akademischen Titel dazu – nutze exakt die vorgegebene Zeile.");

    const b = [];
    if (p.name) b.push("Name: " + p.name);
    if (p.age) b.push("Alter: " + p.age);
    if (p.job) b.push("Beruf: " + p.job);
    if (p.employment) b.push("Beschäftigung: " + (EMP[p.employment] || p.employment));
    if (p.income) b.push("Netto-Einkommen/Monat: " + p.income);
    if (p.persons) b.push("Einziehende Personen: " + p.persons);
    if (p.pets) b.push("Haustiere: " + p.pets);
    if (p.about) b.push("Über mich: " + p.about);
    L.push("Bewerber:in:\n" + (b.join("\n") || "(wenig Angaben – dann allgemein bleiben)"));

    const w = [];
    if (info.zimmer) w.push(info.zimmer + " Zimmer");
    if (info.groesse) w.push(info.groesse + " m²");
    if (info.ort) w.push("in " + info.ort);
    if (info.preis) w.push(info.preis + " " + (info.preisLabel || "Miete"));
    if (info.frei) w.push("frei ab " + info.frei);
    if (info.features && info.features.length) w.push("Ausstattung: " + info.features.join(", "));
    if (w.length) L.push("Wohnung:\n" + w.join("\n"));
    else if (flat.desc) L.push("Wohnung:\n" + flat.desc);

    // Unterlagen nur erwähnen, wenn sie laut Checkliste wirklich vorbereitet sind.
    // noSchufa: SCHUFA ist tabu – aus der Liste filtern UND explizit verbieten
    // (Insurance gegen ein Modell, das von sich aus „Bonität" erwähnen möchte).
    const DOCS_DE = { schufa: "SCHUFA-Auskunft", selbstauskunft: "ausgefüllte Selbstauskunft", gehalt: "Gehaltsnachweise", bwa: "Einkommensnachweise", rente: "Rentenbescheid", jobcenter: "Jobcenter-Bescheid", kdu: "Bestätigung der Mietkostenübernahme", mietschulden: "Mietschuldenfreiheitsbescheinigung", buergschaft: "Bürgschaft", ausbildung: "Ausbildungsnachweis" };
    const vorhandene = Object.keys(DOCS_DE).filter((k) => docs[k] && !(k === "schufa" && docs.noSchufa)).map((k) => DOCS_DE[k]);
    L.push([
      "Inhaltliche Leitplanken (Struktur: wer bin ich → warum diese Wohnung konkret → Zuverlässigkeit → Besichtigungswunsch):",
      "- Nimm echten Bezug zur Wohnung: baue 1–2 der unten gelisteten Details ein (nur diese – NICHTS erfinden).",
      "- Stelle dich kurz und menschlich vor (1–2 Sätze).",
      p.employment === "buergergeld"
        ? "- Betone, dass die Miete zuverlässig über das Jobcenter (Kosten der Unterkunft) getragen wird, auf Wunsch als Direktüberweisung – das ist ein Sicherheits-Plus für Vermieter."
        : (p.income ? "- Mach die Mietsicherheit über das Einkommen deutlich (zuverlässig, pünktlich)." : "- Signalisiere Zuverlässigkeit bei der Miete, ohne Zahlen zu erfinden."),
      vorhandene.length
        ? "- Erwähne, dass diese Unterlagen bereitliegen: " + vorhandene.join(", ") + ". KEINE weiteren Unterlagen behaupten."
        : "- Erwähne KEINE Unterlagen (es sind keine als vorbereitet markiert).",
      docs.noSchufa ? "- Erwähne die SCHUFA unter KEINEN Umständen – mit keinem Wort, auch nicht indirekt (keine Bonität, keine Auskunft)." : null,
      "- Wünsche freundlich und konkret eine Besichtigung.",
    ].filter(Boolean).join("\n"));

    const contact = [p.email, p.phone].filter(Boolean).join(" · ");
    L.push("Schließe mit einer passenden Grußformel und dem Namen" + (contact ? " sowie den Kontaktdaten (" + contact + ")" : "") + ".");
    L.push("Gib NUR den fertigen Bewerbungstext aus – ohne Betreff, ohne Erklärungen, ohne Platzhalter wie [Name].");
    return L.join("\n\n");
  }

  // ---- Client-Seite: Anfrage an den Service-Worker ----
  /**
   * Wie request(), aber mit Fehler-Detail für Diagnose-UIs (z. B. „KI testen"):
   * löst IMMER mit {text} oder {error} auf, wirft nie.
   * @param {Object} payload @returns {Promise<{text?: string, error?: string}>}
   */
  function requestDetailed(payload) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) { resolve({ error: "no_runtime" }); return; }
        chrome.runtime.sendMessage({ type: "aiGenerate", payload }, (resp) => {
          if (chrome.runtime.lastError) { resolve({ error: chrome.runtime.lastError.message || "runtime" }); return; }
          if (!resp) { resolve({ error: "no_response" }); return; }
          if (resp.error) { resolve({ error: String(resp.error) }); return; }
          if (!resp.text) { resolve({ error: "empty" }); return; }
          resolve({ text: resp.text });
        });
      } catch (e) { resolve({ error: String((e && e.message) || e) }); }
    });
  }
  /** Bequem-Variante für den Normalbetrieb: Text oder null (Aufrufer fällt auf die Vorlage zurück). */
  async function request(payload) {
    const r = await requestDetailed(payload);
    return r.text || null;
  }

  /**
   * Fetch mit Timeout: ohne Abbruch würde ein hängender Call den Nutzer unbegrenzt
   * warten lassen („KI schreibt …") und den Service-Worker unnötig wachhalten.
   * @param {string} url
   * @param {RequestInit} opts
   * @param {number} ms - Timeout in Millisekunden.
   * @returns {Promise<Response>}
   */
  async function fetchWithTimeout(url, opts, ms) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
    try {
      return await fetch(url, ctrl ? Object.assign({}, opts, { signal: ctrl.signal }) : opts);
    } finally { if (timer) clearTimeout(timer); }
  }
  const AI_TIMEOUT_MS = (WBA.CONFIG && WBA.CONFIG.AI_TIMEOUT_MS) || 30000;

  // ---- Service-Worker-Seite: eigentlicher Provider-Aufruf ----
  async function callProvider(settings, payload) {
    const prompt = buildPrompt(payload.profile, payload.flat, payload.mode, payload.info, payload.docs);
    // Anthropic direkt (der einzige unterstützte KI-Modus)
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: settings.model || "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    }, AI_TIMEOUT_MS);
    if (!res.ok) throw new Error("Anthropic HTTP " + res.status);
    const data = await res.json();
    const block = data && data.content && data.content.find((b) => b.type === "text");
    return String((block && block.text) || "").trim();
  }

  WBA.ai = { isConfigured, buildPrompt, request, requestDetailed, callProvider };
})(typeof self !== "undefined" ? self : this);
