/* Unit-Tests für WBA.salutation (fail-safe Anrede-System).
   Ausführen (eine der beiden Varianten, jeweils aus dem Projekt-Root):
     node tests/salutation.test.js
     osascript -l JavaScript tests/salutation.test.js
   Exit-Code 0 = alle Tests grün. */
(function () {
  "use strict";

  /* ---------- Modul laden (Node ODER macOS JXA/JavaScriptCore) ---------- */
  var isNode = typeof process !== "undefined" && process.versions && process.versions.node;
  var src, G = (typeof globalThis !== "undefined") ? globalThis : this;
  if (isNode) {
    var path = require("path"), fs = require("fs");
    src = fs.readFileSync(path.join(__dirname, "..", "lib", "salutation.js"), "utf8");
  } else {
    ObjC.import("Foundation");
    var cwd = $.NSFileManager.defaultManager.currentDirectoryPath.js;
    src = $.NSString.stringWithContentsOfFileEncodingError(cwd + "/lib/salutation.js", $.NSUTF8StringEncoding, null).js;
  }
  G.self = G;
  (new Function(src)).call(G);
  var S = G.WBA.salutation;

  /* ---------- Mini-Testrunner ---------- */
  var failures = [], count = 0;
  function eq(desc, got, want) {
    count++;
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      failures.push(desc + "\n    erwartet: " + JSON.stringify(want) + "\n    erhalten: " + JSON.stringify(got));
    }
  }
  // Kurzform: klassifizieren und relevante Felder vergleichen
  function tc(desc, input, opts, want) {
    var c = S.classify(input, opts);
    var got = { category: c.category };
    if (want.name !== undefined) got.name = c.name;
    if (want.vorname !== undefined) got.vorname = c.vorname;
    if (want.titles !== undefined) got.titles = c.titles || [];
    eq(desc, got, want);
    return c;
  }
  function tg(desc, input, opts, mode, wantGreeting) {
    eq(desc, S.greeting(S.classify(input, opts), mode), wantGreeting);
  }

  /* =========================================================================
     a) Person mit explizitem „Frau" / b) „Herr" (inkl. Titel, Doppelnamen …)
     ========================================================================= */
  tc("01 normale Frau", "Frau Müller", null, { category: "frau", name: "Müller" });
  tc("02 normaler Herr", "Herr Schmidt", null, { category: "herr", name: "Schmidt" });
  tc("03 Titel Dr. wird übernommen", "Herr Dr. Schmidt", null, { category: "herr", name: "Schmidt", titles: ["Dr."] });
  tc("04 mehrere Titel", "Herr Prof. Dr. med. Schäfer", null, { category: "herr", name: "Schäfer", titles: ["Prof.", "Dr.", "med."] });
  tc("05 Doppelname mit Bindestrich", "Frau Müller-Lüdenscheidt", null, { category: "frau", name: "Müller-Lüdenscheidt" });
  tc("06 Vor- + Nachname → Nachname", "Frau Anna Maria Schmidt", null, { category: "frau", name: "Schmidt" });
  tc("07 Adelspartikel", "Herr von Berg", null, { category: "herr", name: "von Berg" });
  tc("08 Label davor", "Ansprechpartner: Herr Schmidt", null, { category: "herr", name: "Schmidt" });
  tc("09 Dativ ‚Herrn'", "z. Hd. Herrn Müller", null, { category: "herr", name: "Müller" });
  tc("10 Kleinschreibung", "frau müller", null, { category: "frau", name: "Müller" });
  tc("11 HTML-Entity (benannt)", "Frau M&uuml;ller", null, { category: "frau", name: "Müller" });
  tc("12 HTML-Entity (numerisch)", "Frau M&#252;ller", null, { category: "frau", name: "Müller" });
  tc("13 Whitespace-Chaos", "  Frau \n\t  Weber  ", null, { category: "frau", name: "Weber" });
  tc("14 Umlaut-Nachname", "Frau Özdemir", null, { category: "frau", name: "Özdemir" });
  tc("15 Apostroph-Name", "Herr O'Brien", null, { category: "herr", name: "O'Brien" });
  tc("16 Rauschen nach Name wird gekappt", "Herr Müller Telefon: 0221 123456", null, { category: "herr", name: "Müller" });
  tc("17 Person schlägt Firma", "Müller Immobilien GmbH – Ansprechpartnerin Frau Yilmaz", null, { category: "frau", name: "Yilmaz" });
  tc("18 ‚Herr' ohne Namen → neutral", "Herr", null, { category: "neutral" });
  tc("19 doppelter Doktor", "Frau Dr. Dr. Weber", null, { category: "frau", name: "Weber", titles: ["Dr.", "Dr."] });
  tg("20 Anredetext Frau", "Frau Müller", null, "standard", "Sehr geehrte Frau Müller,");
  tg("21 Anredetext Herr + Titel", "Herr Dr. Schmidt", null, "formal", "Sehr geehrter Herr Dr. Schmidt,");

  /* =========================================================================
     c) Firma / Hausverwaltung / Makler
     ========================================================================= */
  tc("22 GmbH", "Musterhaus GmbH", null, { category: "firma" });
  tc("23 GmbH & Co. KG", "Schmidt Immobilien GmbH & Co. KG", null, { category: "firma" });
  tc("24 Hausverwaltung", "Hausverwaltung Krause", null, { category: "firma" });
  tc("25 Fa.-Kürzel", "Fa. Berger", null, { category: "firma" });
  tc("26 Wohnungsbaugesellschaft mbH", "ABC Wohnungsbaugesellschaft mbH", null, { category: "firma" });
  tc("27 Makler-Team", "City Makler Team", null, { category: "firma" });
  tc("28 ‚Herrmann Immobilien' ist KEINE Person", "Herrmann Immobilien", null, { category: "firma" });
  tg("29 Firma → immer Damen und Herren", "Musterhaus GmbH", null, "herzlich", "Sehr geehrte Damen und Herren,");

  /* =========================================================================
     d) Nur Vorname / Nickname – NUR im informellen Kontext (WG-Gesucht)
     ========================================================================= */
  tc("30 Vorname informell", "Lisa", { expectFirstName: true }, { category: "vorname", vorname: "Lisa" });
  tc("31 Nickname mit Zahlen", "Tom88", { expectFirstName: true }, { category: "vorname", vorname: "Tom" });
  tc("32 gekürzter Nachname", "Ina M.", { expectFirstName: true }, { category: "vorname", vorname: "Ina" });
  tc("33 Ellipse (WG-Gesucht)", "Serhat Ciya…", { expectFirstName: true }, { category: "vorname", vorname: "Serhat" });
  tc("34 Emoji im Namen", "Lisa 😀🏠", { expectFirstName: true }, { category: "vorname", vorname: "Lisa" });
  tg("35 Anredetext locker", "Lisa", { expectFirstName: true }, "standard", "Hallo Lisa,");
  tc("36 Firma auch im informellen Kontext", "Krause Hausverwaltung", { expectFirstName: true }, { category: "firma" });

  /* =========================================================================
     e) UNSICHER → neutral. VERBOTE: nie Geschlecht raten, nie Titel erfinden.
     ========================================================================= */
  tc("37 einzelnes Wort OHNE informellen Kontext (könnte Nachname sein)", "Lisa", null, { category: "neutral" });
  tc("38 nur Nachname", "Mayer", null, { category: "neutral" });
  tc("39 voller Name ohne Frau/Herr → NICHT raten", "Max Mustermann", null, { category: "neutral" });
  tc("40 eindeutig weiblicher Vorname → trotzdem NICHT raten", "Alexandra Berger", null, { category: "neutral" });
  tc("41 englischer Name", "John Smith", null, { category: "neutral" });
  tc("42 englischer Titel wird nicht übersetzt/geraten", "Mrs. Smith", null, { category: "neutral" });
  tc("43 Dr. ohne Frau/Herr → kein Geschlecht erfinden", "Dr. Schmidt", null, { category: "neutral" });
  tc("44 leerer String", "", null, { category: "neutral" });
  tc("45 null", null, null, { category: "neutral" });
  tc("46 nur Emojis/Sonderzeichen", "🏠😀 ***", null, { category: "neutral" });
  tg("47 neutral + locker → Guten Tag", "Max Mustermann", null, "standard", "Guten Tag,");
  tg("48 neutral + kurz → Guten Tag", "", null, "kurz", "Guten Tag,");
  tg("49 neutral + formal → Damen und Herren", "Max Mustermann", null, "formal", "Sehr geehrte Damen und Herren,");
  tg("50 neutral + selbstbewusst → Damen und Herren", "", null, "selbstbewusst", "Sehr geehrte Damen und Herren,");

  /* =========================================================================
     Familie / Eheleute
     ========================================================================= */
  tc("51 Familie", "Familie Schmidt", null, { category: "familie", name: "Schmidt" });
  tc("52 Fam.-Kürzel", "Fam. Yilmaz", null, { category: "familie", name: "Yilmaz" });
  tg("53 Anredetext Familie", "Familie Schmidt", null, "standard", "Sehr geehrte Familie Schmidt,");
  tc("54 Eheleute → bewusst neutral", "Eheleute Schulz", null, { category: "neutral" });

  /* =========================================================================
     Badge-Texte (UI)
     ========================================================================= */
  eq("55 Badge erkannt", S.badge(S.classify("Frau Müller")), { ok: true, text: "erkannt: Frau Müller" });
  eq("56 Badge neutral mit Namensdaten lädt zur Korrektur ein", S.badge(S.classify("Max Mustermann")),
    { ok: false, text: "unsicher: „Max Mustermann“ – Anrede bitte wählen" });
  eq("57 Badge Firma", S.badge(S.classify("Musterhaus GmbH")), { ok: true, text: "Firma erkannt – neutrale Anrede" });
  eq("57b Badge neutral ohne Namensdaten", S.badge(S.classify("")), { ok: false, text: "neutral, da unsicher" });

  /* =========================================================================
     Regression (Live-Befunde 2.0.0): Vorname-als-Nachname & Korrektur-Daten
     ========================================================================= */
  // ImmoScout-Kontaktbox: „Herr Jens Trautmann" + Firmenkette dahinter →
  // Nachname MUSS Trautmann sein (nie der Vorname, nie ein Firmenwort).
  tc("58 Person vor Firmenkette", "Herr Jens Trautmann BmB Bauen mit Beteiligung Bauträgerges.mbH", null,
    { category: "herr", name: "Trautmann" });
  // Kleinanzeigen-Anbieterin ohne Anrede: neutral, ABER mit Namensdaten fürs Dropdown.
  (function () {
    var c = S.classify("Klara Kiwitt");
    eq("59 personLike: Kategorie neutral", c.category, "neutral");
    eq("59b personLike: Nachname fürs Dropdown", c.name, "Kiwitt");
    eq("59c personLike: Vorname fürs Dropdown", c.vorname, "Klara");
  })();
  // Firmenkürzel mit Binnenmajuskel liefert KEINE Personen-Namensdaten.
  eq("60 Binnenmajuskel-Kürzel ohne Namensdaten", !!S.classify("BmB Bauen").name, false);
  // Titel bleiben mit Vor- und Nachnamen korrekt: Nachname gewinnt.
  tc("60b Titel + voller Name", "Frau Dr. Anna Weber", null, { category: "frau", name: "Weber", titles: ["Dr."] });

  /* ---------- pickBest: verlässlichste Quelle gewinnt / Quellen-Merge ---------- */
  eq("61 pickBest: vollständiger Name schlägt verkürzten",
    S.pickBest([S.classify("Herr Jens"), S.classify("Herr Jens Trautmann")]).name, "Trautmann");
  (function () {
    var b = S.pickBest([S.classify("Herr Jens"), S.classify("Jens Trautmann")]);
    eq("62 pickBest: Merge Herr Jens + Jens Trautmann", b.category + " " + b.name, "herr Trautmann");
  })();
  eq("63 pickBest: Person schlägt Firmenfeld",
    S.pickBest([S.classify("Musterhaus Immobilien GmbH"), S.classify("Frau Weber")]).category, "frau");
  eq("64 pickBest: nur Firma → firma",
    S.pickBest([S.classify("Musterhaus Immobilien GmbH")]).category, "firma");
  eq("65 pickBest: leer → neutral", S.pickBest([]).category, "neutral");
  eq("66 pickBest: KEIN Merge bei fremdem Vornamen",
    S.pickBest([S.classify("Herr Kaya"), S.classify("Klara Kiwitt")]).name, "Kaya");
  eq("67 pickBest: personLike liefert Korrektur-Kandidat",
    S.pickBest([S.classify("Klara Kiwitt")]).name, "Kiwitt");

  /* ---------- Ergebnis ---------- */
  var summary = failures.length
    ? "FEHLGESCHLAGEN: " + failures.length + " von " + count + " Tests\n\n  ✗ " + failures.join("\n  ✗ ")
    : "OK: alle " + count + " Tests bestanden";
  if (isNode) { console.log(summary); process.exit(failures.length ? 1 : 0); }
  return summary; // JXA gibt den letzten Ausdruck aus
})();
