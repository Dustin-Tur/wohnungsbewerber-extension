# TESTING.md — Manuelle Test-Checkliste (WohnungsBewerber v2.1.0)

Automatisierte Tests decken die reine Logik ab (`tests/` — aus dem Projekt-Root:
`osascript -l JavaScript tests/<datei>` oder `node tests/<datei>`). Diese
Checkliste deckt ab, was nur im echten Browser auf den echten Portalen prüfbar
ist. **Vor einem Store-Release komplett durchgehen.**

Legende: ☐ offen · ☑ bestanden · ✗ fehlgeschlagen (mit Notiz)

---

## 0. Setup & Grundlagen

- ☐ `chrome://extensions` → Entwicklermodus → „Entpackt laden" → Projektordner.
  Keine Fehler auf der Extensions-Seite („Fehler"-Button bleibt leer).
- ☐ Symbol-Klick öffnet die Zentrale (dashboard.html) in einem Tab; zweiter
  Klick fokussiert den bestehenden Tab statt einen neuen zu öffnen.
- ☐ Erstinstallation öffnet die Zentrale automatisch auf dem Profil-Tab.
- ☐ Profil ausfüllen (inkl. Umlaut-Name, z. B. „Jörg Müßig") → speichern →
  Zentrale neu laden → alle Werte inkl. Umlaute korrekt geladen.
- ☐ Dark Mode: Toggle wirkt; Systemwechsel (hell/dunkel) wirkt, solange nicht
  manuell umgeschaltet wurde.
- ☐ Debug bei Bedarf: In der Konsole des jeweiligen Kontexts
  `WBA.CONFIG.DEBUG = true` setzen → `[WBA]`-Debug-Ausgaben erscheinen.
- ☐ **Nach jedem Neuladen der Extension:** offene Portal-Tabs neu laden und in
  der Konsole die Zeile `[WBA] Build 2.1.0 aktiv auf <Portal>` prüfen (auch als
  Versions-Chip im Overlay-Kopf sichtbar).

## 1. Zentrale (Dashboard)

- ☐ Suche: Ort + Filter setzen, alle Portale angehakt → „Suche starten" öffnet
  je Portal einen Tab (erster aktiv).
- ☐ Anschreiben-Tab: Anzeigentext einfügen → Chips (Zimmer/m²/Preis/Ort/frei ab)
  korrekt; Statuszeile zeigt „Anrede erkannt: …" bzw. „neutral, da unsicher".
- ☐ Generieren: alle 5 Tonlagen erzeugen; Längen grob im Korridor
  (Kurz 60–90 / Standard 100–150 / Formal 120–180 Wörter); keine Floskeln wie
  „hiermit bewerbe ich mich".
- ☐ „Neu formulieren" 5× → jedes Mal spürbar anderer Text (nicht nur ein Wort).
- ☐ Unterlagen-Tab: NICHTS abgehakt → generierter Text erwähnt KEINE Unterlagen.
  SCHUFA + Selbstauskunft abhaken → Text erwähnt genau diese.
- ☐ Selbstauskunft-PDF: öffnet Druckansicht, Umlaute korrekt, Banner wird nicht
  mitgedruckt (Druckvorschau prüfen).
- ☐ Bewerbungen-Tab: Statuswechsel per Dropdown, Filter, CSV-Export (Umlaute in
  Excel korrekt — BOM), Titel-Klick öffnet die Anzeige.
- ☐ Hash-Navigation: Bei offener Zentrale im Overlay „Profil ausfüllen" klicken
  → bestehender Tab wird fokussiert UND wechselt auf den Profil-Reiter.
- ☐ KI (optional, eigener Key): „KI testen" liefert Antwort; mit absichtlich
  falschem Key greift nach kurzer Zeit der eingebaute Generator (Toast).

## 2. Portal-Durchlauf — für JEDES der 5 Portale

Gleiches Prüfschema je Portal; portal-spezifische Besonderheiten darunter.
Vorbedingung: beim Portal eingeloggt.

**Schema (je Portal abhaken):**
- ☐ a) Trefferliste über Dashboard-Suche geöffnet; Filter greifen (Stichprobe).
- ☐ b) Overlay auf der Trefferliste: „N Anzeigen gefunden", Durchlauf startbar.
- ☐ c) Einzelanzeige: Overlay erscheint (auch bei langsamem Laden), Chips korrekt.
- ☐ c2) **Chips + Brief-Details entsprechen DIESER Anzeige** — Gegenprobe:
  Werte aus „Ähnliche Anzeigen"/„Weitere Anzeigen des Nutzers"/Werbung
  (andere Preise, Zimmerzahlen, m², Ausstattung wie „Terrasse") dürfen
  NIRGENDS auftauchen. Steht in der Anzeige „keine Terrasse"/„ohne Balkon",
  darf das Merkmal NICHT im Brief stehen.
- ☐ d) Anrede-Badge zeigt plausible Kategorie; Dropdown-Korrektur tauscht die
  Anrede-Zeile im Entwurf UND im echten Formular (Rest des Texts bleibt).
