/* WBA.parse – reine Erkennungs-Funktionen (kein DOM-Zustand, keine Seiteneffekte).
   Wird von Popup, Dashboard, Content-Script und Service-Worker geladen.
   Läuft in Fenster- (window) wie Worker-Kontext (self). */
(function (root) {
  "use strict";
  const WBA = (root.WBA = root.WBA || {});

  // Erkennt Eckdaten aus freiem Anzeigentext – erfindet nichts, liest nur, was dasteht.
  function extractFlatInfo(text) {
    const t = (text || "").replace(/\s+/g, " ");
    const info = {};

    let m;
    // Zimmerzahl: höchstens 2-stellig und an einer Wortgrenze (\b), sonst wird die Jahreszahl
    // aus einem direkt davorstehenden Datum als Zimmerzahl gelesen (echter Bug auf ImmoScout:
    // „…Bezugsfrei ab 01.07.2026 Zimmer 1" ⇒ fälschlich „2026 Zimmer"). Beide Muster werden
    // geprüft (Zahl-vor-„Zimmer" wie „3-Zimmer-Wohnung" UND Label-Wert wie „Zimmer 1"); der
    // erste PLAUSIBLE Treffer (1–20) gewinnt – zusätzliche Absicherung gegen Ausreißer.
    const zMatches = [];
    if ((m = t.match(/\b(\d{1,2}(?:[.,]5)?)\s*-?\s*Zimmer/i))) zMatches.push(m[1]);
    if ((m = t.match(/Zimmer(?:zahl|anzahl)?\s*[:\-]?\s*(\d{1,2}(?:[.,]5)?)/i))) zMatches.push(m[1]);
    for (const z of zMatches) {
      const val = parseFloat(z.replace(",", "."));
      if (val >= 1 && val <= 20) { info.zimmer = z.replace(",", "."); break; }
    }
    if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:m²|m2|qm|Quadratmeter)/i)) ||
        (m = t.match(/Wohnfl[äa]che\s*[:\-]?\s*(?:ca\.?\s*)?(\d+(?:[.,]\d+)?)/i))) info.groesse = m[1].replace(",", ".");

    // Preis: robust. Alle €-Beträge einsammeln, dann Quadratmeterpreise (z. B. "21,33 €/m²")
    // sowie unplausible Beträge und Kosten-„Rauschen" (Kaution, Nebenkosten …) ausschließen.
    // Auswahl: Betrag bei „Kaltmiete", sonst „Warmmiete", sonst größter plausibler Betrag.
    const priceRe = "(\\d{1,3}(?:[.\\s]\\d{3})*(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)\\s*€";
    const euroRe = new RegExp(priceRe, "gi");
    const amounts = [];
    let em;
    while ((em = euroRe.exec(t))) {
      const raw = em[1];
      const val = parseFloat(raw.replace(/[.\s]/g, "").replace(",", "."));
      const end = em.index + em[0].length;
      const perArea = /^\s*(?:\/|pro|je)?\s*(?:m²|m2|qm)/i.test(t.slice(end, end + 8)); // €/m²
      amounts.push({ raw, val, idx: em.index, end, perArea });
    }
    // Kontext je Betrag – an den NACHBAR-BeträGEN abgeschnitten, damit sich
    // Labels nicht gegenseitig einfärben („Kaution 1500 €. Miete: 620 €":
    // das „Kaution" gehört zur 1500, das „Miete:" zur 620). Ein Label NACH dem
    // Betrag („450 € Warmmiete") zählt nur, wenn nicht unmittelbar der nächste
    // Betrag folgt (dann gehört der Zwischentext als Vor-Label zu diesem).
    amounts.forEach((a, i) => {
      const prevEnd = i > 0 ? amounts[i - 1].end : 0;
      const before = t.slice(Math.max(prevEnd, a.idx - 24), a.idx);
      const next = amounts[i + 1];
      const after = (next && next.idx - a.end < 30) ? "" : t.slice(a.end, a.end + 12);
      a.ctx = before + " " + after;
    });
    const ctxOf = (a) => a.ctx;
    // Kosten-„Rauschen": auch Möbelablöse/Abschlag/Übernahme (Live-Beweis: „Gegen
    // einen Abschlag von 300 € müssen folgende Möbel übernommen werden" wurde
    // sonst als Miete gewählt, obwohl die Miete 270 € beträgt).
    const NOISE = /kaution|provision|ab(schlag|stand)|abl[öo]se|[üu]bernahme|m[öo]bel|genossenschaftsanteil|nebenkosten|betriebskosten|heizkosten|hausgeld|renovierung/i;
    const KALT = /kaltmiete|\bkalt\b/i;
    const WARM = /warmmiete|\bwarm\b|gesamtmiete|bruttomiete/i;
    const MIETE = /\b(miete|mietpreis|preis)\b/i;
    const plaus = amounts.filter((a) => !a.perArea && a.val >= 100 && a.val <= 20000);
    const clean = plaus.filter((a) => !NOISE.test(ctxOf(a)));
    const pool = clean.length ? clean : plaus;
    // Auswahl: Kaltmiete > Warmmiete > „Miete/Preis"-Label > ERSTER Betrag im Text.
    // Bewusst NICHT mehr „größter Betrag": im gescopten Text steht das Preisfeld
    // der Anzeige vorne – ein späterer größerer Betrag (Ablöse, Kauf-Zubehör in
    // der Beschreibung) darf die echte Miete nie verdrängen.
    const chosen = pool.find((a) => KALT.test(ctxOf(a)))
      || pool.find((a) => WARM.test(ctxOf(a)))
      || pool.find((a) => MIETE.test(ctxOf(a)))
      || pool[0];
    if (chosen) {
      info.preis = chosen.raw.replace(/\s/g, "") + " €";
      info.preisLabel = KALT.test(ctxOf(chosen)) ? "Kaltmiete" : WARM.test(ctxOf(chosen)) ? "Warmmiete" : "Miete";
    }

    // Ort: PLZ+Stadt, dann "Ort/Lage:"-Label, dann Stadt-Stadtteil-Muster.
    // STOP schließt Nicht-Orts-Wörter aus, u. a. Kontakt-/Messenger-UI-Begriffe (WG-Gesucht-
    // Composer enthält z. B. „WG-Gesucht-Nachrichtensystem", „Bewerbermappe" – sonst würde
    // daraus fälschlich ein Ort wie „Gesucht-Nachrichtensystem" gelesen).
    const STOP = /Zimmer|Wohnung|Altbau|Neubau|Miete|Kaution|Etage|Balkon|Wohnfl|Verf[üu]g|Frei|Sofort|Quadrat|Published|Title|Source|Content|Markdown|Location|Update|Gesucht|Nachricht|Nachrichten|Postfach|Bewerbermappe|Werbeblocker|Absicherung|Anhang|Anlage/i;
    const cleanOrt = (s) => (s || "").replace(/[.,;:]+$/, "").trim();
    // Bundesländer sind keine Städte – nie als Ort verwenden.
    const LAND = /^(Nordrhein-Westfalen|Baden-W[üu]rttemberg|Rheinland-Pfalz|Sachsen-Anhalt|Mecklenburg-Vorpommern|Schleswig-Holstein|Niedersachsen|Bayern|Hessen|Sachsen|Th[üu]ringen|Brandenburg|Saarland)$/i;
    if ((m = t.match(/\b\d{5}\s+([A-ZÄÖÜ][A-Za-zäöüß.\-]+)/)) && !LAND.test(cleanOrt(m[1]))) {
      info.ort = cleanOrt(m[1]);
    } else if ((m = t.match(/\b(?:Ort|Lage|Stadtteil|Adresse)\b\s*[:\-]?\s*([A-ZÄÖÜ][A-Za-zäöüß.\-]+(?:\s[A-ZÄÖÜ][A-Za-zäöüß.\-]+)?)/i)) && /^[A-ZÄÖÜ]/.test(m[1]) && !STOP.test(m[1]) && !LAND.test(cleanOrt(m[1]))) {
      info.ort = cleanOrt(m[1]);
    } else {
      const cand = [...t.matchAll(/\b([A-ZÄÖÜ][a-zäöüß]{2,}-[A-ZÄÖÜ][a-zäöüß]{2,})\b/g)]
        .map((x) => x[1]).find((x) => !STOP.test(x) && !LAND.test(x));
      if (cand) info.ort = cleanOrt(cand);
    }
    // Fallback: "in/nach <Stadt>" (z. B. "Wohnung in Köln") – mit Ausschlussliste.
    if (!info.ort) {
      const ORT_STOP = /^(Zimmer|Wohnung|Altbau|Neubau|Miete|Kaution|Etage|Balkon|K[üu]che|Bad|N[äa]he|Ruhe|K[üu]rze|Toplage|Bestlage|Zentrum|Gr[üu]n|Ordnung|Verbindung|Zukunft|Kürze)$/i;
      const m2 = t.match(/\b(?:in|nach)\s+([A-ZÄÖÜ][a-zäöüß]{2,}(?:-[A-ZÄÖÜ][a-zäöüß]+)?)\b/);
      if (m2 && !ORT_STOP.test(m2[1]) && !STOP.test(m2[1])) info.ort = cleanOrt(m2[1]);
    }
    // Letzter Fallback: bekannte deutsche Großstadt irgendwo im Text (eindeutig, wenig Fehlgriffe).
    if (!info.ort) {
      const cm = t.match(/\b(Berlin|Hamburg|M[üu]nchen|K[öo]ln|Frankfurt(?:\sam\sMain)?|Stuttgart|D[üu]sseldorf|Leipzig|Dortmund|Essen|Bremen|Dresden|Hannover|N[üu]rnberg|Duisburg|Bochum|Wuppertal|Bielefeld|Bonn|M[üu]nster|Karlsruhe|Mannheim|Augsburg|Wiesbaden|Gelsenkirchen|Braunschweig|Kiel|Aachen|Halle|Magdeburg|Freiburg|Krefeld|L[üu]beck|Mainz|Erfurt|Rostock|Kassel|Potsdam|Saarbr[üu]cken|Oldenburg|Osnabr[üu]ck|Heidelberg|Darmstadt|Regensburg|Ingolstadt|W[üu]rzburg|Wolfsburg|Ulm|Jena|G[öo]ttingen|Offenbach|Pforzheim|Reutlingen|Koblenz|Bergisch\sGladbach|Recklinghausen)\b/);
      if (cm) info.ort = cm[1];
    }

    // Verfügbar ab: "sofort" oder Datum – Doppelpunkt/Leerzeichen werden toleriert.
    if ((m = t.match(/(?:frei|verf[üu]gbar|bezugsfrei|beziehbar)[^0-9A-Za-zÄÖÜäöü]{0,4}(?:ab[^0-9A-Za-zÄÖÜäöü]{0,4})?(sofort|[0-3]?\d\.[01]?\d\.(?:\d{2,4})?)/i))) {
      info.frei = /sofort/i.test(m[1]) ? "sofort" : m[1];
    }

    // Ausstattung/Merkmale – nur was wirklich im Text steht (für persönlichere Anschreiben).
    const FEATURES = [
      [/balkon/i, "der Balkon"],
      [/dachterrasse/i, "die Dachterrasse"],
      [/terrasse/i, "die Terrasse"],
      [/\bgarten|gartenmitbenutzung|gartenanteil/i, "der Garten"],
      [/einbauk[üu]che|\bebk\b|k[üu]che ausgestattet/i, "die Einbauküche"],
      [/aufzug|fahrstuhl|\blift\b/i, "der Aufzug"],
      [/fu[ßs]bodenheizung/i, "die Fußbodenheizung"],
      [/stellplatz|tiefgarage|\bgarage|parkplatz/i, "der Stellplatz"],
      [/(frisch |neu )?saniert|renoviert|modernisiert|kernsaniert/i, "der modernisierte Zustand"],
      [/altbau/i, "der Altbau-Charme"],
      [/(neubau|erstbezug)/i, "der Neubau-Standard"],
      [/wanne|badewanne/i, "die Badewanne"],
      [/gäste-?wc|gaeste-?wc/i, "das Gäste-WC"],
      [/abstellraum|abstellkammer|keller/i, "der zusätzliche Stauraum"],
    ];
    // Negations-Schutz: „keine Terrasse", „ohne Balkon", „Aufzug: nein" dürfen
    // NICHT als vorhandenes Merkmal gewertet werden (ein falsches Detail im
    // Anschreiben ist schlimmer als ein fehlendes). Ein Merkmal zählt nur,
    // wenn mindestens EIN Vorkommen ohne Verneinung im Text steht.
    // Verneinung wirkt bis zur nächsten Satz-/Komma-Grenze („kein Stellplatz
    // ODER GARAGE" verneint auch die Garage) – Interpunktion beendet den Skopus
    // („keine Terrasse, aber Balkon" lässt den Balkon positiv).
    const NEG_BEFORE = /(kein|keine|keinen|ohne|nicht)\b[^.,;:!?]{0,20}$/i;
    const NEG_AFTER = /^\s*[:=]?\s*(nein|nicht vorhanden|leider nicht|fehlt|nicht verf[üu]gbar)/i;
    const feats = [];
    FEATURES.forEach(([reFeat, label]) => {
      const g = new RegExp(reFeat.source, "gi");
      let fm, hit = false;
      while ((fm = g.exec(t))) {
        const before = t.slice(Math.max(0, fm.index - 25), fm.index);
        const after = t.slice(fm.index + fm[0].length, fm.index + fm[0].length + 24);
        if (NEG_BEFORE.test(before) || NEG_AFTER.test(after)) continue;
        hit = true; break;
      }
      if (hit && !feats.includes(label)) feats.push(label);
    });
    if (feats.length) info.features = feats;

    return info;
  }

  // Ansprechpartner:in mit Anrede (Frau/Herr) aus der Anzeige lesen – nur wenn eindeutig.
  function extractContact(text) {
    const t = (text || "").replace(/\s+/g, " ");
    const TITLE = /^(Dr|Prof|Dipl|Ing|MBA|B\.?A|M\.?A)\.?$/i;               // Titel überspringen
    const PARTICLE = /^(von|van|de|zu|der|den|zum|van der|di)$/i;          // Namenszusätze
    const STOP = /^(Tel|Telefon|Mobil|Handy|Fax|Mail|E-?Mail|GmbH|AG|KG|Immobilien|Immobilie|Hausverwaltung|Verwaltung|Makler|Vermieter|Eigentümer|Besitzer|Nachbar|Wohnung|Objekt|Zimmer|Etage|Kaltmiete|Warmmiete|Miete|Kaution|Str|Straße|Weg|Platz|www|http|Mo|Di|Mi|Do|Fr|Sa|So|Name|Vorname|Nachname|Familienname|Anrede|Divers|Diverse|Ansprechpartner|Ansprechpartnerin|Kontakt|Kontaktperson|Nachricht|Mustermann|Musterfrau|Frau|Herr|Keine|Angabe|Bitte|Rufen|Sie|Ihnen|Ihr|Ihre|Guten|Hallo|Sehr|Wählen|Auswählen|Wir|Uns|Unser|Unsere|Man|Und|Oder|Wenn|Denn|Damit|Gerne|Freuen|Rechtsform|Rechtliche|Rechtlich|Angaben|Vertretungsberechtigt|Vertretungsberechtigte|Vertretungsberechtigter|Handelsregister|Registergericht|Registernummer|Umsatzsteuer|Steuernummer|Impressum|Anbieter|Firma|Firmenname|Sitz|TMG|USt|Unternehmen|Gewerblich|Gewerblicher|Privat|Privater)$/i;
    const isName = (tok) => /^[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?$/.test(tok);

    const re = /\b(Frau|Herr)\b\.?\s+/g;
    let m, best = null, bestScore = -1;
    while ((m = re.exec(t))) {
      const anrede = /^frau$/i.test(m[1]) ? "Frau" : "Herr";
      const rest = t.slice(re.lastIndex, re.lastIndex + 60);
      const names = [];
      for (const raw of rest.split(" ")) {
        const boundary = /[.,;:!?]$/.test(raw);          // Satz-/Wortgrenze nach diesem Token
        const tok = raw.replace(/[.,;:!?]+$/, "");
        if (!tok) { if (names.length) break; else continue; }
        if (TITLE.test(tok)) continue;                 // Titel ignorieren
        if (PARTICLE.test(tok)) { names.push(tok.toLowerCase()); if (boundary) break; continue; }
        if (isName(tok) && !STOP.test(tok)) { names.push(tok); if (boundary) break; continue; }
        break;                                         // erstes Nicht-Namenswort → Ende
      }
      while (names.length && (STOP.test(names[names.length - 1]) || PARTICLE.test(names[names.length - 1]))) names.pop();
      if (!names.length) continue;
      let nachname = names[names.length - 1];
      if (names.length >= 2 && PARTICLE.test(names[names.length - 2])) nachname = names[names.length - 2] + " " + nachname;
      const pre = t.slice(Math.max(0, m.index - 30), m.index);
      const score = /Ansprechpartner|Kontaktperson|Kontakt|vermiet/i.test(pre) ? 2 : 1;
      if (score > bestScore) { best = { anrede: anrede, name: nachname }; bestScore = score; }
    }
    return best;
  }

  // Größe menschlich darstellen: krumme Werte runden ("rund 98"), glatte direkt.
  function formatSize(g) {
    const n = parseFloat(String(g).replace(",", "."));
    if (!isFinite(n)) return null;
    return Number.isInteger(n) ? String(n) : "rund " + Math.round(n);
  }

  // Baut aus erkannten Infos einen kompakten Beschreibungstext.
  function summaryFromInfo(info) {
    const parts = [];
    if (info.zimmer) parts.push(info.zimmer + "-Zimmer-Wohnung");
    if (info.groesse) parts.push(info.groesse + " m²");
    if (info.ort) parts.push(info.ort);
    if (info.preis) parts.push(info.preis + " " + (info.preisLabel || "Miete"));
    if (info.frei) parts.push("frei ab " + info.frei);
    if (info.features && info.features.length) parts.push("mit " + info.features.map((f) => f.replace(/^(der|die|das)\s+/i, "")).join(", "));
    return parts.join(", ");
  }

  function flatOneLine(flat) {
    return (flat.desc || "").replace(/\s+/g, " ").replace(/[.,;:!?\s]+$/, "").trim();
  }

  /**
   * Sammelt AUSSCHLIESSLICH anzeigen-eigenen Text der aktuellen Seite.
   * WICHTIG (Fix 2.0.2): früher wurde document.body.innerText der GESAMTEN
   * Seite gelesen – dadurch flossen „Ähnliche Anzeigen"/Werbemodule in die
   * Extraktion ein (z. B. „Terrasse"/falscher Preis aus einer FREMDEN Anzeige).
   * Jetzt gilt fail-safe:
   *   1. contentSel (anzeigen-eigene Bereiche des Portal-Adapters: Titel,
   *      Preis, Eckdaten, Beschreibung, Ausstattung), falls vorhanden.
   *   2. IMMER zusätzlich: document.title, og:title, meta description,
   *      og:description, ld+json – die beschreiben strukturell die
   *      Haupt-Entität der Seite, nie Fremd-Anzeigen.
   *   3. Trifft contentSel nichts (Portal-Umbau, Composer-Seiten): NUR
   *      Quelle 2. Lieber eine dünnere Extraktion als ein falsches Detail.
   * Muss SELF-CONTAINED bleiben (keine WBA-Referenzen): wird vom Dashboard per
   * chrome.scripting.executeScript in fremde Tabs serialisiert.
   * @param {string} [contentSel] - CSS-Selektoren der anzeigen-eigenen Bereiche.
   * @returns {string}
   */
  function pageExtractor(contentSel) {
    const parts = [];
    // 1) anzeigen-eigene Bereiche (Portal-Adapter contentSel)
    try {
      if (contentSel) {
        document.querySelectorAll(contentSel).forEach((el) => {
          const t = (el.innerText || el.textContent || "").trim();
          if (t) parts.push(t);
        });
      }
    } catch (e) {}
    // 2) Titel/Meta/strukturierte Daten – immer anzeigenecht
    try { if (document.title) parts.push(document.title); } catch (e) {}
    try {
      const ogt = document.querySelector('meta[property="og:title"]');
      if (ogt) parts.push(ogt.content || "");
      const md = document.querySelector('meta[name="description"]');
      if (md) parts.push(md.content || "");
      const ogd = document.querySelector('meta[property="og:description"]');
      if (ogd) parts.push(ogd.content || "");
    } catch (e) {}
    // 3) ld+json: NIE roh übernehmen! Kleinanzeigen bettet z. B. ImageObject-
    // Blöcke mit Titeln/Beschreibungen FREMDER Anzeigen ein („Ähnliche
    // Anzeigen" – Live-Beweis: „Gartenmitbenutzung"/„2,5-Zimmer" aus
    // Gelsenkirchen/Herne auf einer Bochumer Anzeige). Es wird strukturiert
    // geparst und NUR die Haupt-Entität der Seite übernommen; bei 0 oder
    // mehreren Kandidaten fail-safe: gar nichts.
    try {
      const MAIN_TYPE = /(Product|Offer|Apartment|House|SingleFamilyResidence|RealEstateListing|Residence|Accommodation)/i;
      const nodes = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
        let d = null;
        try { d = JSON.parse(s.textContent || ""); } catch (e) { return; }
        (function collect(x) {
          if (!x) return;
          if (Array.isArray(x)) { x.forEach(collect); return; }
          if (typeof x === "object") {
            if (x["@type"]) nodes.push(x);
            if (x["@graph"]) collect(x["@graph"]);
          }
        })(d);
      });
      const mains = nodes.filter((n) => MAIN_TYPE.test(String(n["@type"])));
      if (mains.length === 1) {
        const n = mains[0];
        if (n.name) parts.push(String(n.name));
        if (n.description) parts.push(String(n.description));
        const off = Array.isArray(n.offers) ? n.offers[0] : n.offers;
        if (off && off.price != null && /^[\d.,]+$/.test(String(off.price))) parts.push("Miete: " + off.price + " €");
        if (n.numberOfRooms != null) parts.push("Zimmer: " + n.numberOfRooms);
        if (n.floorSize && n.floorSize.value != null) parts.push("Wohnfläche: " + n.floorSize.value);
        const adr = n.address || {};
        if (adr.postalCode && adr.addressLocality) parts.push(adr.postalCode + " " + adr.addressLocality);
        else if (adr.addressLocality) parts.push("Ort: " + adr.addressLocality);
      }
    } catch (e) {}
    return parts.join("\n");
  }

  // Text NUR für die Empfänger-/Ansprechpartner-Erkennung. Entfernt vor dem Auslesen
  // gezielt Seitenteile, die KEINE Anzeigen-Inhalte sind, aber Wörter wie "Frau/Herr/
  // Divers/Vorname/Nachname" enthalten (Kontaktformular mit Anrede-Dropdown & Feld-Labels,
  // Kopf-/Navigationsleiste, Fußzeile). Sonst würde extractContact ein Formular-Wort als
  // Namen des Vermieters missdeuten ("Sehr geehrte Frau Nachname"). Bewusst konservativ,
  // damit der eigentliche Anzeigentext (Beschreibung, Anbieterbox) erhalten bleibt.
  function pageTextForContact() {
    // Strukturierte Label:Wert-Bereiche (Kontaktformular, Eckdaten-Liste, Impressum/
    // „Rechtliche Angaben") enthalten Wörter wie „Frau/Herr/Divers/Nachname/Rechtsform",
    // die extractContact fälschlich als Vermietername liest. Alle vor dem Auslesen entfernen.
    const NOISE = 'form, #viewad-contact-form, [id*="contact-form"], [class*="contact-form"], ' +
      'header, nav, footer, [role="navigation"], [class*="site-header"], [class*="header--"], ' +
      '[class*="search"], [id*="search"], script, style, noscript, select, option, ' +
      'input, textarea, button, ' +
      'dl, table, [class*="addetailslist"], [class*="legal"], [class*="imprint"], ' +
      '[class*="impressum"], [id*="legal"], [id*="imprint"], [id*="impressum"]';
    // Überschriften-Marker: entfernt den umgebenden Block einer „Rechtliche Angaben"/
    // „Impressum"-Sektion, falls er nicht schon per Klasse erwischt wurde.
    const LEGAL_HEADING = /^\s*(Rechtliche Angaben|Impressum|Anbieter(informationen)?|Angaben gem[äa]ß)/i;
    try {
      const body = document.body;
      if (!body) return "";
      const clone = body.cloneNode(true);
      clone.querySelectorAll(NOISE).forEach((el) => el.remove());
      // Block einer rechtlichen Sektion anhand seiner Überschrift entfernen.
      clone.querySelectorAll("h1, h2, h3, h4, h5, [class*='headline'], [class*='title']").forEach((h) => {
        if (LEGAL_HEADING.test((h.textContent || "").slice(0, 40))) {
          const sec = h.closest("section, article, div") || h.parentElement;
          if (sec) sec.remove();
        }
      });
      const parts = [clone.innerText || ""];
      try {
        const md = document.querySelector('meta[name="description"]');
        if (md) parts.push(md.content || "");
        const ogt = document.querySelector('meta[property="og:title"]');
        if (ogt) parts.push(ogt.content || "");
      } catch (e) {}
      return parts.join("\n");
    } catch (e) {
      // Im Zweifel lieber gar keinen Namen als einen falschen aus dem Formular.
      return "";
    }
  }

  // HINWEIS: Das frühere Vornamen→Geschlecht-Mapping (NAMES_M/NAMES_F, personFromName,
  // firstNameForGreeting) wurde ENTFERNT. Die Anrede-Klassifikation läuft jetzt
  // ausschließlich fail-safe über WBA.salutation (lib/salutation.js): Geschlecht wird
  // NIE aus einem Vornamen geraten – nur explizites „Frau/Herr" zählt, alles Unsichere
  // wird neutral angeschrieben.

  WBA.parse = {
    extractFlatInfo,
    extractContact,
    formatSize,
    summaryFromInfo,
    flatOneLine,
    pageExtractor,
    pageTextForContact,
  };
})(typeof self !== "undefined" ? self : this);
