/* Unit-Tests für WBA.stats – die Auswertung „Was bei dir funktioniert".

   Kern dieser Suite ist NICHT die Rechenarbeit (Dreisatz), sondern die
   Zurückhaltung: Eine Quote darf erst ab einer Mindest-Fallzahl behauptet und
   ein „bester Ton" erst bei belastbarem Abstand ausgerufen werden. Genau da
   entstünde sonst eine erfundene Empfehlung mit Prozentzeichen.
   Ausführen (aus dem Projekt-Root):
     node tests/stats.test.js
     osascript -l JavaScript tests/stats.test.js */
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
  // store.js läuft ohne chrome.* (alle Zugriffe sind geschützt) – wir brauchen
  // daraus nur die Status-Definition für den Drift-Test.
  ["lib/stats.js", "lib/store.js"].forEach(function (f) { (new Function(readFile(f))).call(G); });
  var S = G.WBA.stats, store = G.WBA.store;

  /* ---------- Mini-Testrunner ---------- */
  var failures = [], count = 0;
  function ok(desc, cond, detail) {
    count++;
    if (!cond) failures.push(desc + (detail ? "\n    " + detail : ""));
  }

  /* ---------- Helfer: Bewerbungen bauen ---------- */
  var DAY = 86400000;
  // n Einträge mit `ton`/`portal`, davon `replies` mit Antwort.
  function make(ton, portal, n, replies) {
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({
        portal: portal, listingId: ton + "-" + portal + "-" + i, ton: ton,
        status: i < replies ? "antwort" : "beworben",
      });
    }
    return out;
  }
  function cat() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) out = out.concat(arguments[i]);
    return out;
  }

  /* =========================================================
     1) Definitionen laufen nicht auseinander
     ========================================================= */
  ok("01 APPLIED deckungsgleich mit store.APPLIED_STATUS",
    S.APPLIED.join(",") === store.APPLIED_STATUS.join(","),
    S.APPLIED.join(",") + " ≠ " + store.APPLIED_STATUS.join(","));
  ok("02 Besichtigung zählt als Antwort", S.isReplied({ status: "besichtigung" }) === true);
  ok("03 „beworben“ ist noch keine Antwort", S.isReplied({ status: "beworben" }) === false);
  ok("04 „vorbereitet“ zählt nicht als beworben", S.isApplied({ status: "vorbereitet" }) === false);
  ok("05 „übersprungen“ zählt nicht als beworben", S.isApplied({ status: "übersprungen" }) === false);

  /* =========================================================
     2) Zurückhaltung bei kleinen Stichproben
     ========================================================= */
  var winzig = make("formal", "immoscout", 1, 1); // 1 Bewerbung, 1 Antwort
  var g1 = S.groupBy(winzig, function (e) { return e.ton; })[0];
  ok("06 eine einzige Antwort ergibt KEINE 100-%-Quote", g1.rate === null, JSON.stringify(g1));
  ok("07 … die Rohzahlen stehen trotzdem bereit", g1.applied === 1 && g1.replies === 1, JSON.stringify(g1));
  ok("08 knapp unter der Grenze bleibt ohne Quote",
    S.groupBy(make("kurz", "immoscout", S.MIN_GROUP - 1, 2), function (e) { return e.ton; })[0].rate === null);
  var grenze = S.groupBy(make("kurz", "immoscout", S.MIN_GROUP, 2), function (e) { return e.ton; })[0];
  ok("09 genau auf der Grenze gibt es eine Quote", grenze.enough === true && grenze.rate === 2 / S.MIN_GROUP,
    JSON.stringify(grenze));

  /* =========================================================
     3) Gruppierung: Merkmal fehlt / Reihenfolge
     ========================================================= */
  var ohneTon = [{ portal: "immoscout", listingId: "x", status: "beworben" }];
  ok("10 Einträge ohne Ton (Altbestand) erzeugen keine Geister-Gruppe",
    S.groupBy(ohneTon, function (e) { return e.ton; }).length === 0);
  var gemischt = cat(make("standard", "immoscout", 10, 1), make("formal", "immoscout", 2, 2));
  var sortiert = S.groupBy(gemischt, function (e) { return e.ton; });
  ok("11 belastbare Gruppen stehen vor den unsicheren – trotz höherer Roh-Quote",
    sortiert[0].key === "standard" && sortiert[1].key === "formal",
    JSON.stringify(sortiert.map(function (g) { return g.key; })));

  /* =========================================================
     4) Sieger-Kür: nur bei echtem Abstand
     ========================================================= */
  // Klarer Fall: 50 % gegen 10 %, beide mit genug Fällen.
  var klar = cat(make("herzlich", "immoscout", 10, 5), make("formal", "immoscout", 10, 1));
  var lead = S.leader(S.groupBy(klar, function (e) { return e.ton; }));
  ok("12 deutlicher Vorsprung wird gekürt", !!lead && lead.key === "herzlich", JSON.stringify(lead));

  // Knapp: 40 % gegen 30 % → 10 Punkte Abstand, unter LEAD_MIN_DIFF.
  var knapp = cat(make("herzlich", "immoscout", 10, 4), make("formal", "immoscout", 10, 3));
  ok("13 knapper Vorsprung wird NICHT als Erkenntnis verkauft",
    S.leader(S.groupBy(knapp, function (e) { return e.ton; })) === null);

  // Nur eine Gruppe hat genug Fälle → kein Vergleich möglich.
  var allein = cat(make("herzlich", "immoscout", 10, 6), make("formal", "immoscout", 2, 0));
  ok("14 ohne zweite belastbare Gruppe kein Sieger",
    S.leader(S.groupBy(allein, function (e) { return e.ton; })) === null);

  // Abstand groß, aber der Sieger selbst hat zu wenige Fälle (5 < 8).
  var duenn = cat(make("herzlich", "immoscout", 5, 4), make("formal", "immoscout", 10, 1));
  ok("15 Sieger braucht auch selbst genug Fälle",
    S.leader(S.groupBy(duenn, function (e) { return e.ton; })) === null);

  /* =========================================================
     5) Antwortzeiten
     ========================================================= */
  function reply(days) {
    var now = Date.now();
    return { portal: "immoscout", listingId: "r" + days + Math.random(), ton: "standard",
      status: "antwort", appliedAt: now - days * DAY, repliedAt: now };
  }
  ok("16 unter drei Antworten kein Durchschnitt", S.replyTimes([reply(2), reply(4)]) === null);
  var rt = S.replyTimes([reply(2), reply(4), reply(6)]);
  ok("17 Mittelwert stimmt", !!rt && Math.abs(rt.avgDays - 4) < 0.01, JSON.stringify(rt));
  ok("18 späteste Antwort stimmt", !!rt && Math.abs(rt.maxDays - 6) < 0.01, JSON.stringify(rt));
  ok("19 Altbestand ohne Zeitstempel wird still übergangen",
    S.replyTimes([reply(2), reply(4), { status: "antwort" }]) === null);
  var kaputt = [reply(2), reply(4), { status: "antwort", appliedAt: 5000, repliedAt: 1000 }];
  ok("20 unplausible Reihenfolge (Antwort vor Bewerbung) zählt nicht mit",
    S.replyTimes(kaputt) === null);

  /* =========================================================
     6) Gesamtauswertung
     ========================================================= */
  var alle = cat(
    make("standard", "immoscout", 6, 2),
    make("formal", "wg-gesucht", 4, 0),
    [{ portal: "immoscout", listingId: "v1", ton: "standard", status: "vorbereitet" },
     { portal: "immoscout", listingId: "s1", ton: "standard", status: "übersprungen" },
     { portal: "wg-gesucht", listingId: "b1", ton: "formal", status: "besichtigung" }]
  );
  var s = S.summary(alle);
  ok("21 beworben zählt nur echte Bewerbungen", s.applied === 11, "applied=" + s.applied);
  ok("22 Antworten inkl. Besichtigung", s.replies === 3, "replies=" + s.replies);
  ok("23 Besichtigungen separat", s.viewings === 1, "viewings=" + s.viewings);
  ok("24 Gesamtquote wird gebildet", Math.abs(s.replyRate - 3 / 11) < 1e-9, "rate=" + s.replyRate);
  ok("25 nach Ton und nach Portal aufgeschlüsselt", s.byTone.length === 2 && s.byPortal.length === 2,
    JSON.stringify([s.byTone.length, s.byPortal.length]));
  ok("26 ohne Antwortzeit-Stempel bleibt die Antwortzeit leer", s.replyTime === null);
  ok("27 leere Liste stürzt nicht ab und behauptet nichts",
    S.summary([]).applied === 0 && S.summary([]).replyRate === null && S.summary([]).leadTone === null);
  ok("28 undefined als Eingabe ist unkritisch", S.summary().applied === 0);
  ok("29 Mindest-Fallzahl wird für die Oberfläche mitgeliefert", S.summary([]).minGroup === S.MIN_GROUP);

  /* ---------- Ergebnis ---------- */
  var summary = failures.length
    ? "FEHLGESCHLAGEN: " + failures.length + " von " + count + " Tests\n\n  ✗ " + failures.join("\n  ✗ ")
    : "OK: alle " + count + " Tests bestanden";
  if (isNode) { console.log(summary); process.exit(failures.length ? 1 : 0); }
  return summary;
})();