- ☐ e) Kontaktformular: Anschreiben eingefügt, Profilfelder (Name/E-Mail/…)
  befüllt, KEIN Suchfeld der Kopfzeile versehentlich befüllt.
- ☐ f) Senden-Button pulsiert; „Prüfen & Senden" scrollt hin. **Es wird NIE
  automatisch gesendet.**
- ☐ g) Durchlauf: „Gesendet · Nächste" springt zur nächsten Anzeige;
  „Überspringen" ebenso (Status „übersprungen"); „Stoppen" beendet; nach der
  letzten Anzeige erscheint die Abschluss-Meldung.
- ☐ h) Tracker: Einträge mit Titel/Ort/m²/Preis; dieselbe Anzeige erneut öffnen
  erzeugt KEIN Duplikat; bereits beworbene werden beim neuen Durchlauf
  ausgefiltert.
- ☐ i) „Neu" im Overlay liefert spürbar anderen Text; „Kopieren" funktioniert.
- ☐ j) **Design 2.1.0:** Overlay zeigt die neue Hierarchie — kleine
  Werkzeug-Reihe (Einfügen/Neu/Kopieren), EIN Gradient-Button „Prüfen &
  senden", grüne Durchlauf-Reihe, „Durchlauf stoppen" als Text-Link; Icons
  statt Emojis; Dark Mode folgt dem System. Schnell-Vorschau ohne Portal:
  `tests/fixtures/overlay-demo.html` über den Preview-/Static-Server öffnen.

**WG-Gesucht** (`wg-gesucht.de`)
- ☐ Stadt mit bekannter City-ID (z. B. Köln): Trefferliste lädt direkt (kein 404).
- ☐ Eingeloggt leitet die Anzeige auf den Nachrichten-Composer weiter → Overlay
  erscheint dort; Anrede ist informell „Hallo <Vorname>," (Empfänger aus
  „Nachricht senden an …", gekürzte Nachnamen wie „Ina M." korrekt).
- ☐ Anschreiben landet in `#message_input`; WG-Gesucht-eigene Absenderdaten
  bleiben unangetastet.

