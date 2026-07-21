/* Unit-Tests für den kompositorischen Anschreiben-Generator (WBA.letter).
   Ausführen (aus dem Projekt-Root):
     node tests/letter.test.js
     osascript -l JavaScript tests/letter.test.js */
(function () {
  "use strict";

  /* ---------- Module laden (Node ODER macOS JXA) ---------- */
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
  ["lib/parse.js", "lib/salutation.js", "lib/letter.js", "lib/ai.js"].forEach(function (f) {
    (new Function(readFile(f))).call(G);
  });
  var L = G.WBA.letter, S = G.WBA.salutation, AI = G.WBA.ai;

  /* ---------- Mini-Testrunner ---------- */
  var failures = [], count = 0;
  function ok(desc, cond, detail) {
    count++;
    if (!cond) failures.push(desc + (detail ? "\n    " + detail : ""));
  }

  /* ---------- Testdaten ---------- */
  var P = {
    name: "Max Müller", age: "32", job: "Softwareentwickler",
    employment: "unbefristet", income: "3.200 €", persons: "2", pets: "keine",
    email: "max@mail.de", phone: "0176 1234567", city: "Köln",
    about: "Ruhig, ordentlich, Nichtraucher.",
  };
  var INFO = {
    zimmer: "3", groesse: "72", ort: "Köln-Nippes", preis: "950 €",
    preisLabel: "Kaltmiete", frei: "01.09.2026",
    features: ["der Balkon", "die Einbauküche"],
  };
  var FLAT = { salutation: S.classify("Frau Weber") };
  var DOCS = { schufa: true, selbstauskunft: true };
  var TONES = ["kurz", "standard", "formal", "herzlich", "selbstbewusst"];
  // Toleranz um die Ziel-Korridore (Bausteine sind wortweise nicht beliebig fein)
  var TOL = { kurz: [48, 105], standard: [85, 165], formal: [100, 200], herzlich: [85, 165], selbstbewusst: [85, 165] };

  function wc(t) { return t.trim().split(/\s+/).length; }
  function sentences(t) {
    return t.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/).filter(function (s) { return s.trim(); });
  }

  /* =========================================================
     1) Grund-Constraints je Tonlage (6 Texte pro Ton)
     ========================================================= */
  TONES.forEach(function (tone) {
    for (var i = 0; i < 6; i++) {
      var t = L.buildLetter(P, FLAT, tone, INFO, { docs: DOCS });
      var n = wc(t);
      ok(tone + " #" + i + ": Blacklist sauber", !L.containsBlacklisted(t, P.about), "Treffer: " + L.containsBlacklisted(t, P.about) + "\n" + t);
      ok(tone + " #" + i + ": max. 1 Ausrufezeichen", (t.match(/!/g) || []).length <= 1, t);
      ok(tone + " #" + i + ": Länge " + n + " im Korridor " + TOL[tone].join("–"), n >= TOL[tone][0] && n <= TOL[tone][1], t);
      ok(tone + " #" + i + ": Anrede korrekt", t.split("\n")[0] === S.greeting(FLAT.salutation, tone), t.split("\n")[0]);
      var tooLong = sentences(t).filter(function (s) { return s.trim().split(/\s+/).length > 30; });
      ok(tone + " #" + i + ": kein Satz > 30 Wörter", tooLong.length === 0, tooLong.join(" | "));
    }
  });

  /* =========================================================
     2) Ehrlichkeit: nichts erfinden
     ========================================================= */
  // a) Ohne vorbereitete Unterlagen dürfen keine Unterlagen erwähnt werden.
  for (var i = 0; i < 8; i++) {
    var t1 = L.buildLetter(P, FLAT, "standard", INFO, { docs: {} });
    ok("keine Unterlagen erwähnt (leere Checkliste) #" + i,
      !/schufa|selbstauskunft|mietschuldenfrei|unterlagen/i.test(t1), t1);
  }
  // b) Karges Profil: kein Einkommen/Job/Haustier-Text erfinden.
  var LEAN = { name: "Kim Berg", email: "kim@mail.de" };
  for (var j = 0; j < 8; j++) {
    var t2 = L.buildLetter(LEAN, FLAT, "standard", {}, {});
    ok("kein erfundenes Einkommen #" + j, !/netto|€|unbefristet|angestellt/i.test(t2), t2);
    ok("kein erfundener Beruf/Haustier #" + j, !/beruf|arbeite als|haustier|hund|katze/i.test(t2), t2);
  }
  // c) Details nur aus der Anzeige: ohne Extraktion kein Balkon/EBK.
  for (var k = 0; k < 8; k++) {
    var t3 = L.buildLetter(P, FLAT, "standard", { zimmer: "2" }, { docs: {} });
    ok("keine erfundenen Details #" + k, !/balkon|einbauküche|terrasse|garten|aufzug/i.test(t3), t3);
  }

  /* =========================================================
     3) Konkreter Bezug: extrahierte Details tauchen auf
     ========================================================= */
  var hits = 0;
  for (var d = 0; d < 10; d++) {
    var t4 = L.buildLetter(P, FLAT, "standard", INFO, { docs: {} });
    if (/balkon|einbauküche|01\.09\.2026|köln/i.test(t4)) hits++;
  }
  ok("konkrete Details in >= 8/10 Texten", hits >= 8, "nur " + hits + "/10");

  /* =========================================================
     4) Anti-Wiederholung: < 40 % Trigramm-Überlappung erreichbar
        (Simulation der generate()-Schleife ohne chrome.storage)
     ========================================================= */
  var history = [], accepted = 0, N = 10;
  for (var g = 0; g < N; g++) {
    var best = null;
    for (var a = 0; a < 5; a++) {
      var txt = L.buildLetter(P, FLAT, "standard", INFO, { docs: DOCS });
      var tri = L.trigrams(txt);
      var worst = 0;
      history.forEach(function (h) { worst = Math.max(worst, L.overlapRatio(tri, h)); });
      if (!best || worst < best.worst) best = { txt: txt, tri: tri, worst: worst };
      if (worst < 0.4) break;
    }
    if (best.worst < 0.4) accepted++;
    history.unshift(best.tri); history = history.slice(0, 20);
  }
  ok("Anti-Wiederholung: >= 8 von " + N + " Texten unter 40 % Überlappung", accepted >= 8, "nur " + accepted + "/" + N);

  /* =========================================================
     5) „Neu generieren": direkt aufeinanderfolgende Texte unterscheiden sich
     ========================================================= */
  var r1 = L.buildLetter(P, FLAT, "herzlich", INFO, { docs: DOCS });
  var r2 = L.buildLetter(P, FLAT, "herzlich", INFO, { docs: DOCS });
  ok("Reroll liefert anderen Text", r1 !== r2);
  ok("Reroll-Überlappung < 75 % (ein Wurf, ohne Retry)", L.overlapRatio(L.trigrams(r2), L.trigrams(r1)) < 0.75,
    String(L.overlapRatio(L.trigrams(r2), L.trigrams(r1))));

  /* =========================================================
     5b) Nachfass-Text (followUp) – Bewerbungs-Cockpit
     ========================================================= */
  var FU_ENTRY = { ort: "Köln-Nippes", ton: "standard", appliedAt: new Date(2026, 6, 7, 12, 0).getTime() };
  TONES.forEach(function (tone) {
    var sawDate = false;
    for (var k = 0; k < 12; k++) {
      var fu = L.followUp(Object.assign({}, FU_ENTRY, { ton: tone }), P);
      ok("followUp(" + tone + "): endet mit Namen", fu.trim().slice(-P.name.length) === P.name, fu);
      ok("followUp(" + tone + "): keine Blacklist-Floskel", !L.containsBlacklisted(fu), fu);
      ok("followUp(" + tone + "): nennt den Ort", fu.indexOf("Köln-Nippes") >= 0, fu);
      var anrede = fu.split("\n")[0];
      if (tone === "formal" || tone === "selbstbewusst") ok("followUp(" + tone + "): förmliche Anrede", anrede === "Sehr geehrte Damen und Herren,", anrede);
      else ok("followUp(" + tone + "): lockere Anrede", anrede === "Guten Tag,", anrede);
      ok("followUp(" + tone + "): kompakt (< 70 Wörter)", wc(fu) < 70, wc(fu) + " Wörter");
      // Nicht jede Variante nennt das Datum (bewusst) – aber über mehrere
      // Würfe muss es auftauchen (beweist, dass appliedAt durchgereicht wird).
      // Datumsformat hängt von der ICU der Laufzeit ab – nur Anwesenheit prüfen.
      if (fu.indexOf(" am ") >= 0 && fu.indexOf("2026") >= 0) sawDate = true;
    }
    ok("followUp(" + tone + "): mindestens eine Variante nennt das Bewerbungsdatum", sawDate);
  });
  var fuNoData = L.followUp({}, {});
  ok("followUp ohne Daten: generische Wohnung, kein Datum", fuNoData.indexOf("Ihre Wohnung") >= 0 && fuNoData.indexOf(" am ") < 0, fuNoData);
  ok("followUp ohne Ton: fällt auf Standard zurück", L.followUp({ ton: "unbekannt" }, P).split("\n")[0] === "Guten Tag,");

  /* =========================================================
     5c) noSchufa: SCHUFA darf NIE erwähnt werden
     ========================================================= */
  // Härtester Fall: schufa steht (aus früherem Abhaken) noch auf true,
  // noSchufa ist gesetzt → trotzdem in KEINEM von 20 Texten erwähnt.
  var badDocs = { schufa: true, selbstauskunft: true, gehalt: true, noSchufa: true };
  var schufaSeen = false;
  for (var s5 = 0; s5 < 20; s5++) {
    var t5 = L.buildLetter(P, FLAT, TONES[s5 % TONES.length], INFO, { docs: badDocs });
    if (/schufa/i.test(t5)) schufaSeen = true;
  }
  ok("noSchufa: 20 Vorlagen-Texte ohne SCHUFA (trotz schufa:true)", !schufaSeen);
  // Andere Unterlagen dürfen weiterhin auftauchen (über mehrere Würfe).
  var otherDocSeen = false;
  for (var s6 = 0; s6 < 20; s6++) {
    if (/Selbstauskunft|Gehaltsnachweise/i.test(L.buildLetter(P, FLAT, "formal", INFO, { docs: badDocs }))) { otherDocSeen = true; break; }
  }
  ok("noSchufa: übrige Unterlagen bleiben erwähnbar", otherDocSeen);
  // KI-Prompt: SCHUFA gefiltert + explizites Verbot; ohne noSchufa normal gelistet.
  var prompt1 = AI.buildPrompt(P, { salutation: { category: "neutral" } }, "standard", INFO, badDocs);
  ok("noSchufa: KI-Prompt listet SCHUFA nicht als Unterlage", prompt1.indexOf("SCHUFA-Auskunft") < 0, prompt1);
  ok("noSchufa: KI-Prompt verbietet SCHUFA explizit", /SCHUFA unter KEINEN Umständen/.test(prompt1), prompt1);
  var prompt2 = AI.buildPrompt(P, { salutation: { category: "neutral" } }, "standard", INFO, { schufa: true });
  ok("ohne noSchufa: KI-Prompt listet SCHUFA normal", prompt2.indexOf("SCHUFA-Auskunft") >= 0, prompt2);
  ok("ohne noSchufa: kein Verbots-Satz", !/unter KEINEN Umständen/.test(prompt2), prompt2);

  /* =========================================================
     6) Blacklist-Funktion selbst
     ========================================================= */
  ok("Blacklist erkennt Floskel", !!L.containsBlacklisted("Hiermit bewerbe ich mich um Ihre Wohnung."));
  ok("Blacklist erkennt Floskel mit Satzzeichen", !!L.containsBlacklisted("Ihre Anzeige hat mein Interesse geweckt!"));
  ok("Blacklist ignoriert Nutzertext", !L.containsBlacklisted("Hiermit bewerbe ich mich.", "Hiermit bewerbe ich mich."));
  ok("Sauberer Text passiert", !L.containsBlacklisted("Ihre Wohnung in Nippes klingt großartig."));

  /* ---------- Ergebnis ---------- */
  var summary = failures.length
    ? "FEHLGESCHLAGEN: " + failures.length + " von " + count + " Tests\n\n  ✗ " + failures.join("\n  ✗ ")
    : "OK: alle " + count + " Tests bestanden";
  if (isNode) { console.log(summary); process.exit(failures.length ? 1 : 0); }
  return summary;
})();
