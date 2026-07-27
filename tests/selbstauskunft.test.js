/* Unit-Tests für WBA.selbstauskunft (lib/selbstauskunft.js).

   Anlass: Die Selbstauskunft lag als private Funktion in dashboard.js und wurde
   nach lib/ ausgelagert, damit der Generator auf wohnungsbewerber.app DIESELBE
   Engine benutzt statt einer zweiten Implementierung (QUA-04-Muster).

   Wichtigster Test ist der Schnappschuss in Abschnitt 1: Er hält fest, dass der
   FELDSATZ DER ERWEITERUNG zeichengleich dasselbe Dokument erzeugt wie vor der
   Auslagerung. Die neuen Felder (Website) sind alle optional – sobald eines von
   ihnen eine Zeile oder gar eine Überschrift in die Extension-Ausgabe schreiben
   würde, fällt dieser Test.

   Ausführen (aus dem Projekt-Root):
     node tests/selbstauskunft.test.js
     osascript -l JavaScript tests/selbstauskunft.test.js */
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
  (new Function(readFile("lib/config.js"))).call(G);
  (new Function(readFile("lib/selbstauskunft.js"))).call(G);
  var S = G.WBA.selbstauskunft;

  /* ---------- Mini-Testrunner ---------- */
  var failures = [], count = 0;
  function ok(desc, cond, detail) {
    count++;
    if (!cond) failures.push(desc + (detail ? "\n    " + detail : ""));
  }
  function hat(html, teil) { return html.indexOf(teil) >= 0; }
  // Feste Datumsangabe: sonst wäre die Ausgabe vom Testtag abhängig.
  function bau(extra) {
    var d = { stand: "01.01.2026" };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) d[k] = extra[k];
    return S.bodyHTML(d);
  }

  /* =========================================================
     1) Schnappschuss: der Feldsatz der ERWEITERUNG ist eingefroren
     ========================================================= */
  var EXT_FELDER = {
    name: "Dustin Tur", age: 23, job: "Teileverkäufer", email: "d@example.de", phone: "0151 234",
    persons: "1", pets: "nein", employment: "unbefristet", income: "2.400 €",
    wohnung: "3-Zimmer-Wohnung, 72 m², Krefeld", einzug: "ab 01.10.2026",
    about: "Ruhiger Mieter.", stand: "01.01.2026"
  };
  var GOLD = '<h1>Mieterselbstauskunft</h1><p class="date">Stand: 01.01.2026</p><h2>Bewerber:in</h2><table><tr><th>Name</th><td>Dustin Tur</td></tr><tr><th>Alter</th><td>23 Jahre</td></tr><tr><th>Beruf</th><td>Teileverkäufer</td></tr><tr><th>E-Mail</th><td>d@example.de</td></tr><tr><th>Telefon</th><td>0151 234</td></tr></table><h2>Haushalt</h2><table><tr><th>Anzahl Personen</th><td>1</td></tr><tr><th>Haustiere</th><td>nein</td></tr></table><h2>Finanzielles</h2><table><tr><th>Beschäftigung</th><td>Angestellt (unbefristet)</td></tr><tr><th>Einkommen (netto/Monat)</th><td>2.400 €</td></tr></table><h2>Gewünschte Wohnung</h2><table><tr><th>Objekt</th><td>3-Zimmer-Wohnung, 72 m², Krefeld</td></tr><tr><th>Gewünschter Einzug</th><td>ab 01.10.2026</td></tr></table><h2>Bemerkungen</h2><p style="font-size:14px">Ruhiger Mieter.</p><p class="decl">Ich versichere, dass die vorstehenden Angaben der Wahrheit entsprechen.</p><div class="sign"><div>Ort, Datum</div><div>Unterschrift</div></div>';
  var ist = S.bodyHTML(EXT_FELDER);
  ok("01 Extension-Feldsatz erzeugt unveränderte Ausgabe", ist === GOLD,
    ist === GOLD ? "" : "erwartet " + GOLD.length + " Zeichen, bekommen " + ist.length);
  ok("02 keine leere Wohnsituations-Überschrift bei Extension-Feldern", !hat(ist, "Aktuelle Wohnsituation"));
  ok("03 kurze Erklärung ohne Mietschulden-Satz", !hat(ist, "Räumungsklage"));

  /* =========================================================
     2) Leere Felder fallen heraus, sie hinterlassen keine Zeile
     ========================================================= */
  var leer = bau({ name: "Nur Name" });
  ok("04 leere Felder erzeugen keine Zeilen", !hat(leer, "<th>Beruf</th>") && !hat(leer, "<th>Telefon</th>"));
  ok("05 Name steht trotzdem", hat(leer, "<td>Nur Name</td>"));
  ok("06 ohne Bemerkung keine Bemerkungs-Überschrift", !hat(leer, "Bemerkungen"));
  ok("07 Abschnitte des Grundgerüsts bleiben", hat(leer, "Bewerber:in") && hat(leer, "Haushalt") && hat(leer, "Finanzielles"));
  ok("08 Alter nur mit Wert (kein nacktes „Jahre“)", !hat(leer, "Jahre"));

  /* =========================================================
     3) Beschäftigungsarten
     ========================================================= */
  var bg = bau({ name: "A", employment: "buergergeld", income: "1.100 €" });
  ok("09 Bürgergeld nennt die Jobcenter-Direktzahlung", hat(bg, "über das Jobcenter"));
  ok("10 Bürgergeld zeigt KEINE Einkommenszeile", !hat(bg, "Einkommen (netto/Monat)"));
  var rente = bau({ name: "A", employment: "rente", income: "1.500 €" });
  ok("11 Rente bekommt ein eigenes Label", hat(rente, "<th>Rente (netto/Monat)</th>"));
  ok("12 Rente-Beschäftigung ausgeschrieben", hat(rente, "Rente / Pension"));
  ok("13 unbekannte Beschäftigung erzeugt keine Zeile", !hat(bau({ name: "A", employment: "quatsch" }), "<th>Beschäftigung</th>"));
  ok("14 alle bekannten Arten haben ein Label",
    ["unbefristet", "befristet", "selbststaendig", "azubi", "rente", "buergergeld"].every(function (e) { return S.empLabelDe(e).length > 0; }));

  /* =========================================================
     4) Neue Felder – nur die Website füllt sie
     ========================================================= */
  var voll = bau({
    name: "Anna", geburtsdatum: "04.10.2002", age: 23, job: "Pflegerin",
    anschrift: "Musterweg 1, 47798 Krefeld", email: "a@x.de", phone: "0151",
    employment: "unbefristet", arbeitgeber: "Mercedes-Benz Herbrand", beschaeftigtSeit: "03/2021",
    persons: "2", weiterePersonen: "Partnerin, 29", pets: "nein", raucher: "nein",
    wohnsituation: "zur Miete", bisherigerVermieter: "Hausverwaltung Meier",
    mietschuldenfrei: true
  });
  // Reihenfolge im Personenteil: erst wer, dann wie alt, dann Beruf, dann wo erreichbar.
  ok("15 Personenfelder stehen in der gedachten Reihenfolge",
    ["Name", "Geburtsdatum", "Alter", "Beruf", "Aktuelle Anschrift", "E-Mail", "Telefon"]
      .map(function (f) { return voll.indexOf("<th>" + f + "</th>"); })
      .every(function (pos, i, alle) { return pos > 0 && (i === 0 || pos > alle[i - 1]); }),
    JSON.stringify(["Name", "Geburtsdatum", "Alter", "Beruf", "Aktuelle Anschrift", "E-Mail", "Telefon"]
      .map(function (f) { return f + "=" + voll.indexOf("<th>" + f + "</th>"); })));
  ok("16 Anschrift erscheint", hat(voll, "Musterweg 1, 47798 Krefeld"));
  ok("17 Arbeitgeber steht im Finanzteil", hat(voll, "<th>Arbeitgeber</th>"));
  ok("18 Beschäftigt seit erscheint", hat(voll, "<th>Beschäftigt seit</th>"));
  ok("19 weitere Personen erscheinen", hat(voll, "Partnerin, 29"));
  ok("20 Raucher-Angabe erscheint", hat(voll, "<th>Raucher</th>"));
  ok("21 Wohnsituation bekommt eigenen Abschnitt", hat(voll, "<h2>Aktuelle Wohnsituation</h2>"));
  ok("22 bisheriger Vermieter erscheint", hat(voll, "Hausverwaltung Meier"));
  ok("23 Mietschuldenfreiheit verlängert die Erklärung", hat(voll, "keine offenen Mietschulden") && hat(voll, "Räumungsklage"));
  ok("24 Wohnsituation NUR mit Inhalt", !hat(bau({ name: "A", bisherigerVermieter: "" }), "Aktuelle Wohnsituation"));
  ok("25 nur Vermieter ohne Wohnsituation reicht für den Abschnitt",
    hat(bau({ name: "A", bisherigerVermieter: "Meier" }), "<h2>Aktuelle Wohnsituation</h2>"));

  /* =========================================================
     5) Maskierung – Eingaben dürfen kein HTML einschleusen (SEC-06)
     ========================================================= */
  var boese = bau({ name: '<script>alert(1)</script>', job: 'a"b', about: "x & y <b>fett</b>" });
  ok("26 Skript-Tag im Namen wird maskiert", !hat(boese, "<script>alert"));
  ok("27 Name erscheint maskiert", hat(boese, "&lt;script&gt;"));
  ok("28 Anführungszeichen werden maskiert", hat(boese, "a&quot;b"));
  ok("29 Bemerkung wird maskiert", hat(boese, "x &amp; y &lt;b&gt;fett&lt;/b&gt;"));
  ok("30 Erklärung bleibt lesbar (kein doppeltes Maskieren)",
    hat(bau({ name: "A" }), "Ich versichere, dass die vorstehenden Angaben der Wahrheit entsprechen."));

  /* =========================================================
     6) Seitenrahmen für das Druckfenster der Erweiterung
     ========================================================= */
  var doc = S.documentHTML({ name: "A", stand: "01.01.2026" }, "Hinweistext");
  ok("31 documentHTML ist eine vollständige Seite", /^<!DOCTYPE html><html lang="de">/.test(doc) && /<\/html>$/.test(doc));
  ok("32 Stil ist eingebettet (Druckfenster hat kein Stylesheet)", hat(doc, S.STYLE));
  ok("33 Banner wird eingesetzt", hat(doc, '<div class="banner">Hinweistext</div>'));
  ok("34 ohne Banner kein leeres Banner-Element", !hat(S.documentHTML({ name: "A" }), 'class="banner"'));
  ok("35 Banner wird im Druck ausgeblendet", hat(S.STYLE, "@media print{.banner{display:none}"));
  ok("36 Dokument bleibt deutsch (Invariante aus lib/i18n.js)", hat(doc, 'lang="de"') && hat(doc, "Mieterselbstauskunft"));

  /* =========================================================
     7) Robustheit
     ========================================================= */
  ok("37 ohne Argument kein Absturz", typeof S.bodyHTML() === "string");
  ok("38 leeres Objekt liefert Grundgerüst", hat(S.bodyHTML({}), "<h1>Mieterselbstauskunft</h1>"));
  ok("39 ohne stand wird ein Datum gesetzt", /Stand: \d{1,2}\.\d{1,2}\.\d{4}/.test(S.bodyHTML({ name: "A" })));

  /* ---------- Ergebnis ---------- */
  var summary = failures.length
    ? "FEHLGESCHLAGEN: " + failures.length + " von " + count + " Tests\n\n  ✗ " + failures.join("\n  ✗ ")
    : "OK: alle " + count + " Tests bestanden";
  if (isNode) { console.log(summary); process.exit(failures.length ? 1 : 0); }
  return summary;
})();
