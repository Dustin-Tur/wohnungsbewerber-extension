/* Qualitäts-Suite: erzeugt 100+ Anschreiben und prüft hart:
   - Blacklist-Treffer = 0
   - Überlappungs-Grenzwert (< 40 % Trigramm-Überlappung, generate()-Simulation)
   - grammatisch korrekte Verkettung der Bausteine (Heuristiken)
   - Umlaute korrekt (erhalten, kein Mojibake, keine HTML-Entities)
   Ausführen (aus dem Projekt-Root):
     node tests/quality.test.js
     osascript -l JavaScript tests/quality.test.js */
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
  ["lib/config.js", "lib/parse.js", "lib/salutation.js", "lib/letter.js"].forEach(function (f) {
    (new Function(readFile(f))).call(G);
  });
  var L = G.WBA.letter, S = G.WBA.salutation, C = G.WBA.CONFIG;

  var failures = [], count = 0;
  function ok(desc, cond, detail) {
    count++;
    if (!cond) failures.push(desc + (detail ? "\n    " + detail : ""));
  }

  /* ---------- Profile/Infos rotieren (deckt Baustein-Kombinationen ab) ---------- */
  var PROFILES = [
    { name: "Max Müller", age: "32", job: "Softwareentwickler", employment: "unbefristet",
      income: "3.200 €", persons: "2", pets: "keine", email: "max@mail.de", phone: "0176 123", city: "Köln" },
    { name: "Gökçe Öztürk", age: "27", job: "Pflegekraft", employment: "befristet",
      income: "2.400 €", persons: "1", pets: "1 Katze", email: "g@mail.de", city: "Düsseldorf" },
    { name: "Kim Berg", email: "kim@mail.de" }, // karges Profil
    { name: "Hannelore Schäfer", age: "68", employment: "rente", income: "1.900 €",
      persons: "1", pets: "keine", email: "h@mail.de" },
    { name: "Deniz Yılmaz", age: "41", job: "Grafikdesigner", employment: "selbststaendig",
      income: "2.800 €", persons: "3", email: "d@mail.de", phone: "0170 987" },
  ];
  var INFOS = [
    { zimmer: "3", groesse: "72,5", ort: "Köln-Nippes", frei: "01.09.2026",
      features: ["der Balkon", "die Einbauküche"] },
    { zimmer: "2", ort: "Lübeck", features: ["die Fußbodenheizung"] },
    { zimmer: "1", frei: "sofort" },
    {}, // gar keine Extraktion
  ];
  var SALUTS = [
    S.classify("Frau Dr. Weber"),
    S.classify("Herr Müller-Lüdenscheidt"),
    S.classify("Krause Hausverwaltung GmbH"),
    S.classify("Lisa", { expectFirstName: true }),
    S.classify(""), // neutral
  ];
  var DOCS = [{}, { schufa: true, selbstauskunft: true }, { jobcenter: true, kdu: true }];
  var TONES = ["kurz", "standard", "formal", "herzlich", "selbstbewusst"];

  /* ---------- Prüf-Heuristiken ---------- */
  var UMLAUT_SRC = /[äöüßÄÖÜ]/;
  function checkText(desc, t, p) {
    // 1) Blacklist (Treffer MUSS 0 sein)
    ok(desc + ": Blacklist = 0 Treffer", !L.containsBlacklisted(t, p.about),
      "Treffer: " + L.containsBlacklisted(t, p.about) + "\n" + t);
    // 2) max. 1 Ausrufezeichen
    ok(desc + ": <= 1 Ausrufezeichen", (t.match(/!/g) || []).length <= 1, t);
    // 3) grammatische Verkettung (Heuristiken)
    ok(desc + ": keine Platzhalter-Reste", !/undefined|\bnull\b|NaN|\$\{/.test(t), t);
    ok(desc + ": keine doppelten Leerzeichen", !/ {2,}/.test(t), t);
    ok(desc + ": keine doppelte Interpunktion", !/([,;:]){2,}|\.\.|,\.|\.,|\s[,.;:]/.test(t), t);
    ok(desc + ": kein Kleinbuchstabe nach Satzende", !/[.!?] [a-zäöüß]/.test(t), t);
    ok(desc + ": Absätze nicht leer", !/\n\n\s*\n/.test(t) && t.split("\n\n").every(function (b) { return b.trim(); }), t);
    ok(desc + ": Anrede endet mit Komma", /,$/.test(t.split("\n")[0]), t.split("\n")[0]);
    var body = t.split("\n\n").slice(1).join(" ").split("\n")[0];
    ok(desc + ": Sätze enden mit Satzzeichen", /[.!?]$/.test(t.split("\n\n").slice(1, -1).join(" ").trim() || "."), t);
    // 4) Umlaute: erhalten (wenn im Profil vorhanden), kein Mojibake, keine Entities
    if (UMLAUT_SRC.test(p.name)) ok(desc + ": Umlaute im Namen erhalten", t.indexOf(p.name) >= 0, t);
    ok(desc + ": kein Mojibake", !/Ã|â‚¬|â€“|Â/.test(t), t);
    ok(desc + ": keine HTML-Entities", !/&[a-z]+;|&#\d+;/i.test(t), t);
  }

  /* =========================================================
     100 Texte: 20 je Tonlage, rotierende Profile/Infos/Anreden/Docs
     ========================================================= */
  var texts = [];
  var n = 0;
  TONES.forEach(function (tone) {
    for (var i = 0; i < 20; i++) {
      var p = PROFILES[n % PROFILES.length];
      var info = INFOS[n % INFOS.length];
      var sal = SALUTS[n % SALUTS.length];
      var docs = DOCS[n % DOCS.length];
      var t = L.buildLetter(p, { salutation: sal }, tone, info, { docs: docs });
      checkText(tone + " #" + i + " (" + p.name + ")", t, p);
      texts.push(t);
      n++;
    }
  });
  ok("100 Texte erzeugt", texts.length === 100, String(texts.length));

  /* =========================================================
     Überlappungs-Grenzwert: generate()-Schleife simuliert
     (identisches Profil/Info je Tonlage = härtester Fall)
     ========================================================= */
  var accepted = 0, total = 0;
  TONES.forEach(function (tone) {
    var history = [];
    for (var g = 0; g < 8; g++) {
      var best = null;
      for (var a = 0; a < (C.TEXT_MAX_ATTEMPTS || 5); a++) {
        var txt = L.buildLetter(PROFILES[0], { salutation: SALUTS[0] }, tone, INFOS[0], { docs: DOCS[1] });
        var tri = L.trigrams(txt);
        var worst = 0;
        history.forEach(function (h) { worst = Math.max(worst, L.overlapRatio(tri, h)); });
        if (!best || worst < best.worst) best = { tri: tri, worst: worst };
        if (worst < (C.TEXT_OVERLAP_LIMIT || 0.4)) break;
      }
      total++;
      if (best.worst < (C.TEXT_OVERLAP_LIMIT || 0.4)) accepted++;
      history.unshift(best.tri);
      history = history.slice(0, C.TEXT_HISTORY_SIZE || 20);
    }
  });
  ok("Überlappungs-Grenzwert: >= 90 % der Texte unter " + ((C.TEXT_OVERLAP_LIMIT || 0.4) * 100) + " %",
    accepted / total >= 0.9, accepted + "/" + total);

  /* ---------- Ergebnis ---------- */
  var summary = failures.length
    ? "FEHLGESCHLAGEN: " + failures.length + " von " + count + " Prüfungen\n\n  ✗ " + failures.slice(0, 12).join("\n  ✗ ")
    : "OK: alle " + count + " Prüfungen über " + texts.length + " Texte bestanden";
  if (isNode) { console.log(summary); process.exit(failures.length ? 1 : 0); }
  return summary;
})();
