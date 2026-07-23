/* WBA.salutation – FAIL-SAFE Anrede-System.
   Grundprinzip: Eine FALSCHE Anrede ist schlimmer als eine NEUTRALE. Es wird NIE geraten:
   - KEIN Geschlecht aus Vornamen ableiten (kein Namens-Mapping, keine Heuristik).
   - KEINE akademischen Titel erfinden – „Dr." u. Ä. nur, wenn sie im Text stehen.
   - Nachnamen exakt übernehmen (Bindestriche, Umlaute), HTML-Entities dekodieren,
     Whitespace normalisieren.

   classify(raw, opts) → genau EINE Kategorie:
     "frau"     Person mit explizitem „Frau"            → „Sehr geehrte Frau {Nachname},"
     "herr"     Person mit explizitem „Herr/Herrn"      → „Sehr geehrter Herr {Nachname},"
     "familie"  explizit „Familie {Name}"               → „Sehr geehrte Familie {Name},"
     "firma"    Firma/Hausverwaltung/Makler ohne Person → „Sehr geehrte Damen und Herren,"
     "vorname"  NUR wenn opts.expectFirstName (z. B. WG-Gesucht-Composer, wo sicher
                ein Vorname steht)                      → „Hallo {Vorname},"
     "neutral"  ALLES Unsichere (kein Titel, nur Nachname, voller Name ohne Frau/Herr,
                Sonderzeichen, leer)                    → „Guten Tag," bzw.
                „Sehr geehrte Damen und Herren," je nach Tonlage.

   Läuft in Fenster- (window) wie Worker-Kontext (self). Reine Logik, kein DOM. */
