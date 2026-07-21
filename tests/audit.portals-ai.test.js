/* AUDIT-Ergänzungstests (Phase 2 des Voll-Audits 2026-07) – SYNCHRONE Pfade.
   Deckt bisher UNGETESTETE, business-kritische Pfade ab:
     B) portals.buildSearchUrl – Kern-Suchflow: erzeugt die Trefferlisten-URLs,
        die der Nutzer real öffnet (alle 4 Portale + unbekannte Stadt + Umlaute
        + halbe Zimmerzahl).
     C) ai.buildPrompt – Ehrlichkeitsregeln der optionalen KI: SCHUFA-Schutz,
        Anrede-Konsistenz zur Vorlage, keine erfundenen Unterlagen, Bürgergeld.
   Die ASYNC Tracker-/Write-Lock-Tests (store.js) liegen als Browser-Harness
   unter tests/fixtures/store.harness.html (JXA drained Promise-Microtasks nicht
   zuverlässig ohne Node – siehe TESTING.md).
   Kein Prod-Code wird verändert.
   Ausführen (aus dem Projekt-Root):
     node tests/audit.portals-ai.test.js
     osascript -l JavaScript tests/audit.portals-ai.test.js */
(function () {
  "use strict";

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

  // Nur synchron benötigte Module (kein chrome nötig).
  ["lib/config.js", "lib/parse.js", "lib/salutation.js", "lib/portals.js", "lib/ai.js"]
    .forEach(function (f) { (new Function(readFile(f))).call(G); });
  var WBA = G.WBA, portals = WBA.portals, ai = WBA.ai;

  var failures = [], count = 0;
  function ok(desc, cond, detail) { count++; if (!cond) failures.push(desc + (detail ? "\n    " + detail : "")); }

  /* ===================== B) portals.buildSearchUrl ===================== */
  var f = { ort: "Köln", preisMax: "900", qmMin: "55", zimmerMin: "2" };
  var url = {};
  portals.PORTALS.forEach(function (p) { url[p.id] = p.buildSearchUrl(f); });

  ok("B1 WG-Gesucht: City-ID-Pfad + rMax/sMin",
    url["wg-gesucht"] === "https://www.wg-gesucht.de/wohnungen-in-Koeln.73.2.1.0.html?rMax=900&sMin=55", url["wg-gesucht"]);
  ok("B2 Kleinanzeigen: preis::900 + koeln-Slug",
    url["kleinanzeigen"].indexOf("/preis::900/koeln/k0c203") >= 0, url["kleinanzeigen"]);
  ok("B3 ImmoScout: bundesland/stadt-Pfad + dezimale Filter",
    url["immoscout"] === "https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/koeln/wohnung-mieten?price=-900.0&livingspace=55.0-&numberofrooms=2.0-", url["immoscout"]);
  ok("B4 Immowelt: /suche/koeln/wohnungen/mieten (ohne 410-riskante Filter)",
    url["immowelt"] === "https://www.immowelt.de/suche/koeln/wohnungen/mieten", url["immowelt"]);

  var unknown = portals.byId("immoscout").buildSearchUrl({ ort: "Kleinkleckersdorf" });
  ok("B5 ImmoScout unbekannte Stadt → bundesweite Suche",
    unknown === "https://www.immobilienscout24.de/Suche/de/wohnung-mieten", unknown);
  var unknownWg = portals.byId("wg-gesucht").buildSearchUrl({ ort: "Kleinkleckersdorf" });
  ok("B6 WG-Gesucht unbekannte Stadt → searchHome (kein 404-Pfad)",
    unknownWg === "https://www.wg-gesucht.de/mietwohnungen", unknownWg);
  var half = portals.byId("immoscout").buildSearchUrl({ ort: "Berlin", zimmerMin: "2.5" });
  ok("B7 ImmoScout halbe Zimmerzahl → numberofrooms=2.5-", half.indexOf("numberofrooms=2.5-") >= 0, half);
  var muc = portals.byId("immoscout").buildSearchUrl({ ort: "München" });
  ok("B8 Umlaut-Slug München → bayern/muenchen", muc.indexOf("/bayern/muenchen/") >= 0, muc);
  // Kleinanzeigen ohne Preisfilter darf keine leere preis::-Klausel bauen.
  var kaNoPrice = portals.byId("kleinanzeigen").buildSearchUrl({ ort: "Bremen" });
  ok("B9 Kleinanzeigen ohne Preis → keine preis::-Klausel", kaNoPrice.indexOf("preis::") < 0 && kaNoPrice.indexOf("/bremen/") >= 0, kaNoPrice);

  /* ===================== C) ai.buildPrompt Ehrlichkeit ===================== */
  var prof = { name: "Max Mustermann", income: "3000 €", employment: "unbefristet" };
  var info = { zimmer: "3", ort: "Köln", groesse: "70" };

  var pNo = ai.buildPrompt(prof, { salutation: { category: "frau", name: "Weber" } }, "standard", info,
    { schufa: true, noSchufa: true, selbstauskunft: true });
  ok("C1a noSchufa: Prompt verbietet SCHUFA ausdrücklich", /Erw[äa]hne die SCHUFA unter KEINEN Umst[äa]nden/i.test(pNo), "SCHUFA-Verbot fehlt");
  ok("C1b noSchufa: SCHUFA nicht als bereitliegende Unterlage genannt",
    pNo.indexOf("bereitliegen: ") < 0 || pNo.split("bereitliegen: ")[1].split("\n")[0].indexOf("SCHUFA") < 0, "SCHUFA als bereitliegend gelistet");
  ok("C2 Anrede exakt 'Sehr geehrte Frau Weber,'", pNo.indexOf("Sehr geehrte Frau Weber,") >= 0, "Anrede fehlt/abweichend");

  var pHallo = ai.buildPrompt(prof, { contactHallo: "Sabrina" }, "standard", info, {});
  ok("C3 contactHallo → 'Hallo Sabrina,' im Prompt", pHallo.indexOf("Hallo Sabrina,") >= 0, "informelle Anrede nicht abgebildet");

  var pNone = ai.buildPrompt(prof, { salutation: { category: "neutral" } }, "standard", info, {});
  ok("C4 keine Unterlagen → 'Erwähne KEINE Unterlagen'", /Erw[äa]hne KEINE Unterlagen/i.test(pNone), "Verbot fehlt");

  var pBg = ai.buildPrompt({ name: "Anna", employment: "buergergeld" }, { salutation: { category: "neutral" } }, "standard", info, {});
  ok("C5 Bürgergeld → Jobcenter/Kosten der Unterkunft im Prompt", /jobcenter|kosten der unterkunft/i.test(pBg), "Jobcenter-Leitplanke fehlt");
  ok("C6 buildPrompt nennt Blacklist-Floskeln als VERBOTEN", /VERBOTEN/i.test(pNone), "Floskel-Verbot fehlt");

  var summary = failures.length
    ? "FEHLGESCHLAGEN: " + failures.length + " von " + count + " Tests\n\n  ✗ " + failures.join("\n  ✗ ")
    : "OK: alle " + count + " Tests bestanden";
  if (isNode) { console.log(summary); process.exit(failures.length ? 1 : 0); }
  return summary;
})();
