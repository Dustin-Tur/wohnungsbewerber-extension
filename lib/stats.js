/* WBA.stats – Auswertung der eigenen Bewerbungen („Was funktioniert").

   Rechnet ausschließlich mit dem, was der Tracker ohnehin speichert (Ton,
   Portal, Status, appliedAt/repliedAt). KEINE neue Datenerhebung, keine
   Telemetrie, kein Backend: Die Zahlen entstehen auf dem Gerät und verlassen es
   nie. Nur so passt eine Auswertung überhaupt zur Null-Daten-Architektur.

   ┌─ EHRLICHKEIT VOR ZAHLENSCHÖNHEIT (NICHT aufweichen):
   │  Bei einer Handvoll Bewerbungen ist jede Prozentzahl Rauschen. „Formal:
   │  100 %" nach einer einzigen Antwort wäre eine Lüge mit Nachkommastelle –
   │  und würde Nutzer aktiv in die falsche Richtung schicken. Darum nennt diese
   │  Schicht eine Quote erst ab MIN_GROUP Bewerbungen und kürt einen Sieger
   │  erst, wenn der Abstand groß genug ist (siehe leader()). Lieber „noch kein
   └─ klarer Unterschied" als eine erfundene Empfehlung.

   Reines Rechnen – kein DOM, kein chrome.* → aus jedem Kontext nutzbar und in
   tests/stats.test.js direkt prüfbar.

   Nutzung:
     const s = WBA.stats.summary(trackerListe);
     s.replyRate      // 0..1 oder null (zu wenig Daten)
     s.byTone         // [{ key, applied, replies, rate|null, enough }]
     s.leadTone       // Ton mit belastbarem Vorsprung – oder null
*/
(function (root) {
  "use strict";
  const WBA = (root.WBA = root.WBA || {});

  // Muss deckungsgleich mit store.APPLIED_STATUS bleiben – tests/stats.test.js
  // vergleicht beide Listen, damit die Definition nicht auseinanderläuft.
  const APPLIED = ["beworben", "antwort", "besichtigung"];
  // Eine Besichtigung setzt eine Antwort voraus und zählt deshalb mit.
  const REPLIED = ["antwort", "besichtigung"];

  // Ab wie vielen Bewerbungen eine Gruppen-Quote genannt wird. 5 ist bewusst
  // niedrig genug, dass die Auswertung in der ersten Suchwoche etwas zeigt, und
  // hoch genug, dass eine einzelne Antwort die Quote nicht auf 100 % hebt.
  const MIN_GROUP = 5;
  // Ein „Sieger" wird nur ausgerufen, wenn er selbst genug Fälle hat UND der
  // Abstand zum Zweiten größer ist als der Wackel einer einzelnen Antwort.
  const LEAD_MIN_APPLIED = 8;
  const LEAD_MIN_DIFF = 0.15;
  // Mittlere Antwortzeit erst ab ein paar Antworten – zwei Datenpunkte sind
  // kein Durchschnitt.
  const MIN_REPLY_TIMES = 3;

  const DAY = 86400000;

  function isApplied(e) { return !!e && APPLIED.indexOf(e.status) >= 0; }
  function isReplied(e) { return !!e && REPLIED.indexOf(e.status) >= 0; }

  /**
   * Bewerbungen nach einem Merkmal gruppieren und je Gruppe die Antwortquote
   * berechnen. Gruppen ohne belastbare Fallzahl behalten `rate: null` –
   * die Oberfläche zeigt dort bewusst keinen Prozentwert.
   * @param {Array<Object>} list - Tracker-Einträge.
   * @param {function(Object): string} keyFn - liefert den Gruppenschlüssel.
   * @returns {Array<{key: string, applied: number, replies: number, rate: ?number, enough: boolean}>}
   */
  function groupBy(list, keyFn) {
    const map = new Map();
    (list || []).filter(isApplied).forEach((e) => {
      const key = String(keyFn(e) || "").trim();
      if (!key) return; // ohne Merkmal keine Aussage (alte Einträge ohne Ton)
      const g = map.get(key) || { key: key, applied: 0, replies: 0, rate: null, enough: false };
      g.applied++;
      if (isReplied(e)) g.replies++;
      map.set(key, g);
    });
    const out = [];
    map.forEach((g) => {
      g.enough = g.applied >= MIN_GROUP;
      g.rate = g.enough ? g.replies / g.applied : null;
      out.push(g);
    });
    // Aussagekräftige Gruppen zuerst, darin die beste Quote, dann die größte
    // Fallzahl – so steht oben, was am ehesten trägt.
    out.sort((a, b) => (b.enough - a.enough) || ((b.rate || 0) - (a.rate || 0)) || (b.applied - a.applied));
    return out;
  }

  /**
   * Gruppe mit belastbarem Vorsprung – oder null, wenn der Unterschied (noch)
   * Rauschen sein kann. Bewusst streng: keine Empfehlung ist besser als eine
   * falsche.
   * @param {Array<Object>} groups - Ergebnis von groupBy().
   * @returns {?Object}
   */
  function leader(groups) {
    const solid = (groups || []).filter((g) => g.enough);
    if (solid.length < 2) return null;             // ohne Vergleich kein Vorsprung
    const best = solid[0], second = solid[1];
    if (best.applied < LEAD_MIN_APPLIED) return null;
    if (best.rate - second.rate < LEAD_MIN_DIFF) return null;
    return best;
  }

  /**
   * Mittlere und späteste Antwortzeit in Tagen – Grundlage für die Frage
   * „ab wann lohnt sich Nachfassen?". Braucht beide Zeitstempel; Einträge aus
   * der Zeit vor dem repliedAt-Stempel fehlen deshalb still.
   * @param {Array<Object>} list - Tracker-Einträge.
   * @returns {?{avgDays: number, maxDays: number, n: number}}
   */
  function replyTimes(list) {
    const spans = (list || [])
      .filter((e) => isReplied(e) && e.appliedAt && e.repliedAt && e.repliedAt > e.appliedAt)
      .map((e) => (e.repliedAt - e.appliedAt) / DAY);
    if (spans.length < MIN_REPLY_TIMES) return null;
    const sum = spans.reduce((a, b) => a + b, 0);
    return { avgDays: sum / spans.length, maxDays: Math.max.apply(null, spans), n: spans.length };
  }

  /**
   * Gesamtauswertung für den Bewerbungen-Tab.
   * @param {Array<Object>} list - Tracker-Einträge (store.getTracker()).
   * @returns {{applied: number, replies: number, viewings: number, replyRate: ?number,
   *   byTone: Array<Object>, byPortal: Array<Object>, leadTone: ?Object,
   *   replyTime: ?{avgDays: number, maxDays: number, n: number}, minGroup: number}}
   */
  function summary(list) {
    const all = Array.isArray(list) ? list : [];
    const applied = all.filter(isApplied).length;
    const replies = all.filter(isReplied).length;
    const byTone = groupBy(all, (e) => e.ton);
    return {
      applied: applied,
      replies: replies,
      viewings: all.filter((e) => e.status === "besichtigung").length,
      // Die Gesamtquote darf früher erscheinen als die Gruppen-Quoten: sie ist
      // eine Beobachtung über alles, keine Empfehlung für eine Option.
      replyRate: applied ? replies / applied : null,
      byTone: byTone,
      byPortal: groupBy(all, (e) => e.portal),
      leadTone: leader(byTone),
      replyTime: replyTimes(all),
      minGroup: MIN_GROUP,
    };
  }

  WBA.stats = {
    summary, groupBy, leader, replyTimes,
    isApplied, isReplied,
    APPLIED, REPLIED, MIN_GROUP, LEAD_MIN_APPLIED, LEAD_MIN_DIFF, MIN_REPLY_TIMES,
  };
})(typeof self !== "undefined" ? self : this);
