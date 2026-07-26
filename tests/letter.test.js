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
  ["lib/parse.js", "lib/salutation.js", "lib/letter.js", "lib/ai.js", "lib/store.js"].forEach(function (f) {
    (new Function(readFile(f))).call(G);
  });
  var L = G.WBA.letter, S = G.WBA.salutation, AI = G.WBA.ai, ST = G.WBA.store;

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
     5d) FUN-07: Verbkongruenz der Unterlagen-Zeile
     ========================================================= */
  // Math.random auf 0 gepinnt trifft in jedem Baustein-Pool Variante 0 –
  // darunter die beiden Subjekt-Varianten („… liegen bereit …"), um die es
  // in FUN-07 geht. Der Text ist damit deterministisch.
  var origRandom = Math.random;
  function withZeroRandom(fn) {
    Math.random = function () { return 0; };
    try { return fn(); } finally { Math.random = origRandom; }
  }
  var kSing = withZeroRandom(function () { return L.buildLetter(P, FLAT, "formal", INFO, { docs: { selbstauskunft: true } }); });
  ok("FUN-07 formal: EINE Singular-Unterlage → „liegt bereit“", kSing.indexOf("Selbstauskunft liegt bereit") >= 0, kSing);
  var kGen = withZeroRandom(function () { return L.buildLetter(P, FLAT, "standard", INFO, { docs: { selbstauskunft: true } }); });
  ok("FUN-07 standard: EINE Singular-Unterlage → „liegt … bereit“", kGen.indexOf("liegt meine ausgefüllte Selbstauskunft schon bereit") >= 0, kGen);
  var kPl = withZeroRandom(function () { return L.buildLetter(P, FLAT, "formal", INFO, { docs: { gehalt: true } }); });
  ok("FUN-07: EINE Plural-Unterlage (Gehaltsnachweise) bleibt „liegen“", kPl.indexOf("Gehaltsnachweise liegen bereit") >= 0, kPl);
  var kZwei = withZeroRandom(function () { return L.buildLetter(P, FLAT, "formal", INFO, { docs: { schufa: true, selbstauskunft: true } }); });
  ok("FUN-07: ZWEI Unterlagen → „liegen bereit“", kZwei.indexOf("Selbstauskunft liegen bereit") >= 0, kZwei);

  /* =========================================================
     6) Blacklist-Funktion selbst
     ========================================================= */
  ok("Blacklist erkennt Floskel", !!L.containsBlacklisted("Hiermit bewerbe ich mich um Ihre Wohnung."));
  ok("Blacklist erkennt Floskel mit Satzzeichen", !!L.containsBlacklisted("Ihre Anzeige hat mein Interesse geweckt!"));
  ok("Blacklist ignoriert Nutzertext", !L.containsBlacklisted("Hiermit bewerbe ich mich.", "Hiermit bewerbe ich mich."));
  ok("Sauberer Text passiert", !L.containsBlacklisted("Ihre Wohnung in Nippes klingt großartig."));

  /* ---------- Zweite Person im Haushalt (Paar / WG / Familie) ---------- */

  var P2 = Object.assign({}, P, {
    p2Rel: "partnerin", p2Name: "Anna Schulz", p2Job: "Krankenpflegerin",
    p2Employment: "unbefristet", p2Income: "1.500 €",
  });

  // Kasus-Tabelle: der Dativ darf nicht aus dem Nominativ geraten werden.
  var pi = L.partnerInfo(P2);
  ok("partnerInfo: Nominativ mit Name", pi.nom === "meine Partnerin Anna Schulz", pi.nom);
  ok("partnerInfo: Dativ gebeugt", pi.dat === "meiner Partnerin Anna Schulz", pi.dat);
  ok("partnerInfo: nur Name, keine Beziehung", L.partnerInfo({ p2Name: "Kim" }).nom === "Kim");
  ok("partnerInfo: ohne Angaben null", L.partnerInfo({}) === null);
  ok("partnerInfo: leere Strings zählen nicht", L.partnerInfo({ p2Name: "  ", p2Rel: "" }) === null);
  Object.keys(L.REL).forEach(function (k) {
    var r = L.REL[k];
    ok("REL " + k + ": Dativ unterscheidet sich vom Nominativ", r.dat !== r.nom, r.nom + " / " + r.dat);
    ok("REL " + k + ": Dativ endet auf -r oder -m", /(?:er|em)\s\S+$/.test(r.dat), r.dat);
  });

  // Über viele Texte prüfen, weil die Bausteine zufällig gewählt werden.
  var MODES = ["standard", "formal", "kurz", "herzlich", "selbstbewusst"];
  var texte = [], texteOhne = [];
  for (var i = 0; i < 60; i++) {
    texte.push(L.buildLetter(P2, FLAT, MODES[i % 5], INFO, {}));
    texteOhne.push(L.buildLetter(P, FLAT, MODES[i % 5], INFO, {}));
  }
  ok("Zweite Person wird in jedem Text genannt",
     texte.every(function (t) { return t.indexOf("Anna Schulz") > -1; }));
  ok("Ohne zweite Person taucht kein Name auf",
     texteOhne.every(function (t) { return t.indexOf("Anna Schulz") < 0; }));
  // Gezielt die Allein-Varianten aus household() – NICHT jedes „allein“:
  // „allein der Balkon zaubert mir ein Lächeln“ ist ein anderer, erlaubter Satz.
  var ALLEIN = /(allein(e)? einziehen|einziehen würde ich allein|ziehe allein(e)? ein|einziehen möchte ich allein|allein hier wohnen)/i;
  ok("Nie „alleine einziehen“, wenn jemand mitzieht",
     texte.every(function (t) { return !ALLEIN.test(t); }),
     (texte.filter(function (t) { return ALLEIN.test(t); })[0] || "").slice(0, 160));

  ok("Beide unterschreiben",
     texte.every(function (t) { return /Max Müller und Anna Schulz/.test(t); }),
     texte[0].slice(-160));
  ok("Gemeinsames Einkommen wird korrekt summiert (3.200 + 1.500)",
     texte.every(function (t) { return t.indexOf("4.700 €") > -1; }),
     texte[0]);
  ok("Die Summe wird nie als eigenes Gehalt ausgegeben",
     texte.every(function (t) { return !/ich verdiene 4\.700/.test(t) && !/Mein Einkommen von 4\.700/.test(t); }));
  ok("Beruf der zweiten Person kommt vor",
     texte.filter(function (t) { return t.indexOf("Krankenpflegerin") > -1; }).length === texte.length);

  // Grammatik-Falle: „mit meine Partnerin“ darf nie entstehen.
  ok("Kein falscher Kasus nach Präposition",
     texte.every(function (t) { return !/\b(mit|von|bei|zu)\s+(meine|mein)\s/i.test(t); }),
     (texte.filter(function (t) { return /\b(mit|von|bei|zu)\s+(meine|mein)\s/i.test(t); })[0] || "").slice(0, 140));

  // Qualitätsschranken müssen auch mit zweiter Person halten.
  ok("Keine Floskel aus der Blacklist",
     texte.every(function (t) { return !L.containsBlacklisted(t, P2.about); }));
  ok("Längenkorridor je Tonlage eingehalten", texte.every(function (t, i) {
    var r = L.RANGE[MODES[i % 5]];
    var w = t.trim().split(/\s+/).length;
    return w >= r[0] - 12 && w <= r[1] + 12;
  }), (function () {
    var s = "";
    texte.forEach(function (t, i) {
      var r = L.RANGE[MODES[i % 5]], w = t.trim().split(/\s+/).length;
      if (!s && (w < r[0] - 12 || w > r[1] + 12)) s = MODES[i % 5] + ": " + w + " Wörter (" + r + ")";
    });
    return s;
  })());

  // Nur Name, keine Beziehung: kein erfundenes Geschlecht, kein Pronomen.
  var nurName = [];
  for (var j = 0; j < 20; j++) nurName.push(L.buildLetter(Object.assign({}, P, { p2Name: "Kim Berger", p2Income: "1.500 €" }), FLAT, "standard", INFO, {}));
  ok("Nur Name: Person wird genannt", nurName.every(function (t) { return t.indexOf("Kim Berger") > -1; }));
  ok("Nur Name: keine erfundene Beziehung",
     nurName.every(function (t) { return !/(Partnerin|Partner|Mitbewohner|Ehefrau|Ehemann)/i.test(t); }),
     (nurName.filter(function (t) { return /(Partnerin|Partner)/i.test(t); })[0] || "").slice(0, 120));

  // Nur Einkommen der zweiten Person (eigenes fehlt) – keine kaputte Summe.
  var nurP2Geld = L.buildLetter(Object.assign({}, P, { income: "", p2Rel: "partner", p2Name: "Ben", p2Income: "2.000 €" }), FLAT, "standard", INFO, {});
  ok("Ohne eigenes Einkommen wird nicht summiert", nurP2Geld.indexOf("2.000 €") > -1 && nurP2Geld.indexOf("NaN") < 0, nurP2Geld);

  // Persons-Angabe darf der zweiten Person nicht widersprechen.
  var einsAberZuZweit = L.buildLetter(Object.assign({}, P2, { persons: "1" }), FLAT, "standard", INFO, {});
  ok("persons=1 plus zweite Person ergibt keinen Allein-Satz", !/allein/i.test(einsAberZuZweit), einsAberZuZweit);

  /* ---------- LEG-04: Die Datenschutz-Schalter gelten für beide Personen ----------
     Sonst wäre die Summe aus zwei Einkommen ein Umweg um die Entscheidung,
     das eigene Einkommen nicht zu nennen. */
  var gesperrt = ST.letterProfile(Object.assign({}, P2, { hideIncome: true }));
  ok("hideIncome leert auch das Einkommen der zweiten Person",
     gesperrt.income === "" && gesperrt.p2Income === "", JSON.stringify({ i: gesperrt.income, p2: gesperrt.p2Income }));
  var gesperrt2 = ST.letterProfile(Object.assign({}, P2, { hideEmployment: true }));
  ok("hideEmployment leert auch die Beschäftigung der zweiten Person",
     gesperrt2.employment === "" && gesperrt2.p2Employment === "");
  ok("Ohne Sperre bleiben beide Angaben stehen",
     ST.letterProfile(P2).p2Income === "1.500 €");

  var briefeGesperrt = [];
  for (var s = 0; s < 20; s++) briefeGesperrt.push(L.buildLetter(gesperrt, FLAT, "standard", INFO, {}));
  ok("Mit Sperre steht keine Einkommenssumme im Brief",
     briefeGesperrt.every(function (t) { return t.indexOf("4.700") < 0 && t.indexOf("1.500") < 0 && t.indexOf("3.200") < 0; }),
     briefeGesperrt[0]);
  ok("Mit Sperre wird die zweite Person trotzdem genannt",
     briefeGesperrt.every(function (t) { return t.indexOf("Anna Schulz") > -1; }));

  /* ---------- KI-Prompt kennt die zweite Person ---------- */
  var prompt2 = AI.buildPrompt(P2, FLAT, "standard", INFO, {});
  ok("Prompt nennt die zweite Person", prompt2.indexOf("Anna Schulz") > -1);
  ok("Prompt gibt die Beziehung mit Kasus-Auftrag vor", /meine Partnerin \(genau so bezeichnen/.test(prompt2));
  ok("Prompt verlangt beide Unterschriften", /beiden Namen/.test(prompt2));
  ok("Prompt verbietet die Einkommens-Verschmelzung", /NICHT als eines/.test(prompt2));
  var promptOhne = AI.buildPrompt(P, FLAT, "standard", INFO, {});
  ok("Ohne zweite Person kein Zusatzblock im Prompt", promptOhne.indexOf("Zweite einziehende Person") < 0);
  var promptNurName = AI.buildPrompt(Object.assign({}, P, { p2Name: "Kim Berger" }), FLAT, "standard", INFO, {});
  ok("Nur Name: Prompt verbietet erfundene Beziehung", /Erfinde KEINE Beziehung/.test(promptNurName));

  /* ---------- Sprachqualität über einen breiten Korpus ----------
     Diese Prüfungen sind aus echten Funden entstanden: „Bei die Einbauküche
     musste ich …" (Kasus), zweimal derselbe Satz im Brief, zwei Absätze
     hintereinander mit demselben Auftakt. Sie laufen über viele Kombinationen,
     weil die Fehler erst im Zusammenspiel der Bausteine entstehen. */

  var KORPUS_PROFILE = [
    P2,
    { name: "Kim Berg", email: "k@b.de" },
    { name: "Hannelore Schäfer", age: "68", employment: "rente", income: "1.900 €", persons: "1", pets: "keine", email: "h@s.de", city: "Bonn" },
    { name: "Tim Vogt", age: "29", employment: "buergergeld", persons: "1", email: "t@v.de" },
    { name: "Deniz Yılmaz", age: "41", job: "Grafikdesigner", employment: "selbststaendig", income: "2.800 €", persons: "3", pets: "ein Hund", email: "d@y.de" },
    { name: "Nele Kraus", age: "19", employment: "azubi", income: "1.100 €", persons: "1", email: "n@k.de" },
  ];
  // Details in Ein- und Mehrzahl, damit Kasus UND Numerus abgedeckt sind.
  var KORPUS_INFO = [
    { zimmer: "3", groesse: "72", ort: "Köln-Nippes", frei: "01.09.2026", features: ["der Balkon", "die Einbauküche"] },
    { zimmer: "2", ort: "Berlin", frei: "sofort", features: ["die Einbauküche"] },
    { zimmer: "4", ort: "Hamburg", features: ["der Garten"] },
    { groesse: "48", features: [] },
    {},
  ];
  var korpus = [];
  KORPUS_PROFILE.forEach(function (prof) {
    TONES.forEach(function (tone) {
      for (var ki = 0; ki < 6; ki++) {
        korpus.push({ tone: tone, text: L.buildLetter(prof, FLAT, tone, KORPUS_INFO[ki % KORPUS_INFO.length], { docs: DOCS }) });
      }
    });
  });

  // 1) Kasus: Nach Dativ-Präpositionen darf keine unflektierte Nominativform stehen.
  var KASUS = /\b(mit|bei|von|zu|nach|seit|aus|wegen)\s+(die|das)\s+[A-ZÄÖÜ]/;
  var kasusFehler = korpus.filter(function (b) { return KASUS.test(b.text.replace(/\n/g, " ")); });
  ok("Kein Kasusfehler nach Dativ-Präposition (" + korpus.length + " Briefe)",
     kasusFehler.length === 0,
     kasusFehler.length ? (kasusFehler[0].text.replace(/\n/g, " ").match(KASUS) || [""])[0] + " …" : "");

  // 2) Kein Satz zweimal im selben Brief.
  var doppelt = [];
  korpus.forEach(function (b) {
    var s = b.text.replace(/\n/g, " ").split(/(?<=[.!?])\s+/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x.length > 12; });
    var z = {};
    s.forEach(function (x) { z[x] = (z[x] || 0) + 1; if (z[x] > 1 && doppelt.length < 3) doppelt.push(x); });
  });
  ok("Kein Satz doppelt im selben Brief", doppelt.length === 0, doppelt[0] || "");

  // 3) Keine zwei aufeinanderfolgenden Absätze mit gleichem Auftakt.
  var auftakte = [];
  korpus.forEach(function (b) {
    var ab = b.text.split("\n\n").slice(1, -1);
    var st = ab.map(function (a) { return a.trim().toLowerCase().split(/\s+/).slice(0, 2).join(" "); });
    for (var i = 0; i < st.length - 1; i++) if (st[i] === st[i + 1] && auftakte.length < 3) auftakte.push(st[i]);
  });
  ok("Keine zwei Absätze mit identischem Auftakt", auftakte.length === 0, auftakte[0] || "");

  // 4) Keine Platzhalter oder kaputten Interpolationen im Text.
  var kaputt = korpus.filter(function (b) { return /undefined|NaN|\$\{|\bnull\b/.test(b.text); });
  ok("Keine unaufgelösten Variablen im Text", kaputt.length === 0, kaputt.length ? kaputt[0].text.slice(0, 120) : "");

  // 5) Sauberes Satzbild: keine doppelten Leerzeichen, kein Leerzeichen vor Satzzeichen.
  var typo = korpus.filter(function (b) {
    var z = b.text.split("\n").join("§");
    return /[^§] {2,}/.test(z) || /\s[.,;]/.test(z) || /\.\s*\./.test(z);
  });
  ok("Sauberes Satzbild (Leerzeichen, Satzzeichen)", typo.length === 0, typo.length ? typo[0].text.slice(0, 160) : "");

  /* ---------- Ergebnis ---------- */
  var summary = failures.length
    ? "FEHLGESCHLAGEN: " + failures.length + " von " + count + " Tests\n\n  ✗ " + failures.join("\n  ✗ ")
    : "OK: alle " + count + " Tests bestanden";
  if (isNode) { console.log(summary); process.exit(failures.length ? 1 : 0); }
  return summary;
})();
