/* Unit-Tests für WBA.parse.extractFlatInfo – Fokus: Ehrlichkeit der Details.
   Anlass (Fix 2.0.2): erfundene „Terrasse“ aus Fremdinhalten + fehlender
   Negations-Schutz („keine Terrasse“ wurde als Merkmal gewertet).
   Das DOM-Scoping von pageExtractor(contentSel) wird separat über
   tests/fixtures/extraction.html im Browser verifiziert (siehe TESTING.md).
   Ausführen (aus dem Projekt-Root):
     node tests/parse.test.js
     osascript -l JavaScript tests/parse.test.js */
(function () {
  "use strict";

  /* ---------- Modul laden (Node ODER macOS JXA) ---------- */
  var isNode = typeof process !== "undefined" && process.versions && process.versions.node;
  var G = (typeof globalThis !== "undefined") ? globalThis : this;
  function readFile(rel) {
    if (isNode) {
      var path = require("path"), fs = require("fs");
      return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    }
    var cwd = $.NSFileManager.defaultManager.currentDirectoryPath.js;
    return $.NSString.stringWithContentsOfFileEncodingError(cwd + "/" + rel, $.NSUTF8StringEncoding, null).js;
  }
  if (!isNode) ObjC.import("Foundation");
  G.self = G;
  (new Function(readFile("lib/parse.js"))).call(G);
  var P = G.WBA.parse;

  /* ---------- Mini-Testrunner ---------- */
  var failures = [], count = 0;
  function ok(desc, cond, detail) {
    count++;
    if (!cond) failures.push(desc + (detail ? "\n    " + detail : ""));
  }
  function feats(text) { return (P.extractFlatInfo(text).features || []); }
  function has(text, label) { return feats(text).indexOf(label) >= 0; }

  /* =========================================================
     1) Negations-Schutz: verneinte Merkmale zählen NICHT
     ========================================================= */
  ok("01 „keine Terrasse“ → kein Merkmal", !has("Schönes Zimmer, keine Terrasse vorhanden.", "die Terrasse"));
  ok("02 „ohne Balkon“ → kein Merkmal", !has("Wohnung ohne Balkon im 2. OG.", "der Balkon"));
  ok("03 „Terrasse: nein“ → kein Merkmal", !has("Terrasse: nein, Keller: ja", "die Terrasse"));
  ok("04 „Aufzug: nicht vorhanden“ → kein Merkmal", !has("Aufzug: nicht vorhanden", "der Aufzug"));
  ok("05 „nicht saniert“ → kein Merkmal", !has("Das Bad ist nicht saniert.", "der modernisierte Zustand"));
  ok("06 „kein Stellplatz“ → kein Merkmal", !has("Es gibt leider kein Stellplatz oder Garage.", "der Stellplatz"));
  ok("07 „ohne Einbauküche“ → kein Merkmal", !has("Küche ohne Einbauküche.", "die Einbauküche"));
  ok("08 „Balkon leider nicht“ → kein Merkmal", !has("Balkon leider nicht vorhanden.", "der Balkon"));

  /* =========================================================
     2) Positive Merkmale bleiben erhalten (auch neben Negationen)
     ========================================================= */
  ok("09 „großer Balkon“ → Merkmal", has("Wohnung mit großem Balkon nach Süden.", "der Balkon"));
  ok("10 „mit Einbauküche“ → Merkmal", has("Die Küche kommt mit Einbauküche.", "die Einbauküche"));
  ok("11 gemischt: Balkon ja, Terrasse nein", (function () {
    var f = feats("Sonniger Balkon vorhanden, aber keine Terrasse.");
    return f.indexOf("der Balkon") >= 0 && f.indexOf("die Terrasse") < 0;
  })());
  ok("12 zweites (unverneintes) Vorkommen zählt", has("Terrasse: nein. Später Anbau einer Terrasse geplant... die neue Terrasse ist fertig.", "die Terrasse"));
  ok("13 „frisch saniert“ → Merkmal", has("Das Haus wurde frisch saniert.", "der modernisierte Zustand"));

  /* =========================================================
     3) Regression: bestehende Extraktion unverändert korrekt
     ========================================================= */
  var info = P.extractFlatInfo("Schöne 3-Zimmer-Wohnung in Köln-Nippes, 72,5 m², Kaltmiete 850 € zzgl. Nebenkosten 250 €, Kaution 1700 €, Balkon, Einbauküche, frei ab 01.09.2026");
  ok("14 Zimmer", info.zimmer === "3", JSON.stringify(info));
  ok("15 Größe", info.groesse === "72.5", JSON.stringify(info));
  ok("16 Preis = Kaltmiete (nicht Kaution/NK)", info.preis === "850 €" && info.preisLabel === "Kaltmiete", JSON.stringify(info));
  ok("17 Ort mit Umlaut/Bindestrich", info.ort === "Köln-Nippes", JSON.stringify(info));
  ok("18 frei ab", info.frei === "01.09.2026", JSON.stringify(info));
  ok("19 Merkmale", (info.features || []).length === 2, JSON.stringify(info.features));
  // WG-Zimmer-Fall aus dem Live-Befund: 270 € muss gewinnen, keine Fremd-Merkmale.
  var wg = P.extractFlatInfo("Frauen-WG!! Zimmer in Bochum Innenstadt 270 € Helles WG-Zimmer, ca. 14 qm. Keine Terrasse und kein Balkon.");
  ok("20 WG-Preis 270 €", wg.preis === "270 €", JSON.stringify(wg));
  ok("21 WG-Größe 14", wg.groesse === "14", JSON.stringify(wg));
  ok("22 WG-Ort Bochum", wg.ort === "Bochum", JSON.stringify(wg));
  ok("23 WG: keine verneinten Merkmale", !(wg.features || []).length, JSON.stringify(wg.features));
  // Jahreszahl-Absicherung bleibt (ImmoScout-Regression aus 1.7.1)
  var jz = P.extractFlatInfo("Bezugsfrei ab 01.07.2026 Zimmer 1");
  ok("24 Jahreszahl nicht als Zimmer", jz.zimmer === "1", JSON.stringify(jz));

  /* =========================================================
     4) Preis-Auswahl (Live-Befund 2.0.3): Ablöse/Abschlag nie als Miete
     ========================================================= */
  var ab = P.extractFlatInfo("Frauen-WG Zimmer in Bochum 270 € Wichtiges zur Übernahme: Gegen einen Abschlag von 300 € müssen folgende Möbel von mir übernommen werden.");
  ok("25 Möbelablöse (größer!) verdrängt die Miete nicht", ab.preis === "270 €", JSON.stringify(ab));
  ok("26 Kaltmiete-Label gewinnt weiterhin", P.extractFlatInfo("Ablöse 2000 € für die Küche, Kaltmiete 850 €").preis === "850 €");
  ok("27 ohne Labels: ERSTER Betrag gewinnt (Preisfeld steht vorn), nicht der größte",
    P.extractFlatInfo("450 € Schöne Wohnung. Die neue Küche hat 8.000 € gekostet.").preis === "450 €");
  ok("28 „Miete:“-Label (ld+json-Haupt-Entität) wird erkannt",
    P.extractFlatInfo("Tolle Wohnung. Kaution 1500 €. Miete: 620 €").preis === "620 €");
  ok("29 Abstand/Übernahme zählt nicht als Miete",
    P.extractFlatInfo("Wohnung für 500 € monatlich, Abstand 900 € für Einbauten erwünscht").preis === "500 €", JSON.stringify(P.extractFlatInfo("Wohnung für 500 € monatlich, Abstand 900 € für Einbauten erwünscht")));

  /* ---------- Ergebnis ---------- */
  var summary = failures.length
    ? "FEHLGESCHLAGEN: " + failures.length + " von " + count + " Tests\n\n  ✗ " + failures.join("\n  ✗ ")
    : "OK: alle " + count + " Tests bestanden";
  if (isNode) { console.log(summary); process.exit(failures.length ? 1 : 0); }
  return summary;
})();
