/* WBA.selbstauskunft – baut die Mieterselbstauskunft als HTML.
   Reine Funktionen, kein DOM-Zustand, keine Seiteneffekte. Einzige Abhängigkeit
   ist WBA.esc aus lib/config.js.

   Zwei Abnehmer teilen sich diese Datei (QUA-04-Muster wie bei lib/letter.js):
   die Erweiterung (dashboard.js, öffnet ein Druckfenster) und der Generator auf
   wohnungsbewerber.app (bettet den Inhalt in einen Druckblock ein). Deshalb ist
   der Inhalt (bodyHTML) vom Seitenrahmen (documentHTML) getrennt.

   ACHTUNG: Die Selbstauskunft ist ein DEUTSCHES Dokument für deutsche Vermieter
   und bleibt in JEDER Oberflächensprache deutsch – wie das Anschreiben selbst.
   Deshalb hier bewusst feste Texte statt i18n (siehe Invariante in lib/i18n.js).

   ACHTUNG (LEG-04): Die Selbstauskunft wird bewusst NICHT über
   store.letterProfile() gefiltert. Die beiden Profil-Häkchen verbergen Einkommen
   und Beschäftigung im ANSCHREIBEN; in einer Selbstauskunft wären genau diese
   Angaben der Zweck des Dokuments. Wer hier filtert, liefert ein leeres Formular.

   Alle Felder außer name sind optional: leere Werte fallen in rows() heraus, und
   die beiden nur auf der Website benutzten Abschnitte (Wohnsituation, erweiterte
   Erklärung) erscheinen nur, wenn sie gefüllt sind. Dadurch erzeugt die
   Erweiterung mit ihrem kleineren Feldsatz zeichengleich dasselbe Dokument wie
   vor der Auslagerung – tests/selbstauskunft.test.js hält das fest. */
(function (root) {
  "use strict";
  const WBA = (root.WBA = root.WBA || {});
  const esc = WBA.esc;

  function empLabelDe(emp) { return { unbefristet: "Angestellt (unbefristet)", befristet: "Angestellt (befristet)", selbststaendig: "Selbstständig", azubi: "Ausbildung / Studium", rente: "Rente / Pension", buergergeld: "Arbeitslos / Bürgergeld / Grundsicherung" }[emp] || ""; }

  /* Der Seitenstil steht als eine Zeile im Dokumentkopf: Das Druckfenster der
     Erweiterung bekommt kein externes Stylesheet, und der Generator schreibt
     ihn in einen <style>-Block der Seite. */
  const STYLE = '<style>*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#111;background:#fff;margin:0;padding:32px 40px;line-height:1.5}.banner{background:#eef;border:1px solid #ccd;border-radius:10px;padding:10px 14px;font-size:13px;color:#334;margin-bottom:24px}h1{font-size:24px;margin:0 0 2px}.date{color:#666;font-size:13px;margin:0 0 22px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#4f46e5;border-bottom:2px solid #e5e7ff;padding-bottom:4px;margin:22px 0 8px}table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-weight:600;color:#374151;width:210px;vertical-align:top;padding:5px 8px 5px 0}td{padding:5px 0;vertical-align:top}.decl{margin-top:26px;font-size:13px;color:#374151}.sign{display:flex;gap:40px;margin-top:40px;font-size:13px;color:#666}.sign>div{flex:1;border-top:1px solid #999;padding-top:6px}@media print{.banner{display:none}body{padding:0}}</style>';

  /**
   * Inhalt der Selbstauskunft – ohne <html>-Rahmen, ohne Stil.
   * @param {object} d Felder (alle Strings, alle außer name optional):
   *   name, geburtsdatum, age, job, anschrift, email, phone,
   *   persons, weiterePersonen, pets, raucher,
   *   employment (Schlüssel), arbeitgeber, beschaeftigtSeit, income,
   *   wohnung, einzug, wohnsituation, bisherigerVermieter,
   *   about, mietschuldenfrei (bool), stand (überschreibt das Datum)
   */
  function bodyHTML(d) {
    d = d || {};
    const today = d.stand || new Date().toLocaleDateString("de-DE");
    const rows = (pairs) => pairs.filter((x) => x[1]).map((x) => "<tr><th>" + esc(x[0]) + "</th><td>" + esc(x[1]) + "</td></tr>").join("");

    let finanz = [["Beschäftigung", empLabelDe(d.employment)], ["Arbeitgeber", d.arbeitgeber], ["Beschäftigt seit", d.beschaeftigtSeit]];
    if (d.employment === "buergergeld") finanz.push(["Mietzahlung", "über das Jobcenter (Kosten der Unterkunft) – Direktzahlung an den Vermieter möglich"]);
    else if (d.income) finanz.push([d.employment === "rente" ? "Rente (netto/Monat)" : "Einkommen (netto/Monat)", d.income]);

    /* Nur die Website fragt die bisherige Wohnsituation ab. Ohne Inhalt bliebe
       sonst eine leere Überschrift im Dokument stehen. */
    const wohnsituation = rows([["Derzeit wohnhaft", d.wohnsituation], ["Bisheriger Vermieter", d.bisherigerVermieter]]);

    /* Die Mietschuldenfreiheit ist eine ERKLÄRUNG, kein Feld – sie wird nur
       mitgedruckt, wenn der Ausfüllende sie bewusst bestätigt hat. */
    const decl = d.mietschuldenfrei
      ? "Ich versichere, dass die vorstehenden Angaben der Wahrheit entsprechen. Es bestehen keine offenen Mietschulden, und gegen mich läuft keine Räumungsklage."
      : "Ich versichere, dass die vorstehenden Angaben der Wahrheit entsprechen.";

    return '<h1>Mieterselbstauskunft</h1><p class="date">Stand: ' + esc(today) + '</p>' +
'<h2>Bewerber:in</h2><table>' + rows([["Name", d.name],["Geburtsdatum", d.geburtsdatum],["Alter", d.age ? d.age + " Jahre" : ""],["Beruf", d.job],["Aktuelle Anschrift", d.anschrift],["E-Mail", d.email],["Telefon", d.phone]]) + '</table>' +
'<h2>Haushalt</h2><table>' + rows([["Anzahl Personen", d.persons],["Weitere Personen", d.weiterePersonen],["Haustiere", d.pets],["Raucher", d.raucher]]) + '</table>' +
'<h2>Finanzielles</h2><table>' + rows(finanz) + '</table>' +
'<h2>Gewünschte Wohnung</h2><table>' + rows([["Objekt", d.wohnung],["Gewünschter Einzug", d.einzug]]) + '</table>' +
(wohnsituation ? '<h2>Aktuelle Wohnsituation</h2><table>' + wohnsituation + '</table>' : '') +
(d.about ? '<h2>Bemerkungen</h2><p style="font-size:14px">' + esc(d.about) + '</p>' : '') +
'<p class="decl">' + esc(decl) + '</p>' +
'<div class="sign"><div>Ort, Datum</div><div>Unterschrift</div></div>';
  }

  /** Vollständige, allein lauffähige HTML-Seite – für das Druckfenster der Erweiterung. */
  function documentHTML(d, banner) {
    return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Mieterselbstauskunft</title>' +
      STYLE + '</head><body>' +
      (banner ? '<div class="banner">' + banner + '</div>' : '') +
      bodyHTML(d) + '</body></html>';
  }

  WBA.selbstauskunft = {
    empLabelDe,
    bodyHTML,
    documentHTML,
    STYLE,
  };
})(typeof self !== "undefined" ? self : this);