**Kleinanzeigen** (`kleinanzeigen.de`)
- ☐ Anbieter-Box: Privatperson ohne „Frau/Herr" (z. B. „Klara Kiwitt") →
  Anrede bleibt neutral (KEIN geratenes Geschlecht!), Badge lädt zur Korrektur
  ein („unsicher: ‚Klara Kiwitt' – Anrede bitte wählen") und das Dropdown
  bietet „Frau Kiwitt / Herr Kiwitt / Familie Kiwitt / Hallo Klara / Neutral";
  ein Klick tauscht die Anrede in Entwurf UND Formular. Gewerblicher Anbieter
  (GmbH/Immobilien) → „Firma erkannt – neutrale Anrede".
- ☐ Nachrichtenfeld `#viewad-contact-message` wird befüllt; das Kopfzeilen-
  Suchfeld („PLZ oder Ort") bleibt leer.
- ☐ **Regressionsfall 2.1.0** (gemeldeter Live-Bug): WG-Zimmer-Anzeige mit
  „Ähnliche Anzeigen"-Block öffnen, z. B.
  `kleinanzeigen.de/s-anzeige/frauen-wg-zimmer-in-bochum-innenstadt/3454531210-203-1946`
  → Chips zeigen die ECHTEN Werte dieser Anzeige (Warmmiete 230 €, 3 Zi.,
  70 m² — steht so in der Detailliste der Inserentin), NIE Werte fremder
  Anzeigen (2,5 Zi./320 €). Der Brief erwähnt KEINE Terrasse und KEINEN
  Garten; erlaubt sind nur die angehakten Ausstattungs-Tags
  (Einbauküche/Altbau/Keller). Die 300-€-Möbelablöse aus der Beschreibung
  darf NIE als Miete erscheinen. Automatisierte Nachstellung:
  `tests/fixtures/extraction.html` über den Preview-/Static-Server öffnen →
  Ergebnisblock unten muss `"PASS": true` zeigen.

**ImmoScout24** (`immobilienscout24.de`)
- ☐ Suche mit bekannter Stadt: URL-Schema `/Suche/de/{bundesland}/{stadt}/…`
  lädt (kein 404); Preis-/Größen-Filter in der URL wirksam.
- ☐ Kontakt-Öffner (`data-qa="sendButton"`) wird geklickt — nicht der
  „Nachrichten"-Postfach-Link im Kopf; Formular erscheint verzögert → Overlay
  wartet (MutationObserver) und füllt dann.
- ☐ Firmen-Anbieter → neutrale Anrede; „Ansprechpartner: Frau X" → „Sehr
  geehrte Frau X,".
- ☐ Ansprechpartner mit Vor- UND Nachname (z. B. „Herr Jens Trautmann", auch
  mit Firmenzusatz dahinter) → Anrede nutzt den NACHNAMEN („Sehr geehrter Herr
  Trautmann,") — nie den Vornamen. Gilt auch, wenn der volle Name erst im
  Kontakt-Modal erscheint (Anrede wird nach dem Öffnen neu aufgelöst).
- ☐ Bot-Schutz-Hinweis: Wird eine Captcha-Seite gezeigt, bleibt die Extension
  still (kein kaputtes Overlay).

**Immowelt** (`immowelt.de`)
- ☐ **SPA-Navigation:** Von der Trefferliste eine Anzeige anklicken (Seite lädt
  NICHT neu) → Overlay der Einzelanzeige erscheint trotzdem (URL-Watcher);
  zurück zur Liste → Listen-Overlay wieder da.
- ☐ Ansprechpartner-Karte „Herr/Frau <Name>" → korrekte förmliche Anrede;
  IntermediaryCard (Makler) → neutrale Anrede.
- ☐ React-Formular: Werte bleiben nach dem Einfügen erhalten (kein Zurücksetzen
  beim Re-Render), `firstName`/`lastName`/`email` korrekt aufgeteilt.
- ☐ Tracker-ID stabil: dieselbe Anzeige mit/ohne UTM-Parameter geöffnet →
  EIN Tracker-Eintrag (alphanumerische Expose-ID).

**Immonet** (`immonet.de` — nutzt den Immowelt-Adapter)
- ☐ Anzeige unter immonet.de öffnen → Overlay + Formularbefüllung wie Immowelt.
- ☐ Tracker führt den Eintrag unter „Immowelt / Immonet".

## 3. Anrede-Stichproben (portal-übergreifend)

- ☐ „Frau Dr. Müller-Lüdenscheidt" in einer Anzeige → Anrede exakt mit Titel
  und Doppelname.
- ☐ Anbietername nur Vorname+Nachname ohne Frau/Herr (z. B. „Alexandra Berger")
  → NEUTRAL („Guten Tag," bzw. formal „Sehr geehrte Damen und Herren,") —
  niemals geratenes „Frau/Herr".
- ☐ „Familie Schmidt" → „Sehr geehrte Familie Schmidt,".
- ☐ Umlaute/HTML-Entities im Anbieternamen (z. B. „M&uuml;ller" im Quelltext)
  → Anrede zeigt „Müller".

## 4. Regression / Stabilität

- ☐ Konsolen aller Kontexte (Portal-Tab, Zentrale, Service-Worker) ohne
  unbehandelte Fehler und ohne „Unchecked runtime.lastError".
- ☐ Auto-Overlay-Schalter aus → auf Einzelanzeigen erscheint (außerhalb eines
  Durchlaufs) kein Overlay.
- ☐ Zwei Portal-Tabs parallel „Als beworben markieren" → beide Einträge im
  Tracker (kein Verlust durch Race).
- ☐ Service-Worker „in Ruhe lassen": Nach > 30 s Inaktivität KI-Generierung
  auslösen → funktioniert (Worker wacht auf).
- ☐ `manifest.json`: Version 2.1.0; Berechtigungen nur `scripting`, `storage`,
  `tabs` + Portal-Hosts + api.anthropic.com.
