/* Unit-Tests für die Oberflächensprache (WBA.i18n).
   Ausführen (aus dem Projekt-Root):
     node tests/i18n.test.js
     osascript -l JavaScript tests/i18n.test.js
   Exit-Code 0 = alle Tests grün.

   Deckt zwei Dinge ab:
   1. VOLLSTÄNDIGKEIT – jeder in dashboard.html / dashboard.js / content.js
      benutzte Schlüssel existiert, jeder Eintrag hat eine englische Fassung,
      Platzhalter stimmen in beiden Sprachen überein. Eine vergessene Übersetzung
      fällt so beim Testlauf auf und nicht erst dem englischen Nutzer.
   2. DIE PRODUKT-INVARIANTE – der erzeugte Brief bleibt auch bei englischer
      Oberfläche komplett deutsch. Das ist der ganze Sinn der Sache. */
(function () {
  "use strict";

  /* ---------- Module + Quelltexte laden (Node ODER macOS JXA) ---------- */
  var isNode = typeof process !== "undefined" && process.versions && process.versions.node;
  var G = (typeof globalThis !== "undefined") ? globalThis : this;
  if (!isNode) ObjC.import("Foundation");
  function readFile(rel) {
    if (isNode) {
      var path = require("path"), fs = require("fs");
      return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    }
    var cwd = $.NSFileManager.defaultManager.currentDirectoryPath.js;
    return $.NSString.stringWithContentsOfFileEncodingError(cwd + "/" + rel, $.NSUTF8StringEncoding, null).js;
  }
  G.self = G;
  ["lib/i18n.js", "lib/parse.js", "lib/salutation.js", "lib/letter.js"].forEach(function (f) {
    (new Function(readFile(f))).call(G);
  });
  var I = G.WBA.i18n, L = G.WBA.letter, S = G.WBA.salutation;
  var DICT = I.DICT;

  /* ---------- Mini-Testrunner ---------- */
  var failures = [], count = 0;
  function ok(desc, cond, detail) {
    count++;
    if (!cond) failures.push(desc + (detail ? "\n    " + detail : ""));
  }
  function eq(desc, got, want) { ok(desc, got === want, "erwartet: " + want + "\n    erhalten: " + got); }

  /* =========================================================================
     1. Wörterbuch-Integrität
     ========================================================================= */
  var keys = Object.keys(DICT);
  ok("01 Wörterbuch ist nicht leer", keys.length > 100, "Einträge: " + keys.length);

  // Jeder Eintrag braucht eine englische Fassung – sonst stünde dort Deutsch.
  var noEn = keys.filter(function (k) { return !DICT[k].en; });
  ok("02 jeder Eintrag hat eine englische Fassung", noEn.length === 0, "ohne en: " + noEn.join(", "));

  // Leeres `de` ist ERLAUBT und bedeutet „Hinweis nur für die englische Fassung"
  // (data-i18n-only="en"). Alles andere ohne deutschen Text wäre ein Versehen.
  var ENGLISH_ONLY = ["onb.germanNote", "search.cityNote", "letter.germanNote", "docs.germanNote"];
  var emptyDe = keys.filter(function (k) { return DICT[k].de === ""; });
  ok("03 nur die bekannten Nur-EN-Hinweise haben kein Deutsch",
    emptyDe.length === ENGLISH_ONLY.length && emptyDe.every(function (k) { return ENGLISH_ONLY.indexOf(k) >= 0; }),
    "gefunden: " + emptyDe.join(", "));
  var noDe = keys.filter(function (k) { return DICT[k].de == null; });
  ok("04 kein Eintrag ohne de-Feld", noDe.length === 0, "ohne de: " + noDe.join(", "));

  // Platzhalter müssen in beiden Sprachen identisch sein, sonst bleibt in einer
  // Fassung ein rohes „{n}" stehen oder ein Wert fehlt.
  function placeholders(s) {
    var out = [], re = /\{(\w+)\}/g, m;
    while ((m = re.exec(String(s || "")))) out.push(m[1]);
    return out.sort().join(",");
  }
  var phBad = keys.filter(function (k) {
    return DICT[k].de && DICT[k].en && placeholders(DICT[k].de) !== placeholders(DICT[k].en);
  });
  ok("05 Platzhalter stimmen in beiden Sprachen überein", phBad.length === 0, "abweichend: " + phBad.join(", "));

  /* ---------- Alle benutzten Schlüssel existieren ---------- */
  function keysIn(rel, patterns) {
    var src = readFile(rel), found = {};
    patterns.forEach(function (re) {
      var m; re.lastIndex = 0;
      while ((m = re.exec(src))) found[m[1]] = true;
    });
    return Object.keys(found);
  }
  // dashboard.html: data-i18n / data-i18n-html / data-i18n-attr="attr:key;…"
  var htmlKeys = keysIn("dashboard.html", [
    /data-i18n="([^"]+)"/g,
    /data-i18n-html="([^"]+)"/g,
  ]);
  var attrSrc = readFile("dashboard.html"), attrKeys = [], am, attrRe = /data-i18n-attr="([^"]+)"/g;
  while ((am = attrRe.exec(attrSrc))) {
    am[1].split(";").forEach(function (pair) {
      var i = pair.indexOf(":");
      if (i > 0) attrKeys.push(pair.slice(i + 1).trim());
    });
  }
  // dashboard.js / content.js: tr("key") bzw. tr(k) – nur literale Aufrufe prüfbar.
  var jsKeys = keysIn("dashboard.js", [/\btr\("([^"]+)"/g]).concat(keysIn("content.js", [/\btr\("([^"]+)"/g]));
  // lib/salutation.js baut die Badge-Texte.
  var libKeys = keysIn("lib/salutation.js", [/\btr\("([^"]+)"/g]);

  var allUsed = htmlKeys.concat(attrKeys, jsKeys, libKeys)
    // Aufrufe wie tr("status." + s) liefern nur das Präfix – die decken die
    // expliziten Listen weiter unten ab.
    .filter(function (k) { return k.slice(-1) !== "."; })
    .filter(function (k, i, a) { return a.indexOf(k) === i; });
  var unknown = allUsed.filter(function (k) { return !DICT[k]; });
  ok("06 alle benutzten Schlüssel stehen im Wörterbuch", unknown.length === 0, "unbekannt: " + unknown.join(", "));
  ok("07 es werden überhaupt Schlüssel benutzt", allUsed.length > 100, "gefunden: " + allUsed.length);

  // Dynamisch zusammengesetzte Präfixe ("status." + s, "doc." + id, "tone." + t)
  // fallen durch das Raster oben – deshalb hier explizit prüfen.
  ["vorbereitet", "beworben", "antwort", "besichtigung", "übersprungen"].forEach(function (s) {
    ok("08 Status-Label vorhanden: " + s, !!DICT["status." + s]);
  });
  ["standard", "formal", "kurz", "herzlich", "selbstbewusst"].forEach(function (t) {
    ok("09 Ton-Label vorhanden: " + t, !!DICT["tone." + t]);
  });
  ["ausweis", "schufa", "jobcenter", "kdu", "rente", "bwa", "ausbildung", "buergschaft",
   "buergschaftAlt", "gehalt", "mietschulden", "selbstauskunft"].forEach(function (d) {
    ok("10 Checklisten-Label vorhanden: " + d, !!DICT["doc." + d]);
  });
  ["", "unbefristet", "befristet", "selbststaendig", "azubi", "rente", "buergergeld"].forEach(function (e) {
    ok("11 Beschäftigungs-Label vorhanden: " + (e || "(leer)"), !!DICT[e ? "emp." + e : "emp.none"]);
  });

  /* =========================================================================
     2. t() – Auflösung, Platzhalter, Rückfall
     ========================================================================= */
  eq("20 Standardsprache ist Deutsch", I.lang, "de");
  eq("21 t() liefert Deutsch", I.t("nav.search"), "Suchen");
  eq("22 Platzhalter werden ersetzt", I.t("chip.rooms", { n: 3 }), "3 Zimmer");
  eq("23 unbekannter Schlüssel fällt auf sich selbst zurück", I.t("gibt.es.nicht"), "gibt.es.nicht");
  eq("24 fehlender Platzhalter bleibt stehen", I.t("chip.rooms", {}), "{n} Zimmer");
  eq("25 Nur-EN-Hinweis ist auf Deutsch leer über has()", I.has("letter.germanNote"), false);

  I.setLang("en"); // wirkt sofort; nur das Speichern dahinter ist asynchron
  eq("26 t() liefert Englisch", I.t("nav.search"), "Search");
  eq("27 Platzhalter auch englisch", I.t("chip.rooms", { n: 3 }), "3 rooms");
  eq("28 Nur-EN-Hinweis ist auf Englisch vorhanden", I.has("letter.germanNote"), true);
  eq("29 leeres de fällt NICHT auf den Schlüssel zurück",
    I.t("search.cityNote").indexOf("Use the German name") === 0, true);
  eq("30 Datumsformat folgt der Sprache", I.locale(), "en-GB");

  eq("31 unbekannte Sprache wird ignoriert", (I.setLang("fr"), I.lang), "en");

  /* =========================================================================
     3. PRODUKT-INVARIANTE: englische Oberfläche → DEUTSCHER Brief
     ========================================================================= */
  var P = {
    name: "Jane Doe", age: "29", job: "Softwareentwicklerin", employment: "unbefristet",
    income: "3.400 €", persons: "1", pets: "keine", email: "jane@mail.com",
  };
  var INFO = {
    zimmer: "3", groesse: "72", ort: "Köln-Nippes", preis: "950 €",
    preisLabel: "Kaltmiete", frei: "01.09.2026", features: ["der Balkon", "die Einbauküche"],
  };
  var FLAT = { salutation: S.classify("Frau Weber") };

  // Sprache steht hier auf "en" – der Brief muss trotzdem durchgehend deutsch sein.
  eq("40 Sprache für den Invarianten-Test steht auf en", I.lang, "en");

  // Der Generator würfelt aus Textbaustein-Pools. EIN Brief beweist daher nichts:
  // über alle Töne × 20 Durchläufe prüfen, sonst ist der Test entweder flaky
  // oder er übersieht genau die Variante, die Englisch durchlässt.
  var TONES = ["standard", "formal", "kurz", "herzlich", "selbstbewusst"];
  var bad = { anrede: [], gruss: [], englisch: [], deutsch: [] };
  var n = 0;
  TONES.forEach(function (tone) {
    for (var i = 0; i < 20; i++) {
      var t = L.buildLetter(P, FLAT, tone, INFO, { docs: {} });
      n++;
      if (!/^Sehr geehrte Frau Weber,|^Guten Tag Frau Weber,|^Hallo Frau Weber,/.test(t)) bad.anrede.push(tone + ": " + t.slice(0, 40));
      // STRUKTUR prüfen, nicht Vokabular: Der Pool kennt 38 Grußformeln, viele
      // ohne das Wort „Grüße" („Herzlichst", „Von Herzen", „Auf ein Kennenlernen").
      // Verlangt wird: Leerzeile, eine Grußzeile, der Name, optional die
      // Kontaktzeile – und die Sprache deckt die Englisch-Prüfung darunter ab.
      if (!/\n\n[^\n]{3,70}\n\s*Jane Doe(\n[^\n]*)?$/.test(t)) bad.gruss.push(tone + ": …" + JSON.stringify(t.slice(-70)));
      // Englische Funktionswörter UND englische Grußformeln.
      var leak = /\b(the|your|yours|apartment|flat|dear|sincerely|regards|cheers|please|thanks|thank you)\b/i.exec(t);
      if (leak) bad.englisch.push(tone + ": " + leak[0]);
      // Positiv-Nachweis „das ist Deutsch". Bewusst KEINE Wortliste: an 10.000
      // Briefen gemessen erreichen Wortlisten nur ~99,9 % (die kurzen Varianten
      // enthalten mal keins der Wörter) und machen den Test flaky. Umlaut/ß bzw.
      // die Höflichkeitsform trafen 10.000/10.000 – und in englischem Text kann
      // beides nicht vorkommen.
      if (!/[äöüÄÖÜß]|\b(Sie|Ihnen|Ihre[rmsn]?|Ihr)\b/.test(t)) bad.deutsch.push(tone + ": " + t.slice(0, 60));
    }
  });
  ok("41 deutsche Anrede in allen " + n + " Briefen", bad.anrede.length === 0, bad.anrede.slice(0, 3).join(" | "));
  ok("42 deutsche Grußformel + Name in allen " + n + " Briefen", bad.gruss.length === 0, bad.gruss.slice(0, 3).join(" | "));
  ok("43 kein englisches Wort in " + n + " Briefen", bad.englisch.length === 0, bad.englisch.slice(0, 5).join(" | "));
  ok("44 deutsche Kernwörter in allen " + n + " Briefen", bad.deutsch.length === 0, bad.deutsch.slice(0, 3).join(" | "));

  // Nachfass-Text geht ebenfalls an die Vermietung → deutsch.
  var fu = L.followUp({ ort: "Köln", ton: "standard", appliedAt: Date.now() }, P);
  ok("45 Nachfass-Text ist deutsch", /^(Guten Tag,|Sehr geehrte Damen und Herren,)/.test(fu), fu.slice(0, 40));

  // Anrede-Zeile selbst: deutsch in JEDER Oberflächensprache.
  eq("46 Anrede bleibt deutsch", S.greeting(S.classify("Herr Schmidt"), "formal"), "Sehr geehrter Herr Schmidt,");
  eq("47 neutrale Anrede bleibt deutsch", S.greeting({ category: "neutral" }, "standard"), "Guten Tag,");

  // Das Wörterbuch darf gar keine übersetzten Brief-Bausteine enthalten:
  // ein englisches „Dear …" hier wäre der Anfang vom Ende der Invariante.
  var briefLeak = keys.filter(function (k) { return /^(Dear|Sincerely|Yours)\b/.test(DICT[k].en || ""); });
  ok("48 kein Brief-Baustein im Wörterbuch", briefLeak.length === 0, "verdächtig: " + briefLeak.join(", "));

  I.setLang("de");

  /* =========================================================================
     4. CSP-Hygiene der Erweiterungs-Seiten
     Manifest V3 erzwingt script-src 'self': Inline-<script> und Inline-Handler
     (onclick="…") werden blockiert und landen als roter „Fehler" auf
     chrome://extensions. Steht hier, weil genau so ein Inline-Script beim
     Übersetzen der Popup-Zeile entstanden ist (2.5.0) – der Test verhindert
     die Wiederholung.
     ========================================================================= */
  ["popup.html", "dashboard.html", "datenschutz.html"].forEach(function (page) {
    // HTML-Kommentare zuerst entfernen: sie werden nicht ausgeführt, und ein
    // erklärender Kommentar über Inline-Scripts darf den Test nicht auslösen.
    var src = readFile(page).replace(/<!--[\s\S]*?-->/g, "");
    // <script> OHNE src-Attribut = Inline-Script
    var inline = src.match(/<script(?![^>]*\ssrc=)[^>]*>/g) || [];
    ok("50 kein Inline-Script in " + page, inline.length === 0, inline.join(" | "));
    var handlers = src.match(/\son(?:click|load|change|input|submit|error)\s*=/g) || [];
    ok("51 kein Inline-Handler in " + page, handlers.length === 0, handlers.join(" | "));
  });
  // Die Sprachzeile des Launchers muss folglich in popup.js stehen.
  ok("52 Popup-Sprachzeile liegt in popup.js", /navigator\.language/.test(readFile("popup.js")));
  ok("53 popup.html hat das Ziel-Element dafür", /id="s"/.test(readFile("popup.html")));

  /* ---------- Ergebnis ---------- */
  var out;
  if (failures.length) {
    out = "FEHLER (" + failures.length + " von " + count + "):\n  - " + failures.join("\n  - ");
    if (isNode) { console.error(out); process.exit(1); }
    throw new Error(out);
  }
  out = "OK: alle " + count + " Tests bestanden";
  if (isNode) console.log(out); else console.log(out);
})();