(function (root) {
  "use strict";
  const WBA = (root.WBA = root.WBA || {});

  /* ---------- Eingabe säubern: Entities dekodieren, Emojis raus, trimmen ---------- */
  const ENT = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
    eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ntilde: "ñ",
  };
  function decode(s) {
    return String(s == null ? "" : s)
      .replace(/&#x([0-9a-f]+);/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return " "; } })
      .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return " "; } })
      .replace(/&([A-Za-z]+);/g, (m, n) => (Object.prototype.hasOwnProperty.call(ENT, n) ? ENT[n] : m))
      // Emojis/Piktogramme (kommen in WG-Gesucht-Nutzernamen vor) entfernen
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, " ")
      .replace(/\s+/g, " ").trim();
  }

  /* ---------- Firmen-Erkennung (Rechtsformen + Branchenwörter) ---------- */
  // Hinweis: „fa\.(\s|$)" separat, weil \b nach einem Punkt nicht greift („Fa. Berger").
  const COMPANY = /\bfa\.(\s|$)|\b(gmbh|mbh|ug|ag|kg|gbr|ohg|e\.?\s?k\.?|inc|ltd|llc|firma|immobilien|immobilienservice|hausverwaltung|verwaltung|verwaltungs|makler|maklerb(ü|ue)ro|gruppe|team|gesellschaft|vermietung|wohnbau|wohnungsbau|wohnungsbaugesellschaft|wohnungsgesellschaft|genossenschaft|consulting|service|management|estate|property|kanzlei|boardinghouse|apartments?|apartements?|hotel|pension|hostel|residenz|residence|ferienwohnung(en)?|monteurzimmer|unterk(ü|ue)nfte|living|homes)\b/i;

  /* ---------- Namens-Parsing hinter „Frau/Herr/Familie" ---------- */
  // Titel werden NUR übernommen, wenn sie dastehen (nichts erfinden).
  const TITLES = new Set(["dr", "prof", "med", "dent", "vet", "rer", "nat", "jur", "phil", "habil", "mag", "dipl", "ing", "kfm", "h.c"]);
  const PARTICLE = /^(von|van|de|zu|der|den|zum|zur|ter|da|di|la|le|del|dos)$/i;
  // Wörter, die sicher NICHT mehr zum Namen gehören (Kontakt-/Fließtext-Rauschen).
  const STOPWORD = /^(telefon|tel|mobil|handy|fax|mail|e-?mail|kontakt|erreichbar|anrufen|nachricht|schreiben|und|oder|bzw|bietet|vermietet|verwaltet|freut|sucht|steht|ist|hat|unter|ansprechpartner(in)?)$/i;

  function parseNameTokens(rest) {
    const titles = [], names = [];
    for (const rawTok of String(rest).split(" ")) {
      const hadPunct = /[,;:!?]$/.test(rawTok);           // Satzzeichen = Namensende
      const tok = rawTok.replace(/[,;:!?]+$/, "");
      if (!tok) { if (names.length) break; else continue; }
      if (/\d/.test(tok)) break;                           // Ziffern → kein Namensteil
      const bare = tok.replace(/\.+$/, "").toLowerCase();
      if (TITLES.has(bare) || /^dipl\.?-/i.test(tok)) {    // Titel nur VOR dem Namen sammeln
        if (!names.length) titles.push(/\.$/.test(tok) ? tok : tok + ".");
        continue;
      }
      if (PARTICLE.test(bare)) { names.push(bare); continue; }
      // Firmenwörter beenden den Namen („Herr Jens Trautmann BmB Bauen … mbH").
      if (STOPWORD.test(bare) || COMPANY.test(bare)) break;
      const cand = tok.charAt(0).toUpperCase() + tok.slice(1); // „müller" → „Müller"
      if (!/^[A-ZÄÖÜ][A-Za-zÄÖÜäöüßéèàáâçñ'’.-]*$/.test(cand)) break;
      // Binnenmajuskel („BmB", GmbH-Reste) ist kein natürlicher Nachname –
      // Großbuchstaben nach Bindestrich/Apostroph (Müller-Lüdenscheidt, O'Brien) bleiben erlaubt.
      if (/[A-ZÄÖÜ]/.test(cand.slice(1).replace(/[-'’][A-ZÄÖÜ]/g, ""))) break;
      names.push(cand);
      if (hadPunct || names.length >= 4) break;
    }
    while (names.length && PARTICLE.test(names[names.length - 1])) names.pop();
    if (!names.length || names.every((n) => PARTICLE.test(n))) return { titles, name: null, vorname: null, count: 0 };
    // Nachname = letztes Namenswort inkl. direkt davorstehender Partikel („von Berg").
    let start = names.length - 1;
    while (start - 1 >= 0 && PARTICLE.test(names[start - 1])) start--;
    // Vorname mitliefern (für „Hallo <Vorname>"-Korrektur und Quellen-Merge).
    const vorname = start > 0 && !PARTICLE.test(names[0]) && !/\.$/.test(names[0]) ? names[0] : null;
    return { titles, name: names.slice(start).join(" "), vorname, count: names.length };
  }

  /* ---------- Klassifikation ---------- */
  function res(category, extra) { return Object.assign({ category }, extra || {}); }

  /**
   * Klassifiziert eine Ansprechpersonen-Angabe fail-safe in genau eine Kategorie.
   * Es wird NIE Geschlecht aus einem Vornamen geraten; Unsicheres bleibt neutral.
   * @param {string|null|undefined} raw - Roh-String (Anbieterfeld, Kontaktbox, Fließtext-Fund).
   * @param {{expectFirstName?: boolean}} [opts] - true nur, wenn der Kontext garantiert
   *   einen Vornamen liefert (WG-Gesucht-Composer) → Kategorie "vorname" möglich.
   * @returns {{category: "frau"|"herr"|"familie"|"firma"|"vorname"|"neutral",
   *   name?: string, vorname?: string, titles?: string[], reason?: string}}
   */
  function classify(raw, opts) {
    opts = opts || {};
    const s = decode(raw);
    if (!s) return res("neutral", { reason: "leer" });

    // a/b) Explizite Anrede „Frau/Herr(n)" hat Vorrang vor der Firmen-Erkennung
    // („Müller Immobilien GmbH – Ansprechpartnerin Frau Yilmaz" → Frau Yilmaz).
    const m = s.match(/\b(frau|fr\.|herrn|herr|hr\.)\s+(.+)$/i);
    if (m) {
      const g = /^f/i.test(m[1]) ? "frau" : "herr";
      const p = parseNameTokens(m[2]);
      if (p.name) return res(g, { name: p.name, vorname: p.vorname, titles: p.titles, count: p.count });
      return res("neutral", { reason: "anrede-ohne-name" });
    }

    // Explizit „Familie X" – keine Geschlechts-Annahme nötig, Anrede ist eindeutig.
    const fm = s.match(/\b(familie|fam\.)\s+(.+)$/i);
    if (fm) {
      const p = parseNameTokens(fm[2]);
      if (p.name) return res("familie", { name: p.name });
      return res("neutral", { reason: "unsicher" });
    }

    // „Eheleute X" – korrekte Anrede wäre spekulativ → bewusst neutral.
    if (/\beheleute\b/i.test(s)) return res("neutral", { reason: "eheleute" });

    // c) Firma / Hausverwaltung / Makler ohne Personennamen.
    if (COMPANY.test(s)) return res("firma", {});

    // d) Nur Vorname/Nickname – AUSSCHLIESSLICH wenn der Kontext garantiert,
    // dass ein Vorname vorliegt (WG-Gesucht-Composer). Sonst wäre ein einzelnes
    // Wort genauso gut ein Nachname → das wäre Raten.
    if (opts.expectFirstName) {
      const words = s.replace(/[.,;:…]+/g, " ").split(/\s+/).filter(Boolean);
      let first = (words[0] || "").replace(/\d+$/g, ""); // „Tom88" → „Tom"
      first = first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
      if (/^[A-ZÄÖÜ][a-zäöüßéèàá]+(-[A-ZÄÖÜ][a-zäöüß]+)?$/.test(first)) {
        return res("vorname", { vorname: first });
      }
    }

    // e) Alles andere ist unsicher → neutral. Insbesondere: voller Name ohne
    // Frau/Herr, nur Nachname, englische Namen, Sonderzeichen-Reste.
    // Wahrscheinliche PRIVATPERSON ohne explizite Anrede (z. B. Kleinanzeigen
    // „Klara Kiwitt"): Die Anrede bleibt NEUTRAL – es wird nie geraten –, aber
    // die Namensbestandteile werden mitgeliefert, damit das UI die 1-Klick-
    // Korrektur (Frau X / Herr X / Hallo <Vorname>) anbieten kann und
    // pickBest() Quellen zusammenführen kann („Herr Jens" + „Jens Trautmann").
    const wordsArr = s.split(" ");
    if (wordsArr.length <= 3 && wordsArr.every((w) => /^[A-ZÄÖÜ]/.test(w) || PARTICLE.test(w.toLowerCase()))) {
      const pn = parseNameTokens(s);
      if (pn.name && pn.count === wordsArr.length) {
        return res("neutral", { reason: "unsicher", name: pn.name, vorname: pn.vorname, count: pn.count, personLike: true });
      }
    }
    return res("neutral", { reason: "unsicher" });
  }

  /**
   * Wählt aus mehreren Kandidaten-Klassifikationen (verschiedene Quellen einer
   * Seite: Kontaktname, Firmenfeld, Fließtext) die verlässlichste Anrede:
   *  1. Explizite Frau/Herr-Kandidaten – der VOLLSTÄNDIGSTE Name gewinnt
   *     („Herr Jens Trautmann" schlägt „Herr Jens").
   *  2. Merge: Besteht der beste förmliche Kandidat nur aus EINEM Wort und eine
   *     andere Quelle kennt „<dieses Wort> <Nachname>", ist das Wort der
   *     VORNAME → Anrede mit dem echten Nachnamen („Herr Jens" + „Jens
   *     Trautmann" → „Sehr geehrter Herr Trautmann,"). Kein Raten: das
   *     Geschlecht stammt weiter aus dem expliziten „Frau/Herr".
   *  3. Familie → Person ohne Anrede (neutral, mit Korrektur-Daten) → Firma → neutral.
   * @param {Array<ReturnType<typeof classify>>} cands
   * @returns {ReturnType<typeof classify>}
   */
  function pickBest(cands) {
    cands = (cands || []).filter(Boolean);
    const formal = cands.filter((c) => (c.category === "frau" || c.category === "herr") && c.name);
    formal.sort((a, b) => (b.count || 1) - (a.count || 1));
    let best = formal[0] || null;
    if (best && (best.count || 1) < 2) {
      const full = cands.find((c) => c !== best && c.vorname && c.name && c.vorname === best.name && (c.count || 0) >= 2);
      if (full) best = res(best.category, { name: full.name, vorname: full.vorname, titles: best.titles, count: full.count });
    }
    if (best) return best;
    const fam = cands.find((c) => c.category === "familie" && c.name);
    if (fam) return fam;
    const person = cands.find((c) => c.personLike && c.name);
    if (person) return person;
    const firma = cands.find((c) => c.category === "firma");
    if (firma) return firma;
    return res("neutral", { reason: "unsicher" });
  }

  /* ---------- Anrede-Text ---------- */
  /**
   * Anrede-Zeile zu einer Klassifikation, tonlagen-abhängig für den Neutral-Fall.
   * @param {ReturnType<typeof classify>} cls
   * @param {string} [mode] - Tonlage; formal/selbstbewusst → „Sehr geehrte Damen
   *   und Herren,", sonst „Guten Tag," im Neutral-Fall.
   * @returns {string} z. B. "Sehr geehrte Frau Dr. Weber,"
   */
  function greeting(cls, mode) {
    const c = cls && cls.category;
    const t = cls && cls.titles && cls.titles.length ? cls.titles.join(" ") + " " : "";
    if (c === "frau" && cls.name) return "Sehr geehrte Frau " + t + cls.name + ",";
    if (c === "herr" && cls.name) return "Sehr geehrter Herr " + t + cls.name + ",";
    if (c === "familie" && cls.name) return "Sehr geehrte Familie " + cls.name + ",";
    if (c === "vorname" && cls.vorname) return "Hallo " + cls.vorname + ",";
    if (c === "firma") return "Sehr geehrte Damen und Herren,";
    // neutral: je nach Tonlage („Guten Tag," wirkt in lockeren Tönen natürlicher).
    return (mode === "formal" || mode === "selbstbewusst")
      ? "Sehr geehrte Damen und Herren,"
      : "Guten Tag,";
  }

  /* ---------- UI-Badge (Kategorie sichtbar machen, Nutzer kann korrigieren) ---------- */
  /**
   * UI-Badge zur Klassifikation (Overlay/Dashboard).
   * Der BESCHREIBENDE Teil folgt der Oberflächensprache (lib/i18n.js), die
   * Anrede-Wörter „Frau/Herr/Familie" bleiben Deutsch – sie stehen genau so
   * im erzeugten Brief.
   * @param {ReturnType<typeof classify>} cls
   * @returns {{ok: boolean, text: string}} ok=false → „unsicher"-Optik (orange).
   */
  function badge(cls) {
    // Fallback, falls i18n in einem Kontext (Test-Harness) nicht geladen ist.
    const tr = (WBA.i18n && WBA.i18n.t) || ((k, p) => (p && p.name) || k);
    const c = cls && cls.category;
    const t = cls && cls.titles && cls.titles.length ? cls.titles.join(" ") + " " : "";
    if (c === "frau") return { ok: true, text: tr("salut.frau", { name: t + cls.name }) };
    if (c === "herr") return { ok: true, text: tr("salut.herr", { name: t + cls.name }) };
    if (c === "familie") return { ok: true, text: tr("salut.familie", { name: cls.name }) };
    if (c === "vorname") return { ok: true, text: tr("salut.vorname", { name: cls.vorname }) };
    if (c === "firma") return { ok: true, text: tr("salut.firma") };
    // Neutral, aber mit erkanntem Personennamen: den Nutzer aktiv zur
    // 1-Klick-Korrektur einladen (Dropdown daneben bietet Frau/Herr/… an).
    if (cls && cls.name) {
      const full = (cls.vorname ? cls.vorname + " " : "") + cls.name;
      return { ok: false, text: tr("salut.unsure", { name: full }) };
    }
    return { ok: false, text: tr("salut.neutral") };
  }

  WBA.salutation = { decode, classify, greeting, badge, pickBest };
})(typeof self !== "undefined" ? self : this);
