# CHANGELOG — WohnungsBewerber

Referenzen wie „A1", „B4" verweisen auf die Befund-Nummern in `AUDIT.md`.
Referenzen wie „SEC-01", „FUN-03" (ab 2.7.0) sind die Befund-IDs des
Voll-Audits vom 25.07.2026; sie stehen auch in den Commit-Betreffs.

## 2.8.1 — 2026-08-12 · Immonet entfernt (Portal abgeschaltet)

Immonet gibt es nicht mehr: `immonet.de` antwortet seit dem Zusammenschluss mit
Immowelt nur noch mit `301 → https://www.immowelt.de#x-sunset-redirect=imn`
(am 12.08.2026 nachgeprüft, auch für Detail-URLs wie `/angebot/<id>`). Dort kann
also keine Anzeige mehr geöffnet werden.

- **Manifest:** `https://www.immonet.de/*` aus `host_permissions` und aus den
  `content_scripts.matches` entfernt. Die Erweiterung fordert damit keine Rechte
  mehr für eine tote Domain — das war sonst eine unnötige Angriffsfläche in der
  Store-Prüfung und im Rechte-Dialog beim Installieren.
- **`lib/portals.js`:** Adapter heißt jetzt „Immowelt" (statt „Immowelt /
  Immonet"), Host-Muster, `listingUrlRe`, `resultsUrlRe` und `URL_PATTERNS` ohne
  Immonet. Der Tracker zeigt bestehende Einträge unverändert an: gespeichert wird
  die Portal-**ID** `immowelt`, der Anzeigename wird jedes Mal frisch nachgeschlagen.
- **Texte:** README, ANLEITUNG und TESTING nennen Immonet nicht mehr.

Nichts an der Erkennung oder am Formular-Befüllen geändert — Immowelt selbst
funktioniert unverändert (Aviv-CDP-Selektoren bleiben, wie sie waren).

## 2.8.0 — 2026-07-26 · Zweite Person im Haushalt, mehr Satzvarianz

2.7.0 war fertig gebaut, aber nie im Store – dieses Paket enthält beides.

### Zweite Person im Profil (Paare, WGs, Familien)

Bisher konnte man nur die *Anzahl* der einziehenden Personen angeben – wer der
zweite Mensch ist und ob zwei Einkommen die Miete tragen, blieb offen. Genau
das wollen Vermietungen aber wissen.

- **Profil:** neuer optionaler Block mit Beziehung (Partner:in, Ehepartner:in,
  Mitbewohner:in, Tochter/Sohn), Name, Beruf, Beschäftigung und Einkommen.
- **Anschreiben:** Die zweite Person wird namentlich genannt („Einziehen würden
  mein Mann Jonas Brandt und ich"), Beruf und – wenn beide Einkommen
  eingetragen sind – die korrekt addierte Haushaltssumme erscheinen als eigener
  Satz, und **beide unterschreiben**. Die vorhandenen Vertrauens-Varianten
  wurden nicht umgeschrieben: „ich verdiene 5.200 €" wäre bei zwei Einkommen
  falsch, und ein Umbau hätte den Klang aller fünf Tonlagen verändert.
- **Kasus aus einer Tabelle, nicht aus einer Regel:** „gemeinsam mit meine
  Partnerin" kann sich eine Bewerbung nicht leisten. Ein Test prüft, dass nach
  „mit/von/bei/zu" nie eine unflektierte Form steht.
- **Ohne gewählte Beziehung** wird kein Geschlecht erfunden – dann trägt nur
  der Name den Satz.
- **LEG-04 gilt für den ganzen Haushalt:** Wer sein Einkommen nicht im
  Anschreiben nennen will, bei dem verschwindet auch das der zweiten Person –
  sonst wäre die Summe ein Umweg um die eigene Entscheidung.
- **KI-Modus:** Der Prompt kennt die zweite Person, bekommt die Beziehung mit
  Kasus-Auftrag, verlangt beide Unterschriften und verbietet ausdrücklich, zwei
  Einkommen als eines auszugeben.

### Mehr Varianz: 435 → 668 Textbausteine

Zwei Bewerbungen desselben Nutzers sollen sich nicht ähneln – und keine soll
nach Vorlage klingen. Gemessen wurde zuerst, wo es klemmt: Einstieg und
Selbstvorstellung waren mit über 200 Absatz-Varianten schon reich, der
**Vertrauens-Absatz kam auf 30–40, der Abschlusssatz auf 14, die Grußformel auf
10**. Genau dort ist aufgestockt worden.

| Baustein | vorher je Tonlage | jetzt |
|---|---|---|
| Einstieg | 15 | 21–23 |
| Bezug zur Anzeige | 8 | 13–16 |
| Selbstvorstellung | 14 | 18–20 |
| Vertrauen/Einkommen | 10 | 18–19 |
| Zusatz | 14 | 19–20 |
| Abschluss | 14 | 24 |
| Grußformel | 12 | 18–19 |

Dazu: Unterlagen-Sätze 11 → 23, Haushalts-Formulierungen 20 → 33, Sonderfälle
für Bürgergeld, Rente, Selbstständigkeit und Ausbildung je 4–5 → 9–10, Sätze zur
zweiten Person 3 → 7. Die rechnerische Untergrenze der Kombinationen steigt von
rund 39,5 Mio. auf rund 726 Mio.

Wirkung, gemessen über je 600 Briefe pro Tonlage mit identischem Profil:

| | vorher | nachher |
|---|---|---|
| verschiedene Sätze je Tonlage | ~150 | 234–259 |
| Varianten im Vertrauens-Absatz | 30–40 | 108–169 |
| Ø Trigramm-Überlappung | 18–24 % | 15–22 % |
| Briefpaare mit ≥ 40 % Überlappung | 2,4–4,1 % | 0,6–1,3 % |

Alle neuen Sätze laufen durch dieselben Schranken wie die alten: Floskel-
Blacklist, höchstens 30 Wörter je Satz, ein Ausrufezeichen, keine erfundenen
Fakten. Vier Entwürfe sind daran gescheitert und wurden umgeschrieben – drei
behaupteten Dinge, die nicht im Profil stehen („mit Auftraggebern über Jahre"),
einer bot eine höhere Kaution an, was § 551 BGB nicht zulässt.

### Nebenbefund: Längenkorridore wurden systematisch verfehlt

Beim Absichern der neuen Tests fiel auf, dass **formale Anschreiben ihren
eigenen Korridor (120–180 Wörter) in 53,9 % der Fälle unterschritten** – im
Mittel 118 Wörter. Ursache: Sind alle Bausteine bereits enthalten, kann
`fitLength` einen zu kurzen Text nicht mehr strecken. `buildLetter` verwirft
jetzt Unterlängen und würfelt neu (bis zu sechs Versuche, dann der längste
saubere Kandidat). Gemessen über je 800 Texte pro Tonlage:

| Tonlage | unter Korridor vorher | nachher |
|---|---|---|
| formal | 53,9 % | 1,3 % |
| selbstbewusst | 3,4 % | 0,0 % |
| herzlich | 3,0 % | 0,0 % |
| standard | 2,5 % | 0,0 % |
| kurz | 0,0 % | 0,0 % |

Kein Text überschreitet seinen Korridor. Damit ist auch der sporadisch rote
Längentest in `tests/letter.test.js` erledigt (vorher ~15 % der Läufe).

## 2.7.0 — 2026-07-26 · Audit-Umsetzung: Sicherheit, Verlässlichkeit, Datenrechte

57 von 70 Befunden eines vollständigen Audits behoben (6 Umsetzungswellen).
Kein neues Feature, dafür ein in fast jeder Schicht solideres Produkt. Die
Produkt-Invarianten sind unangetastet: alles lokal, kein Server, keine
Telemetrie, null Abhängigkeiten, es wird nie automatisch gesendet.

**Für Bestandsnutzer wichtig:** Die Anthropic-Anbindung ist jetzt eine
*optionale* Berechtigung (EXT-04). Wer die KI-Funktion nutzt, muss die
Einstellungen einmal neu speichern und die Berechtigung im Chrome-Dialog
bestätigen — vorher macht die KI schlicht nichts.

- **Berechtigungen minimiert:** `scripting` komplett entfernt (EXT-03, „Aus
  offener Anzeige laden" läuft jetzt über eine Nachricht an das ohnehin
  vorhandene Content-Script), Anthropic-Host von Pflicht auf optional
  (EXT-04), Host-Zugriff von Subdomain-Wildcards auf konkrete `www.`-Hosts
  eingeengt (EXT-01), `chrome.tabs.query` liest nur noch Portal-Tabs statt
  aller offenen Tabs (EXT-02), Absender-Validierung im Service-Worker (EXT-05).
- **Autofill gezähmt:** Profildaten landen nur noch in sichtbaren Feldern
  innerhalb des Kontaktformulars — nicht mehr in versteckten oder
  seitengesteuerten Feldern irgendwo auf der Portalseite (SEC-01).
- **Es wird noch weniger automatisch:** Die Portal-Suchmaske wird nicht mehr
  selbsttätig abgeschickt, sondern erst nach Bestätigung im Overlay (EXT-10);
  der Durchlauf navigiert mit Zufallspausen statt im Maschinentakt (EXT-11).
- **Datenrechte eingelöst:** „Alle Daten löschen" löscht wirklich alles
  Personenbezogene (LEG-01), vollständiger JSON-Export **und** -Import
  (LEG-12, QUA-05), Verlauf und Anzeigen-URLs verfallen nach 90 Tagen plus
  Aufräumknopf im Tracker (LEG-13), KI-Aktivierung nur noch mit
  Einwilligungs-Checkbox (LEG-03).
- **KI-Härtung:** Anzeigentext wandert als abgegrenzter Datenblock in den
  Prompt statt als Anweisungstext (SEC-02), Kostenbremse fragt ab 5 Aufrufen
  pro Durchlauf nach (SEC-03), keine Klarnamen Dritter mehr in der Konsole
  (SEC-07).
- **Tracker verlässlich:** Speicherfehler werden gemeldet statt verschluckt
  (FUN-03), ein tab-übergreifender Write-Lock verhindert verlorene Einträge
  bei parallelen Tabs (FUN-02, eigener Nebenläufigkeits-Test QUA-03), ein
  Wiederbesuch stuft Beworbenes nicht mehr zurück (FUN-01), bereits Beworbenes
  landet nicht erneut in der Queue (FUN-05), alte Suchaufträge verfallen nach
  10 Minuten (FUN-04), Fehlklicks bei „Antwort erhalten" sind korrigierbar
  (FUN-15), dazu FUN-09–14 (Kopier-Rückmeldung, Demo-Persistenz, Sprach-Reset,
  Overlay-„Neu"-Knopf, Mietrechner-Dezimalfehler, SPA-Reste).
- **Neu: du entscheidest, was im Brief steht.** Zwei Häkchen im Profil
  bestimmen, ob **Einkommen** und **Beschäftigungsstatus** im Anschreiben
  genannt werden — beide standardmäßig an, für Bestandsnutzer ändert sich also
  nichts. Rechtlich sind diese Angaben vor Vertragsschluss meist nicht
  geschuldet; bisher entschied das Werkzeug es für dich (bei Bürgergeld nannten
  40 von 40 Briefen den Bezug). Die Werte bleiben gespeichert und erscheinen
  weiterhin in der Mieterselbstauskunft-PDF — der Schalter wirkt nur auf
  Anschreiben, Vorlage wie KI (LEG-04).
- **Anschreiben-Grammatik:** Bei genau einer vorbereiteten Unterlage steht das
  Verb jetzt im Singular — „meine Selbstauskunft liegt bereit" statt „liegen"
  (FUN-07, mit deterministischen Kongruenz-Tests).
- **Ehrlichere Texte nach außen:** Die Store-Kurzbeschreibung nennt die
  optionale KI ausdrücklich statt pauschal „Lokal" (EXT-07), Store-Listing und
  Website-Footer weisen die Unabhängigkeit von den Portalen aus (LEG-08/EXT-08),
  und die Datenschutzerklärung ist wieder deckungsgleich mit dem Code: Daten
  Dritter benannt (LEG-02), die entfernte `scripting`-Berechtigung gestrichen,
  Anthropic als optionale Berechtigung gekennzeichnet, Löschung/Export/
  Verfallsregeln vollständig beschrieben (LEG-07, Stand 26.07.2026).
- **Frühwarnsystem:** Ein lokaler Selbsttest zählt je Portal, wie oft eine
  Anzeigenseite ohne Kontaktformular endet, und warnt im Dashboard ab 5
  Fehlschlägen — so fällt ein Portal-Umbau auf, bevor Support-Mails kommen
  (QUA-06).
- **Bedienbarkeit:** motivierender Profil-Fortschritt über Kernfelder (UX-04),
  Browser-Autofill wieder erlaubt mit echten autocomplete-Tokens (UX-05),
  Browser-Zurück wechselt den Reiter statt die App zu verlassen (UX-07),
  kompakter Tracker im schmalen Fenster (UX-03), Status nur noch einmal und
  bedienbar (UX-09), Titel-Tooltips (UX-10), Pluralfehler behoben (UX-11).
- **Werkzeug & Betrieb:** reproduzierbares Store-ZIP per `build-store-zip.sh`
  (QUA-11), ESLint-Lauf in der CI als reines Entwicklungswerkzeug (QUA-09),
  toter Code entfernt (QUA-07), Design-Tokens JS-seitig konsolidiert
  (UX-08/QUA-08).
- Die Website-Änderungen (echter Engine-Generator QUA-04, CSP ohne
  `unsafe-inline` SEC-05, HSTS SEC-04, Mietrechner FUN-13, UX-01/02/06/12)
  liegen im separaten landing-Repo.

## 2.6.0 — 2026-07-23 · Auswertung „Was bei dir funktioniert“

Beantwortet die einzige Frage, die der Tracker bisher offenließ: *Bringt der Ton
überhaupt etwas – und wo lohnt sich die Zeit?* Bisher sah man nur, **dass** man
sich beworben hat, nicht **was davon wirkt**.

- **Neu: `lib/stats.js`** – reine Rechenschicht (kein DOM, kein `chrome.*`) mit
  `summary()`, `groupBy()`, `leader()`, `replyTimes()`. Neue Karte im Reiter
  „Bewerbungen“ unter der Liste: Antwortquote **je Ton** und **je Portal** als
  Balken, dazu die mittlere und späteste Antwortzeit.
- **Keine neue Datenerhebung.** Gerechnet wird ausschließlich mit Feldern, die
  der Tracker ohnehin speichert (`ton`, `portal`, `status`, `appliedAt`). Die
  Zahlen entstehen lokal und verlassen den Browser nicht – die Null-Daten-
  Architektur bleibt unangetastet. Das ist zugleich die Antwort auf den
  Audit-Punkt „ohne Zahlen keine Steuerung“, ohne Telemetrie einzuführen.
- **Ehrlichkeit vor Zahlenschönheit** (die eigentliche Arbeit an dem Feature):
  Eine Quote erscheint erst ab **5 Bewerbungen** je Gruppe – darunter steht
  „erst {n} Bewerbungen (Quote ab 5)“ mit gestricheltem statt gefülltem Balken.
  Ein „bester Ton“ wird erst behauptet, wenn er **mindestens 8 Bewerbungen** hat
  **und** mindestens **15 Prozentpunkte** vor dem Zweiten liegt; sonst steht dort
  ausdrücklich „noch kein belastbarer Unterschied“. Eine einzelne Antwort darf
  nie zu „100 %“ werden – `tests/stats.test.js` (29 Tests) prüft genau diese
  Zurückhaltung, nicht die Dreisatz-Rechnung.
- **Neuer Zeitstempel `repliedAt`** in `store.upsertTracker()` – analog zum
  bestehenden `appliedAt` beim ersten Wechsel auf „antwort“/„besichtigung“.
  Grundlage der Antwortzeit; Alt-Einträge ohne Stempel werden still übergangen
  statt geschätzt.
- Balken-Darstellung: alle Zeilen eines Blocks teilen sich **ein** Grid, damit
  die Schienen gleich lang und die Balken vergleichbar sind (sonst sähe 45 %
  kürzer aus als 43 %). Schmale Fenster legen den Balken in eine eigene Zeile.
- Vollständig zweisprachig (`stats.*` in `lib/i18n.js`), inkl. lokalisierter
  Zahlen („2,2 Tage“ / „2.2 days“).

## 2.5.1 — 2026-07-23 · Lokalisiertes Store-Listing (Name/Beschreibung)

Ergänzt zur englischen Oberfläche (2.5.0) die zweite „Englisch"-Ebene: den
**Auftritt im Chrome Web Store**, damit englischsprachige Suchbegriffe die
Erweiterung überhaupt finden.

- **Neu: `_locales/de/messages.json` + `_locales/en/messages.json`** und
  `"default_locale": "de"` im Manifest. `name`, `description` und
  `action.default_title` sind jetzt `__MSG_…__`-Platzhalter. Damit zeigt der
  Store Namen, Kurzbeschreibung und Symbol-Tooltip je nach Store-/Browsersprache
  auf Deutsch oder Englisch – und das Dashboard bietet erst dadurch eine
  englische Sprachspalte fürs Listing an.
- **Chromes `_locales` ≠ die UI-Übersetzung.** `_locales` betrifft ausschließlich
  die Store-Metadaten (Name/Beschreibung/Tooltip). Die Bedienoberfläche läuft
  weiter über `lib/i18n.js` (eigener Umschalter, nicht an die Browsersprache
  gekettet). Der Kopfkommentar dort erklärt, warum.
- **Stiller Update-Charakter bleibt:** `default_locale` ist Deutsch, die
  deutschen Texte sind Byte-für-Byte die alten – bestehende Nutzer sehen keinen
  veränderten Namen und keinen Zustimmungsdialog (keine neue Berechtigung).
- Der Markenname **„WohnungsBewerber" bleibt in beiden Sprachen** gleich; die
  englischen Suchbegriffe stecken in der Kurzbeschreibung („rental application
  letter … in German … English form … local & free", 122/132 Zeichen).
- Englische Listing-Texte (ausführliche Beschreibung, Single-Purpose,
  Berechtigungs-Begründungen) liegen fertig in `STORE-LISTING.md` §7 – im
  Dashboard unter der Sprache „English" einzufügen.

## 2.5.0 — 2026-07-23 · Englische Oberfläche (englische UI, deutsche Briefe)

Schließt das Conversion-Leck des englischen Website-Trichters
(`SESSION-2026-07-22-ENGLISCHER-MIRROR.md`, Punkt 1): Wer über `/en/` kommt und
kein Deutsch spricht, stand bisher vor einer komplett deutschen Erweiterung.

- **Neu: `lib/i18n.js`** – eigenes Wörterbuch (306 Einträge, `de`/`en`
  nebeneinander) mit `t()`, `apply()` für `[data-i18n*]`-Attribute und
  Sprachwechsel-Ereignis. Bewusst **nicht** `chrome.i18n`/`_locales`: das folgt
  starr der Browsersprache und ließe sich vom Nutzer nicht umschalten.
- **Sprachschalter** im Kopf des Dashboards (Pill „EN"/„DE" neben dem
  Hell/Dunkel-Schalter, wie auf wohnungsbewerber.app). Gespeichert als
  `wba_lang`, wirkt **ohne Reload** und in allen Kontexten gleichzeitig – ein
  offenes Portal-Overlay wechselt per `chrome.storage.onChanged` sofort mit
  (von Hand geänderter Entwurfstext bleibt dabei erhalten).
- **Übersetzt sind:** Dashboard (alle fünf Reiter, Onboarding, Validierungs- und
  Statusmeldungen, Toasts, Verlauf, Unterlagen-Checkliste, KI-Einstellungen und
  ‑Fehlertexte), das Overlay auf den Portalseiten (Trefferliste, Anzeige,
  Durchlauf, Abschluss, Suchhinweis), CSV-Export (Kopfzeile, Statuswörter,
  Datumsformat, Dateiname) und der ICS-Termin.
- **Deutsch bleibt, was an die Vermietung geht** – das ist der eigentliche
  Produktwert (englische Oberfläche → deutsche Ausgabe): Anschreiben, Anrede
  („Sehr geehrte Frau …"), Nachfass-Text und die Mieterselbstauskunft. Die
  Ton-Werte (`standard/formal/kurz/…`) und Tracker-Status bleiben als
  Speicher-Schlüssel deutsch, nur ihre Beschriftung wechselt. Die Invariante
  steht im Kopf von `lib/i18n.js` und wird von `tests/i18n.test.js` geprüft.
- **Nur in der englischen Fassung** erscheinen drei Hinweise, die deutsche
  Nutzer nicht brauchen (`data-i18n-only="en"`): dass der Brief auf Deutsch
  geschrieben wird, dass die Selbstauskunft ein deutsches Formular ist, und
  dass die Portale „Cologne"/„Munich" nicht kennen, sondern nur „Köln"/„München".
- **Sprachwahl beim Start:** Neuinstallationen folgen der Browsersprache
  (englischer Browser ⇒ englische Oberfläche). Bestehende Installationen werden
  beim Update hart auf Deutsch festgeschrieben (`background.js`), damit niemand
  nach einem Update unerwartet vor englischen Knöpfen sitzt.
- **CSS-Korrektur:** `[hidden]` gilt jetzt `!important`. Klassen wie `.note`
  setzen `display: flex` und schlugen sonst die UA-Regel – ein nur für die
  englische Fassung gedachter Hinweis wäre als leerer Kasten in der deutschen
  Oberfläche stehen geblieben.
- **Popup:** Die englische Beschriftung des Mini-Launchers steht in `popup.js`,
  **nicht** als eingebettetes Skript in `popup.html` – Manifest V3 erzwingt
  `script-src 'self'` und blockiert eingebettete Skripte (sie landen als roter
  „Fehler" auf `chrome://extensions`). Sie folgt der Browsersprache, weil sich
  der Launcher schließt, bevor ein `chrome.storage`-Lesen zurückkäme.
- **Tests:** neu `tests/i18n.test.js` (65 Prüfungen: Wörterbuch-Vollständigkeit,
  keine unbekannten Schlüssel in HTML/JS, gleiche Platzhalter in beiden
  Sprachen, und die harte Invariante „englische Oberfläche → deutscher Brief"
  über 5 Töne × 20 Durchläufe = 100 Briefe je Testlauf). Zusätzlich eine
  CSP-Prüfung aller Erweiterungs-Seiten auf eingebettete Skripte und
  `onclick=`-Handler – genau der Fehler, der oben beim Popup passiert ist.
  `tests/salutation.test.js` deckt die Badge-Texte in beiden Sprachen ab.
  Gesamte Suite grün: 1850 Prüfungen.

Keine Änderung am Sende-Verhalten (weiterhin nie automatisch), an der
Portal-Logik oder an den Textbausteinen des Generators.

## 2.4.5 — 2026-07-16 · Audit-Feinschliff (Datenschutz, Vereinfachung, a11y)

Umsetzung der Quick Wins aus dem Voll-Audit (`AUDIT/REPORT.md`):

- **Datenschutzerklärung korrigiert:** Die Berechtigung `activeTab` wird nicht
  mehr aufgeführt (sie wurde längst aus `manifest.json` entfernt) – Doku und
  tatsächliche Berechtigungen stimmen wieder überein (F-SEC-3). Verbleibende
  Berechtigungen: `scripting`, `storage`, `tabs`.
- **KI-Backend-Modus entfernt:** Die ungenutzte Experten-Option „Eigenes Backend
  (Endpoint-URL)" ist raus (aus `dashboard.html`, `dashboard.js`, `lib/ai.js`).
  Es gibt nur noch „Aus" (eingebaute Vorlage, Standard) und „Claude direkt
  (eigener API-Schlüssel)". Weniger Code, kleinere Angriffsfläche, keine frei
  setzbare Fetch-URL mehr. Ein evtl. alt gespeicherter Backend-Modus fällt sauber
  auf die eingebaute Vorlage zurück.
- **Barrierefreiheit:** Der Bewerbungen-Statusfilter und der Hell/Dunkel-Schalter
  haben jetzt ein `aria-label` (Screenreader-Namen).

Keine Änderung am Sende-Verhalten (weiterhin nie automatisch) und an der
Portal-Logik.

## 2.2.2 — 2026-07-11 · SCHUFA-Schutz-Schalter + totes Profilfeld raus

- **Neuer Schalter im Unterlagen-Tab: „Meine SCHUFA ist negativ – oder ich
  habe keine."** (gespeichert als `docs.noSchufa`). Wirkung auf drei Ebenen:
  (1) Checkliste verlangt keine SCHUFA mehr und bietet stattdessen die
  Bürgschaft als Alternative an (ohne Duplikat beim Azubi-Profil);
  (2) Vorlagen-Generator: `letter.docsList` filtert SCHUFA hart – auch wenn
  `docs.schufa` aus früherem Abhaken noch true ist (das Aktivieren des
  Schalters setzt es zusätzlich zurück); (3) KI-Prompt: SCHUFA aus der
  Unterlagen-Liste gefiltert UND explizites Verbot („unter KEINEN Umständen,
  auch nicht indirekt") als Insurance gegen Bonitäts-Formulierungen des
  Modells. Tests: Suite 5c (20 Vorlagen-Texte SCHUFA-frei trotz schufa:true,
  übrige Unterlagen bleiben erwähnbar, Prompt-Checks) – 503 Letter-Tests.
- **Profilfeld „Anrede / Form" (gender) entfernt:** floss nirgends in
  Anschreiben oder Selbstauskunft ein – totes Formularfeld, das nur
  Ausfüllarbeit vortäuschte. Alte gespeicherte Werte bleiben harmlos im
  Storage liegen; Profil-Fortschritt rechnet jetzt mit 13 Feldern.
- Gotcha dieser Runde: ASCII-Anführungszeichen in einem deutschen
  Prompt-String hätten den String vorzeitig beendet (Syntaxfehler) –
  typografische Zitate in JS-Strings nur als „…" oder ganz weglassen.

## 2.2.1 — 2026-07-11 · Dopplungen entfernt (Nutzer-Feedback)

Nutzer-Feedback zum Suchen-Tab: „Profil" (Nav) und „Profil ausfüllen"
(Schrittleiste) wirken doppelt. Analyse ergab VIER Elemente, die dasselbe
sagten, plus einen doppelten Ton-Regler:

- **Onboarding konsolidiert:** Willkommens-Banner (`#welcome`), Schrittleiste
  (`#stepGuide`) und „Profil unvollständig"-Pill (`#profileReadyPill`) →
  EINE Onboarding-Karte (`#onboarding`: Begrüßung + 3 Schritte + „Beispiel
  ansehen"/„Profil ausfüllen"). Sichtbarkeits-Regel: erscheint NUR, solange
  kein Name im Profil steht; danach verschwindet sie komplett – der
  Profil-Tab in der Navigation ist dann der einzige Einstieg. Für erfahrene
  Nutzer belegt die Schrittleiste keinen Platz mehr; das „Schritt 1 = ✓
  grün"-Toggeln samt `.step.done`-CSS entfiel (Karte ist dann ohnehin weg).
- **EIN Ton-Zustand:** „Ton der Anschreiben" (Suchen-Tab) und die Moduswahl
  (Anschreiben-Tab) steuerten dieselbe Sache mit getrenntem Zustand –
  Durchlauf und Einzel-Anschreiben konnten unbemerkt verschiedene Töne
  nutzen. Neu: `setTone()` synchronisiert beide Regler und persistiert in
  `filters.ton` (Moduswahl-Klick speichert jetzt auch; Dropdown-Wechsel
  aktualisiert die Moduswahl; `loadFilters`/`startSearch` nutzen setTone).

## 2.2.0 — 2026-07-11 · Sofort-Demo + Bewerbungs-Cockpit

Zwei Feature-Pakete für Aktivierung (Neu-Installierer sollen den Wert in
< 60 s SEHEN) und Retention (Tracker wird vom Protokoll zum aktiven Cockpit).
Plan + Scope-Entscheidung mit dem Nutzer abgestimmt; Anzeigen-Wächter bewusst
nur als Konzept dokumentiert (siehe Plan-Datei), Duplikat-Warnung /
Wachstums-Bausteine / englische UI auf später verschoben.

### Sofort-Demo (dashboard)

- Neuer Button „Beispiel ansehen" im Welcome-Banner + „Beispiel laden" im
  Anschreiben-Tab: lädt eine realistische Beispiel-Anzeige (Köln-Ehrenfeld,
  Chips + Anrede „Frau Weber" springen sichtbar an) und erzeugt SOFORT ein
  Anschreiben – mit dem echten Profil, falls vorhanden, sonst mit Demo-Profil
  „Max Mustermann" (Hinweis + Link zum Profil).
- Bewusst: IMMER der eingebaute Generator (nie KI → keine Kosten/Latenz),
  KEIN saveFlat/pushHistory (Demo hinterlässt keine Daten), Doppelklick-Guard.

### Bewerbungs-Cockpit (Tracker)

- **Neuer Status „Besichtigung"** inkl. Filter-Option, Badge-Farbe
  (`.status-besichtigung`), Termin-Feld (`datetime-local`, gespeichert als
  `besichtigung` am Eintrag) und **ICS-Export** („In Kalender", VEVENT mit
  lokaler floating time, 45 min, LOCATION=Ort, DESCRIPTION=URL). Zählt in
  `hasApplied`/Durchlauf-Filter als beworben (zentrale Liste
  `store.APPLIED_STATUS`). CSV-Export um Besichtigungs-Spalte ergänzt.
- **Nachfass-Erinnerung:** `upsertTracker` stempelt beim ERSTEN Wechsel auf
  „beworben" zentral `appliedAt` (deckt content.js UND Dashboard ab). Nach
  `FOLLOWUP_AFTER_DAYS` (4, lib/config.js) ohne Antwort zeigt die Zeile
  „Seit X Tagen keine Antwort" + Button **„Nachfassen"**: kopiert einen
  höflichen Nachfass-Text (**neu: `WBA.letter.followUp(entry, profile)`**,
  je Tonlage 3 Blacklist-freie Varianten, nennt Ort + Bewerbungsdatum),
  merkt `followupAt` (kein erneutes Nag, Anzeige „Nachgefasst vor X Tagen")
  und öffnet die Anzeige – gesendet wird weiterhin nur vom Nutzer selbst.
- **Antwortquote-Statistik** über der Liste (unabhängig vom Filter):
  „X beworben · Y Antworten (Z %) · W Besichtigungen"; Antworten =
  antwort + besichtigung. Empty-State löscht die Statistik nicht mehr
  (append statt innerHTML) und benennt aktive Filter.

### Tests

- `tests/letter.test.js`: neue Suite 5b für `followUp` (Anrede je Tonlage,
  Name/Ort/Datum, Blacklist-frei, < 70 Wörter, Fallbacks) – 497 statt 190
  Letter-Tests; dabei zwei Grammatikfehler in Varianten gefixt
  („interessiert an + Akk." → umformuliert).

## 2.1.2 — 2026-07-11 · Robustheits-Audit (2. Runde)

Zweites vollständiges Code-Audit mit Fokus auf reale Nutzungs-Edge-Cases.
Alle Änderungen im Browser-Preview (tests/fixtures/overlay-demo.html) bzw.
per Unit-Tests verifiziert; alle 1452 bestehenden Tests bleiben grün.

### Behoben (Datenverlust / Korrektheit)

- **Nachrichtenfeld wird nie mehr ungefragt überschrieben** (content.js,
  `setDraftIntoForm`): Stand im Portal-Formular bereits Text (selbst getippte
  Nachricht, Chat-Antwort, Entwurf nach Reload), hat das Auto-Befüllen ihn
  ersetzt – ebenso „Neu" und die Anrede-Korrektur. Jetzt wird nur noch
  EIGENER, zuvor selbst eingefügter Text still aktualisiert; fremden Text
  ersetzt ausschließlich der explizite „Einfügen"-Klick. Neues Status-Feedback:
  „Im Nachrichtenfeld steht bereits Text – ich habe nichts überschrieben."
- **Profil-Autosave** (dashboard.js, 600 ms entprellt): Tab schließen ohne
  „Profil speichern" verlor bislang still alle Eingaben. Der Button bleibt als
  explizite Bestätigung; „Zurücksetzen" bricht ausstehende Autosaves ab.
- **SPA-Race in handleListing** (content.js): Navigiert die Seite während der
  KI-Anfrage bzw. des Formular-Wartens weiter (Immowelt/ImmoScout pushState),
  landeten Overlay, Formulartext und Tracker-Eintrag der ALTEN Anzeige auf der
  neuen. Jetzt URL-Guard an beiden await-Grenzen.
- **Verschluckte Erkennung** (content.js `runDetection`): Ein URL-Wechsel
  während einer laufenden Erkennung wurde ignoriert → neue Seite blieb ohne
  Overlay. Wird jetzt nach Abschluss nachgeholt (`redetect`-Flag).
- **Such-Hinweis-Timer** (content.js `showSearchHint`): Der 12-s-Aufräum-Timer
  konnte ein inzwischen gemountetes Listing-Overlay entfernen → entfernt nur
  noch den Hinweis selbst (`panel.dataset.view`-Marker).
- **Abgelaufene Durchläufe** (config `RUN_EXPIRY_MS` = 12 h): Ein nie
  gestoppter Run (Tabs einfach geschlossen) zeigte Tage später noch
  „Anzeige 3/12" und sprang beim „Gesendet"-Klick weiter. Runs älter als 12 h
  werden beim Laden deaktiviert.

### Sicherheit / Berechtigungen

- **Host-Berechtigungen auf `https://` verengt** (manifest.json,
  host_permissions + content_scripts): `*://` schloss unnötig http ein.
  Narrowing ist update-sicher (keine neue Berechtigungs-Abfrage).
- **API-Key nicht mehr im Content-Script-State** (content.js): Statt der
  kompletten KI-Settings hält das Content-Script nur noch das Boolean
  `aiReady`. Der Key existiert damit ausschließlich in Service-Worker und
  Dashboard (Defense-in-Depth; die isolierte Welt schützte auch bisher).

### UX / Fehlerdiagnose

- **„KI testen" erklärt Fehler** (dashboard.js `aiErrorText`,
  ai.js `requestDetailed`): statt pauschal „Keine Antwort" jetzt konkrete
  Hinweise für 401 (Schlüssel abgelehnt), 404 (Modell/Endpoint), 429
  (Rate-Limit), 5xx, Timeout und Netzwerk-/CORS-Fehler.
- **Tracker-Einträge löschbar** (dashboard.js + store.removeTracker mit
  Write-Lock): Fehlklicks/erledigte Wohnungen lassen sich entfernen; vorher
  wuchs die Liste unbegrenzt und ungefiltert.
- **„Aus offener Anzeige laden"**: toter Fallback auf Nicht-Portal-Tabs
  entfernt (executeScript scheitert dort mangels Host-Recht immer und
  erzeugte nur „Konnte den Tab nicht lesen"); bei mehreren Portal-Tabs
  gewinnt jetzt der zuletzt benutzte.
- **Orphaned Content-Scripts** (nach Extension-Update): „Profil ausfüllen"/
  „Zu den Bewerbungen" starben still an „Extension context invalidated" –
  jetzt Fangnetz + Hinweis „bitte Seite neu laden".
- **Doppelklick-Guards**: „Suche starten" (öffnete sonst alle Portal-Tabs
  doppelt) und „Durchlauf starten"; Status meldet zudem ehrlich, wenn kein
  Tab geöffnet werden konnte.
- **Popup**: `lastError`-Checks + Fallback (Tab zwischen query und update
  geschlossen → neuer Tab statt stiller Konsolenfehler).

### Performance

- „Durchlauf starten" las den Tracker einmal PRO Treffer (100 Treffer =
  100 Storage-Reads der Gesamtliste). Jetzt ein Read + Set-Lookup.

## 2.1.1 — 2026-07-10 · Store-Link eingetragen

Die Erweiterung ist im Chrome Web Store freigegeben (ID
`fgcagcmjhmlghmndobjkocddmbjjnnob`). `STORE_URL` in `dashboard.js` gesetzt →
der „Bewerten"-Button im Footer ist nicht mehr `hidden` und verlinkt auf
`…/reviews`. Lokal verifiziert (Button sichtbar, korrekter href, keine
Konsolenfehler). Sonst keine Code-Änderung.

## 2.1.0 — 2026-07-09 · Design-Überarbeitung „Ruhig & professionell"

Nutzer-Feedback: Das Design wirkte insgesamt störend/unruhig. Analyse ergab
vier Ursachen: der Marken-Verlauf lag auf fast jedem Element, Emojis in jedem
Button/Tab, gestapelte Deko-Effekte (animierter Glow + Glassmorphism +
Glanzkanten + farbige Schweb-Schatten) und ein Overlay mit 7+ gleichwertig
gestylten Buttons ohne Hierarchie. Richtung (mit der Nutzerin abgestimmt):
Markenfarbe behalten, aber beruhigen; Emojis durch Icons ersetzen;
Dashboard UND Overlay.

### Design-Prinzipien (umgesetzt)

- **Verlauf nur noch an 3 Stellen:** Logo-Kachel, aktiver Nav-Tab,
  Primär-Button. Alles andere: neutrale Flächen + dezenter Accent-Tint
  (`--tint`). Titel wieder in Textfarbe.
- **Neutrale, weiche Schatten** statt farbiger Leucht-Schatten; Hover über
  Border/Tint statt Hüpf-Transforms; Hintergrund-Glow statisch und halbiert
  (Drift-Animation entfernt); Glassmorphism nur noch auf der sticky Nav;
  Karten-Glanzkante entfernt.
- **Radius-Skala als Tokens** (`--r-s/-m/-l` = 8/12/16 px) statt 8 wilder
  Radien; Schriftgewichte auf 400/600/700 begrenzt.
- **NEU `lib/icons.js`:** ~25 schlichte Inline-SVG-Icons (stroke:
  currentColor, ohne externe Bibliothek) ersetzen ALLE Emojis in Dashboard,
  Overlay und Popup — einheitlich auf jedem System. Statische Strings,
  innerHTML-sicher, funktionieren auch im Shadow DOM.
- Theme-Umschalter ist jetzt ein runder Icon-Button (Sonne/Mond) statt
  „Dark"-Checkbox (gleiche Logik/ID); Toasts als ruhige Karten-Pillen statt
  Gradient; Chips ohne Emojis, nur Text (inkl. Preis-Label, z. B.
  „950 € Kaltmiete").

### Overlay: klare Aktions-Hierarchie (wichtigster UX-Fix)

Statt 7 gestapelter, fast identischer Buttons jetzt vier klar getrennte Ebenen:
1. Werkzeug-Reihe klein (Einfügen · Neu · Kopieren, mit Icons),
2. **EIN Primär-Button** „Prüfen & senden" (Verlauf),
3. Durchlauf-Reihe in Erfolgs-Grün („Gesendet · Nächste" + „Überspringen"),
4. „Durchlauf stoppen" als dezenter Text-Link.
Dazu: neutraler Kopf mit kleiner Gradient-Logo-Kachel + Versions-Chip,
Icon-Fensterknöpfe, aufgeräumte Anrede-Zeile. Alle `data-act`/`data-el`-Hooks
und die gesamte Logik unverändert.

### NEU `tests/fixtures/overlay-demo.html`

Demo-Anzeigenseite, die das ECHTE Overlay (content.js) im Preview rendert
(Demo-Portal-Adapter + gemockte Store-Getter, inkl. simuliertem Durchlauf) —
Design-Änderungen sind damit ohne Portal-Login prüfbar; dauerhaft nützlich.

### Verifikation

- Alle 4 Test-Suiten grün (29 + 71 + 190 + 1162 — reines Styling, keine Logik);
  Syntax-Check aller geänderten Dateien; keine verbleibenden Emojis in
  dashboard.html/js und content.js (automatisch geprüft).
- Preview: Dashboard in Hell UND Dunkel geprüft (Tabs, Chips, Generieren-Flow,
  Toast); Overlay-Demo in Hell UND Dunkel geprüft inkl. Interaktionen
  („Neu" liefert anderen Text; Anrede-Dropdown tauscht die Zeile in Entwurf
  UND Formular; Senden-Knopf der Seite pulsiert). Keine Konsolenfehler.
- Version **2.1.0**.

## 2.0.3 — 2026-07-09 · KRITISCH: ld+json-Leck + Ablöse-als-Miete (forensisch belegt)

**Live-Befund (dieselbe Bochum-Anzeige wie 2.0.2, v2.0.2 aktiv):** Brief
behauptete „Garten und Einbauküche", Chips zeigten „2,5 Zi. · 70 m² · 300 €".
Diesmal wurde die ECHTE Seite per curl gezogen und Zeichen für Zeichen
analysiert — drei bewiesene Ursachen:

1. **ld+json wurde ROH übernommen** — das Loch, das das 2.0.2-Scoping überlebte:
   Kleinanzeigen bettet `ImageObject`-ld+json-Blöcke mit Titeln + Beschreibungen
   FREMDER Anzeigen ein (belegt: „2,5-Zimmer-DG in **Herne**",
   „**Garten**mitbenutzung" in Gelsenkirchen, „**Einbauküche**" GE-Beckhausen —
   auf einer Bochumer Anzeige!). → **Fix:** ld+json wird nie mehr als Rohtext
   angehängt. Es wird JSON-geparst und NUR die eindeutige Haupt-Entität
   (Product/Offer/RealEstateListing/Apartment/…) mit Name, Beschreibung,
   beschriftetem Preis („Miete: X €"), Zimmer, Wohnfläche, PLZ/Ort übernommen.
   `ImageObject`/`WebSite`/Listen werden ignoriert; bei 0 oder mehreren
   Kandidaten fail-safe: gar nichts.
2. **„300 €" war die MÖBELABLÖSE dieser Anzeige** („Gegen einen Abschlag von
   300 € müssen folgende Möbel übernommen werden") — größter Betrag gewann.
   → **Fix:** Kosten-Rauschen um Abschlag/Abstand/Übernahme/Möbel/Renovierung
   erweitert; Auswahl-Reihenfolge jetzt Kaltmiete → Warmmiete → „Miete/Preis"-
   Label → ERSTER Betrag im gescopten Text (das Preisfeld der Anzeige steht
   vorn) statt „größter Betrag".
3. **Kontextfenster-Übersprechen:** Bei nahe beieinanderstehenden Beträgen
   („Kaution 1500 €. Miete: 620 €") färbten sich die Labels gegenseitig ein
   (620 erbte „Kaution", 1500 erbte „Miete"). → **Fix:** Kontext wird an den
   Nachbar-Beträgen abgeschnitten; ein Label NACH dem Betrag zählt nur, wenn
   nicht unmittelbar der nächste Betrag folgt. (Von Test 28 aufgedeckt.)

**Einordnung der übrigen Werte (kein Fehler):** „70 m²", „3 Zimmer",
„Warmmiete 230 €" und die Merkmale Einbauküche/Altbau/Keller stehen
NACHWEISLICH in dieser Anzeige selbst (Detailliste + Ausstattungs-Tags der
Inserentin; das 270-€-Anzeigenpreisfeld widerspricht ihrer eigenen
Warmmiete-Angabe von 230 € — wir folgen dem explizit beschrifteten Feld).

### Verifikation

- **End-to-End gegen die ECHTE Seite** (223-KB-Snapshot der gemeldeten URL im
  Browser geladen, parse.js injiziert): Extrakt enthält KEINES der
  Fremdwörter (Gartenmitbenutzung/Herne/Rotthausen/2,5-Zimmer/Terrasse);
  Ergebnis: 230 € Warmmiete, 3 Zi., 70 m², Bochum, Merkmale nur die von der
  Inserentin angehakten (EBK/Altbau/Keller).
- Fixture `tests/fixtures/extraction.html` auf die echte Seitenstruktur
  nachgerüstet (ImageObject-ld+json mit Fremdanzeigen, Möbelablöse-Satz,
  Haupt-Entität für den Positiv-Pfad): `"PASS": true` in beiden Pfaden
  (scoped + Titel/Meta-Fallback).
- `tests/parse.test.js` um 5 Preis-Tests erweitert (Ablöse, Abstand,
  Erster-statt-Größter, „Miete:"-Label, Kaltmiete-Priorität) — **29 Tests**;
  alle Suiten grün: **29 + 71 + 190 + 1162**.
- Version **2.0.3**.

## 2.0.2 — 2026-07-09 · KRITISCH: Extraktion las Fremdinhalte („Terrasse"-Bug)

**Live-Befund (Kleinanzeigen, WG-Zimmer Bochum, 270 €):** Das Anschreiben
behauptete „Die Terrasse macht das Ganze für mich perfekt" — die Anzeige hat
keine Terrasse; die Chips zeigten „2.5 Zi. · 70 m² · 320 €" statt der echten
Werte. **Root Cause:** `parse.pageExtractor()` las `document.body.innerText`
der GESAMTEN Seite — Texte aus „Ähnliche Anzeigen", „Weitere Anzeigen des
Nutzers" und Werbemodulen flossen in die Extraktion ein, als stünden sie in
DER Anzeige. Betraf potenziell alle 5 Portale und alle abgeleiteten Stellen
(Chips, Brief-Descriptor, Feature-Bezug, „frei ab", Tracker-Metadaten).

### Fix 1 — Anzeigen-Scoping der Extraktion (fail-safe)

- `pageExtractor(contentSel)` liest nur noch strukturell anzeigen-eigene
  Quellen: (1) die per neuem Adapter-Feld **`contentSel`** benannten Bereiche
  der Detailseite (Titel, Preis, Eckdaten, Beschreibung, Ausstattung) und
  (2) immer `document.title`, `og:title/description`, `meta description`,
  `ld+json`. Der Ganzseiten-Text entfällt ersatzlos. Trifft `contentSel`
  nichts (Portal-Umbau, WG-Gesucht-Composer), wird NUR Quelle (2) genutzt —
  schlimmstenfalls eine dünnere Extraktion und ein generischerer Brief,
  nie ein Fremd-Datum. Bewusst KEIN „Body minus Störbereiche"-Fallback:
  Blocklisten gegen unbekannte Empfehlungs-/Werbemodule sind nicht verlässlich
  genug für „es darf kein Fehler passieren".
- `contentSel` je Portal gepflegt (kleinanzeigen `#viewad-*`, ImmoScout
  `[class*="is24qa-"]` + `#expose-title`, Immowelt/Immonet Aviv-CDP-Testids,
  WG-Gesucht Beschreibungs-/Facts-Panels); PortalAdapter-Typedef ergänzt.
- Aufrufer umgestellt: `content.js` (handleListing/currentFlat, mit Debug-Log
  „scoped vs. Titel/Meta-Fallback") und Dashboard „Aus offener Anzeige laden"
  (`executeScript` mit `args: [contentSel]` — `pageExtractor` bleibt
  self-contained/serialisierbar).

### Fix 2 — Negations-Schutz für Ausstattungs-Merkmale

„keine Terrasse", „ohne Balkon", „Aufzug: nein", „nicht saniert" zählen nicht
mehr als vorhandenes Merkmal. Die Verneinung wirkt bis zur nächsten Satz-/
Komma-Grenze („kein Stellplatz oder Garage" verneint auch die Garage;
„keine Terrasse, aber Balkon" lässt den Balkon positiv). Ein Merkmal zählt
nur, wenn mindestens ein unverneintes Vorkommen existiert.

### Verifikation

- **NEU `tests/parse.test.js` (24 Tests):** 8 Negations-Fälle, positive
  Gegenproben, gemischte Sätze, komplette Extraktions-Regression inkl. des
  gemeldeten WG-Zimmer-Falls (270 € gewinnt, keine verneinten Merkmale) und
  der Jahreszahl-Absicherung aus 1.7.1. Der Test „kein Stellplatz oder
  Garage" deckte dabei die Skopus-Lücke auf, die direkt mitbehoben wurde.
- **NEU `tests/fixtures/extraction.html`:** nachgebaute Kleinanzeigen-Seite
  (Anzeige OHNE Terrasse; „Ähnliche Anzeigen"/Werbung MIT Terrasse, 2,5 Zi.,
  70 m², 320 €). Im Browser geprüft: scoped-Pfad extrahiert 270 €/14 qm/
  Bochum/sofort/nur Einbauküche; Fallback-Pfad enthält keinerlei Fremd-Daten;
  Selbst-Check der Seite: `"PASS": true`.
- Dashboard-Regression im Preview: Chips korrekt, Brief ohne Terrasse/Balkon
  trotz (verneinter) Wörter im Text, Einbauküche erlaubt; keine Konsolenfehler.
- Alle Suiten grün: **24 + 71 + 190 + 1162 Prüfungen**.
- TESTING.md: neuer Pflicht-Punkt je Portal („Chips + Brief-Details
  entsprechen DIESER Anzeige") + Regressionsfall mit der gemeldeten URL.
- Version **2.0.2**.

## 2.0.1 — 2026-07-09 · Anrede-Fixes nach Live-Test (ImmoScout & Kleinanzeigen)

Zwei im manuellen Test (TESTING.md) gefundene Anrede-Fehler behoben:

- **ImmoScout: „Sehr geehrter Herr Jens" (Vorname statt Nachname).** Drei Ursachen,
  drei Fixes:
  1. `resolveContact` nahm die ERSTE Quelle statt der besten. Jetzt werden alle
     Quellen gesammelt (`dom.sellerNames` liefert einen Kandidaten je
     Selektor-Gruppe; dazu der Fließtext-Fund) und `salutation.pickBest()` wählt:
     der vollständigste Frau/Herr-Name gewinnt („Herr Jens Trautmann" schlägt
     „Herr Jens"), Personen schlagen Firmenfelder. Neuer **Quellen-Merge** ohne
     Raten: „Herr Jens" + „Jens Trautmann" (andere Quelle) → „Sehr geehrter
     Herr Trautmann," (Geschlecht weiter nur aus explizitem „Frau/Herr").
  2. Die Ansprechperson erscheint bei ImmoScout oft erst MIT dem Kontakt-Modal —
     das Overlay löst die Anrede jetzt nach dem Öffnen des Formulars ERNEUT auf
     und übernimmt eine bessere Erkennung in die Anrede-Zeile von Entwurf und
     Formular (`salutScore`-Vergleich).
  3. Namens-Parsing gehärtet: Firmenwörter und Binnenmajuskel-Kürzel („BmB",
     „Bauträgerges.mbH") beenden die Namenssammlung — Firmenketten hinter dem
     Namen können den Nachnamen nicht mehr verdrängen (Doppelnamen und
     O'Brien-Apostrophe bleiben erlaubt).
- **Kleinanzeigen: „Klara Kiwitt" → nur „Neutral (ohne Namen)" im Dropdown.**
  Die neutrale Anrede war korrekt (kein explizites „Frau" → es wird nie
  geraten), aber die geforderte 1-Klick-Korrektur war unmöglich. `classify()`
  liefert bei wahrscheinlichen Privatpersonen jetzt die Namensbestandteile mit
  (`personLike`, Kategorie bleibt neutral): Das Badge lädt aktiv ein
  („unsicher: ‚Klara Kiwitt' – Anrede bitte wählen") und das Dropdown bietet
  „Frau Kiwitt / Herr Kiwitt / Familie Kiwitt / Hallo Klara / Neutral" an.
- Anbieterbox-Stör-Wortliste erweitert („Identität", „verifiziert",
  „Zufriedenheit", „Premium" …); Debug-Log der Anrede-Kandidaten
  (`WBA.CONFIG.DEBUG = true`).
- **Generator-Beifang aus der Qualitäts-Suite:** ein formales
  Selbstvorstellungs-Skelett erzeugte „…, 68 Jahre alt,." ohne Berufsangabe
  (Komma saß im falschen Segment) — behoben. Zusätzlich Reserve-Baustein fürs
  Längen-Fitting: rutscht ein Text durch die Descriptor-Varianz unter den
  Korridor, wird ein zweiter (anderer) Zusatz-Satz aktiviert.
- **Tests:** Anrede-Suite auf 71 Fälle erweitert (Regressionstests für beide
  Live-Befunde, `pickBest`-Szenarien inkl. Merge- und Nicht-Merge-Fällen,
  Badge-Korrektur-Text); alle Suiten mehrfach grün (71 + 190 + 1162).
- Version **2.0.1**.

## 2.0.0 — 2026-07-09 · Qualität & Abschluss (Phase 4)

Abschluss-Release der Überarbeitung 1.7.0 → 2.0.0. **Gesamtbild der vier Phasen:**
1.7.1 = Bugfixes nach Voll-Audit (Race Conditions, SPA-Erkennung, Fehlerbehandlung,
stabile Tracker-IDs) · 1.8.0 = fail-safe Anrede-System (`lib/salutation.js`, nie
raten) · 1.9.0 = kompositorischer Textgenerator (Anti-Bot, Anti-Wiederholung,
ehrlich) · 2.0.0 = Refactoring, Test-Ausbau, manuelle Test-Checkliste.

### Refactoring

- **Zentrale Konstanten + Debug-Flag (`lib/config.js`, NEU):** Alle Timeouts,
  Drosselungen und Generator-Grenzwerte liegen jetzt in `WBA.CONFIG`
  (DETECT/FORM/SEARCH_FORM-Timeouts, MutationObserver-Drosselung,
  URL-Watcher-Entprellung, KI-Timeout, TEXT_HISTORY_SIZE/OVERLAP_LIMIT/
  MAX_ATTEMPTS). Verbraucher (content.js, ai.js, letter.js, store.js) lesen
  daraus mit sicheren Fallbacks. Wird in allen Kontexten als erstes Modul
  geladen (manifest, importScripts, dashboard.html).
- **Konsistentes Logging (`WBA.log`):** einheitliches `[WBA]`-Präfix;
  `error`/`warn` erscheinen immer, `debug` nur mit `WBA.CONFIG.DEBUG = true`
  (zur Laufzeit in der Konsole umschaltbar). Bisher stumme Fehlerpfade
  (KI-Fehlschlag, verworfener KI-Text, Suchmasken-Abbruch, Fingerprint-
  Speicherung, aiGenerate im Service-Worker) melden sich jetzt im Debug-Modus;
  Storage-Warnungen laufen über `WBA.log.warn`.
- **Portal-Adapter-Pattern formalisiert:** Der Adapter-Vertrag ist als
  `@typedef PortalAdapter` in `lib/portals.js` dokumentiert (alle Pflicht-/
  Optional-Felder mit Bedeutung). Neues Portal = ein neues Objekt, kein
  weiterer Codepfad.
- **JSDoc** für die öffentlichen APIs: `salutation.classify/greeting/badge`,
  `letter.buildLetter/generate/containsBlacklisted`, `portals.byId/forUrl` +
  Adapter-Typedef, `store.upsertTracker/hasApplied/getTextFPs/pushTextFP`,
  `ai.isConfigured/buildPrompt/fetchWithTimeout`, `content.waitFor`.

### Generator-Feinschliff (Anti-Wiederholung verschärft)

Der Härtetest (identes Profil + identische Anzeige, 8 Texte in Folge je Tonlage)
zeigte bei der Tonlage „Kurz" zu hohe Trigramm-Überlappung — kurze Texte
bestanden zu großem Teil aus fixen Bestandteilen. Drei Variationsquellen
ergänzt (ohne Fakten zu verändern):
- Wohnungs-Descriptor in wechselnder Detailtiefe (voll / ohne Größe / nur Ort /
  nur Zimmerzahl) statt immer des vollen Wortlauts,
- Anzeigen-Details in wechselnder Auswahl und Reihenfolge (1–2 Details),
- Haushalts-Zeile (Personen/Haustiere) mit je 3 Formulierungsvarianten.
Ergebnis: im Härtetest jetzt 40/40 Texte unter der 40-%-Grenze (vorher 33/40).

### Tests (jetzt 3 Suiten, 1409 Prüfungen)

- **NEU `tests/quality.test.js`:** erzeugt **100 Anschreiben** (20 je Tonlage,
  rotierend über 5 Profile inkl. Umlaut-Namen/Bürgergeld-frei/Rente/
  selbstständig, 4 Info-Sets, 5 Anrede-Klassen, 3 Unterlagen-Stände) und prüft
  hart: **Blacklist-Treffer = 0**; Überlappungs-Grenzwert eingehalten
  (generate()-Simulation, ≥ 90 % unter 40 % — aktuell 100 %); grammatisch
  korrekte Baustein-Verkettung (keine Platzhalter-Reste, keine doppelten
  Leerzeichen/Interpunktion, kein Kleinbuchstabe nach Satzende, Anrede endet
  mit Komma, keine leeren Absätze, ≤ 1 „!"); Umlaute korrekt (Namen wie
  „Gökçe Öztürk" unverändert, kein Mojibake, keine HTML-Entities).
  → **1162 Prüfungen bestanden.**
- Bestehende Suiten weiter grün: `tests/salutation.test.js` (57),
  `tests/letter.test.js` (190). Alle Suiten laufen ohne Toolchain
  (`osascript -l JavaScript tests/<datei>`) oder mit Node.
- Syntax-Check aller 11 JS-Dateien fehlerfrei.

### Doku & Release

- **NEU `TESTING.md`:** manuelle Test-Checkliste für alle 5 Portale
  (WG-Gesucht, Kleinanzeigen, ImmoScout24, Immowelt, Immonet) mit gemeinsamem
  Prüfschema (Trefferliste → Durchlauf → Formular → Tracker) plus
  portal-spezifischen Punkten (WG-Gesucht-Composer/informelle Anrede,
  Kleinanzeigen-Anbieterbox, ImmoScout-Öffner/Bot-Schutz, Immowelt-SPA-
  Navigation/React-Formulare, Immonet über den Immowelt-Adapter) sowie
  Anrede-Stichproben und Regressions-/Stabilitätsprüfungen.
- Version in `manifest.json`: **2.0.0**.

## 1.9.0 — 2026-07-08 · Kompositorischer Textgenerator (natürlich & maximal variant)

`lib/letter.js` wurde komplett neu gebaut: statt starrer Templates ein
kompositorisches Baustein-System. Überzeugungskraft kommt aus Konkretheit und
Struktur — der Generator erfindet und übertreibt NICHTS.

### Architektur

- **Bausteine:** Anrede (aus `WBA.salutation`) → Einstieg → Bezug zur Wohnung →
  Selbstvorstellung → Vertrauenssignale (+ Unterlagen) → Zusatz
  (Langfristigkeit/Sorgfalt) → Abschluss/CTA → Grußformel. Struktur folgt dem
  bewährten Muster „Wer bin ich → warum diese Wohnung konkret →
  Zuverlässigkeit → klarer Besichtigungswunsch".
- **8 Varianten pro Baustein und Tonlage** (5 Tonlagen × 7 Baustein-Pools,
  > 280 Formulierungen), die sich in Satzbau (Ich-/Nominal-/Adverbial-/Frage-
  Einstieg), Länge und Wortwahl echt unterscheiden.
- **Constraints bei der Auswahl:** keine zwei aufeinanderfolgenden Bausteine
  mit derselben Satzstruktur (Struktur-Tags); gemischte Satzlängen (sind alle
  gewählten Bausteine gleich lang, wird der CTA gegen eine andere Längenklasse
  getauscht); **maximal EIN Ausrufezeichen pro Text** (überzählige werden zu
  Punkten); pro Baustein wird nie zweimal hintereinander dieselbe Variante
  gewählt.
- **Ideal-Längen je Tonlage** (Kurz 60–90, Standard/Herzlich/Selbstsicher
  100–150, Formal 120–180 Wörter): ein Fitting-Schritt entfernt bzw. ergänzt
  optionale Bausteine (Zusatz → Unterlagen → Bezug), bis der Text im Korridor liegt.

### Anti-Bot-Regeln (hart)

- **Floskel-Blacklist** („hiermit bewerbe ich mich", „mein Interesse geweckt",
  „von Ihnen zu hören", „entspricht genau meinen Vorstellungen", „passt genau
  zu meiner Suche" u. a., normalisiert geprüft): Jeder generierte Text wird
  geprüft, bei Treffer wird neu komponiert. Die vom Nutzer geschriebene
  Profil-Beschreibung ist von der Prüfung ausgenommen (kein Zensieren von
  Nutzertext). **Auch KI-Texte** werden geprüft — enthält die KI-Antwort eine
  Floskel, greift der eingebaute Generator; zusätzlich bekommt die KI die
  Verbotsliste, die Ehrlichkeits-Regeln und die Ziel-Längen in den Prompt.
- **Konkreter Bezug statt Generik:** 1–2 echte Details aus der Anzeige
  (Ausstattung, Stadtteil, Einzugstermin) werden eingebaut — ausschließlich
  Details, die `parse.js` wirklich extrahiert hat.
- **Ehrlichkeit:** Beruf/Einkommen/Beschäftigung/Personenzahl/Haustiere nur,
  wenn im Profil vorhanden; bei kargem Profil bleiben es Zusagen („pünktliche
  Miete") statt Behauptungen. Frühere Varianten mit implizit erfundenen Fakten
  („nach vielen Besichtigungen", „das habe ich in meiner aktuellen Wohnung
  nicht") gibt es nicht mehr.
- **Natürliches Deutsch:** aktive Verben, alle Varianten unter 25 Wörtern pro
  Satz, keine Substantivierungsketten.

### Anti-Wiederholung über Bewerbungen hinweg

- `letter.generate()` (neu, async) prüft jeden Kandidaten per
  **Wort-Trigramm-Überlappung gegen die letzten 20 Texte** (Fingerprints als
  32-Bit-Hashes in `chrome.storage.local`, Key `wba_textfp`): Überlappung muss
  **< 40 %** zu jedem gespeicherten Text sein, sonst wird neu gewürfelt
  (max. 5 Versuche, danach der beste Kandidat). Der Fingerprint des gewählten
  Texts wird gespeichert — dadurch liefert „🎲 Neu" garantiert eine spürbar
  andere Variante (der eben angezeigte Text ist ja in der Historie).
- Fingerprint-Schreibzugriffe laufen über denselben Write-Lock wie der Tracker.

### Unterlagen nur, wenn vorhanden

- Der Unterlagen-Satz (SCHUFA, Selbstauskunft, Nachweise, …) erscheint **nur
  noch für Dokumente, die in der Unterlagen-Checkliste der Extension abgehakt
  bzw. erstellt wurden** (Content-Script und Dashboard reichen den
  Checklisten-Stand an Generator und KI-Prompt durch). Vorher wurde pauschal
  „SCHUFA + Selbstauskunft + Mietschuldenfreiheit" versprochen.

### Verifikation

- **Neue Test-Suite `tests/letter.test.js`: 190 Tests bestanden** — pro Tonlage
  Blacklist/Ausrufezeichen/Längenkorridor/Anrede/Satzlängen; Ehrlichkeit
  (leere Checkliste ⇒ keine Unterlagen-Erwähnung, karges Profil ⇒ kein
  erfundenes Einkommen/Beruf/Haustier, keine Extraktion ⇒ keine erfundenen
  Details); konkrete Details in ≥ 8/10 Texten; Anti-Wiederholungs-Simulation
  (≥ 8/10 Texte unter 40 % Überlappung); Reroll-Differenz.
- Bestehende Suiten weiter grün (57 Anrede-Tests), Syntax-Check aller Dateien.
- Live im Dashboard verifiziert: 3 aufeinanderfolgende Generierungen paarweise
  verschieden, Blacklist-frei, korrekte Anrede, ≤ 1 „!", keine
  Unterlagen-Erwähnung bei leerer Checkliste — nach Abhaken von SCHUFA +
  Selbstauskunft erscheint der Hinweis; keine Konsolenfehler.

## 1.8.0 — 2026-07-08 · Fail-safe Anrede-System (`lib/salutation.js`)

Grundprinzip: **Eine falsche Anrede ist schlimmer als eine neutrale — es wird nie
geraten.** Neues Modul `WBA.salutation` mit Klassifikation, Anrede-Text und
UI-Badge; überall angebunden (Content-Script, Brief-Vorlage, KI-Prompt, Dashboard).

### Neu

- **`lib/salutation.js`:** `classify(raw, opts)` ordnet die Ansprechperson genau
  einer Kategorie zu:
  - `frau`/`herr` — nur bei explizitem „Frau"/„Herr(n)" → „Sehr geehrte/r …";
    akademische Titel (Dr., Prof., …) werden übernommen, wenn — und nur wenn —
    sie im Text stehen; Nachnamen exakt (Bindestriche, Umlaute, Partikel
    „von/van/…"); HTML-Entities dekodiert, Whitespace normalisiert, Emojis entfernt.
  - `familie` — explizit „Familie X" → „Sehr geehrte Familie X,".
  - `firma` — GmbH/UG/KG/„GmbH & Co. KG"/Hausverwaltung/Makler/„Fa. …" u. v. m.
    → immer „Sehr geehrte Damen und Herren,".
  - `vorname` — NUR wenn der Kontext garantiert einen Vornamen liefert
    (`expectFirstName`, WG-Gesucht-Composer; inkl. Nicknames „Tom88",
    gekürzte Namen „Ina M.") → „Hallo {Vorname},".
  - `neutral` — alles Unsichere (voller Name ohne Frau/Herr, nur Nachname,
    englische Namen, „Eheleute", Sonderzeichen, leer) → tonabhängig
    „Guten Tag," (Standard/Kurz/Herzlich) bzw. „Sehr geehrte Damen und Herren,"
    (Formal/Selbstsicher).
- **Anrede-Badge + 1-Klick-Korrektur im Overlay:** Über dem Anschreiben-Entwurf
  zeigt ein Badge die erkannte Kategorie („✉️ erkannt: Frau Müller" grün /
  „neutral, da unsicher" orange). Daneben ein Dropdown (Frau X / Herr X /
  Familie X / Hallo X / Neutral): Die Auswahl tauscht die Anrede-Zeile im
  Entwurf UND im echten Kontaktformular aus — KI-generierter Text bleibt dabei
  erhalten (nur die erste Zeile wird ersetzt).
- **Dashboard:** „Aus Zwischenablage einfügen" / „Aus offener Anzeige laden"
  zeigen die erkannte Anrede-Kategorie in der Statuszeile. Handeingaben laufen
  weiter über die Felder Anrede + Name — Name OHNE gewählte Anrede bleibt
  jetzt neutral (vorher stiller Rückfall).
- **Unit-Tests:** `tests/salutation.test.js` mit **57 Fällen** (normale Namen,
  Doppelnamen, Titel, Firmen inkl. GmbH & Co. KG, nur Vorname/Nickname, Emojis,
  leere Felder, Familie/„Eheleute", englische Namen, Kleinschreibung,
  HTML-Entities, Tonlagen-Matrix). Läuft ohne Toolchain:
  `node tests/salutation.test.js` **oder**
  `osascript -l JavaScript tests/salutation.test.js` (macOS, aus dem Projekt-Root).

### Geändert / Entfernt

- **Vornamen→Geschlecht-Mapping ENTFERNT** (`parse.js`: `NAMES_M`/`NAMES_F`,
  `personFromName`, `firstNameForGreeting`): verstieß gegen das neue Verbot
  „niemals Geschlecht aus einem Vornamen ableiten". Ein Anbietername wie
  „Alexandra Berger" führte bisher zu „Sehr geehrte Frau Berger" — jetzt neutral.
- Die Kombi-Anrede „Sehr geehrte(r) Frau/Herr X," entfällt ebenfalls —
  unsichere Fälle werden neutral angeschrieben (Vorgabe 2e).
- `content.js resolveContact()` liefert jetzt eine Klassifikation statt loser
  Felder; `letter.greeting()` und `ai.buildPrompt()` konsumieren sie mit
  identischer Logik (KI erhält zusätzlich die Anweisung, keine Anrede/Titel zu
  erfinden). Dashboard-Handeingaben nutzen denselben Pfad.
- `manifest.json`/`background.js`/`dashboard.html`: `lib/salutation.js`
  eingebunden; Version **1.8.0**.

### Verifikation

- 57/57 Unit-Tests bestanden (JavaScriptCore).
- Integrations-Smoke-Test: Brief + KI-Prompt für alle 6 Kategorien inkl.
  Groß-/Kleinschreibung nach der Anrede, Legacy-Handeingabe-Pfad.
- Live im Dashboard (Preview-Server) verifiziert: „Frau Weber" → korrekt;
  „Alexandra Berger" ohne Anrede → „Guten Tag," (Standard) bzw.
  „Sehr geehrte Damen und Herren," (Formal); keine Konsolenfehler.

## 1.7.1 — 2026-07-08 · Bugfix-Release nach vollständigem Code-Audit

### Behoben (Race Conditions / Timing)

- **content.js — MutationObserver statt fester Timeouts (A1):** Die Erkennung
  von Einzelanzeige/Trefferliste wartete bisher pauschal 600 ms (+ ein Re-Check
  nach 1,5 s). Auf langsam rendernden SPA-Portalen (Immowelt, ImmoScout) blieb
  das Overlay dadurch oft aus. Neuer `waitFor()`-Helfer: beobachtet DOM-Mutationen
  (gedrosselt auf 250 ms) und löst aus, sobald die Seite erkennbar ist —
  Timeout-Fallback nach 9 s.
- **content.js — Kontaktformular-Suche per Observer (A2):** `retry()`-Polling
  (6 × 500 ms) beim Suchen des Nachrichtenfelds durch `waitFor(…, 5000)` ersetzt;
  später nachladende Formulare werden jetzt zuverlässig gefunden. Der
  `retry`-Helfer wurde entfernt (toter Code).
- **content.js — SPA-Navigation wird erkannt (A3):** Neuer URL-Watcher
  (MutationObserver + `popstate`/`hashchange`): Wechselt ein Portal client-seitig
  die Seite (z. B. Immowelt Trefferliste → Exposé per pushState), wird das alte
  Overlay entfernt, der Zustand neu geladen und die Erkennung erneut ausgeführt.
  Vorher lief das Content-Script nur einmal pro echtem Seitenladen.
- **store.js — Tracker-Schreibzugriffe serialisiert (A4):** `upsertTracker()`
  läuft jetzt hinter einem Promise-Lock. Vorher konnten sich zwei nahe
  beieinanderliegende Read-Modify-Write-Zyklen gegenseitig überschreiben
  (verlorene Einträge/Status im Bewerbungs-Tracker).
- **content.js — Suchmasken-Befüllung wartet auf das Formular (A5):** Vor
  `driveSearchForm` wird per `waitFor` auf ein gerendertes Eingabefeld gewartet
  (max. 4 s) statt pauschal 600 ms zu schlafen.

### Behoben (Fehlerbehandlung)

- **store.js / background.js — `chrome.runtime.lastError` wird geprüft (B1):**
  Alle Storage- und Tabs/Windows-Callbacks behandeln Fehler jetzt explizit
  (Rückfall auf Defaults bzw. „neuen Tab öffnen"), statt „Unchecked
  runtime.lastError"-Meldungen zu erzeugen. `openOrFocusDashboard` übersteht
  jetzt auch einen zwischen Query und Update geschlossenen Dashboard-Tab.
- **content.js — Null-Check für `document.head` (B2):** `injectPulseStyle()`
  fällt auf `document.documentElement` zurück, statt mit TypeError abzubrechen.
- **dashboard.js — sicherer `chrome`-Check (B3):** `renderTracker` nutzt
  `typeof chrome !== "undefined"` statt `chrome && …` (ReferenceError außerhalb
  der Extension).
- **lib/ai.js — 30-Sekunden-Timeout für KI-Aufrufe (B4):** Anthropic- und
  Backend-Fetches laufen über `AbortController`. Hängt der Call, greift nach
  30 s automatisch die eingebaute Anschreiben-Vorlage, statt dass der Nutzer
  unbegrenzt auf „KI schreibt …" wartet.
- **dashboard.js — `hashchange`-Listener (B5):** Klickt man im Overlay z. B.
  „Profil ausfüllen", während das Dashboard schon offen ist, wechselt der Tab
  jetzt wirklich auf den gewünschten Reiter (background.js setzt nur die URL —
  bisher reagierte das Dashboard darauf nicht).

### Behoben (Extraktion / Konsistenz)

- **lib/portals.js — stabile Listing-IDs (C1):** `dom.listingId()` schneidet
  Query/Hash ab und extrahiert bevorzugt die Expose-ID aus dem Pfad
  (`/expose/<id>`). Damit bekommen auch Immowelt/Immonet (alphanumerische IDs)
  stabile Tracker-Schlüssel; vorher entstanden dort URL-abhängige IDs →
  Duplikate im Tracker und wirkungslose „bereits beworben"-Erkennung.
  Für ImmoScout, WG-Gesucht und Kleinanzeigen ergeben sich dieselben IDs wie
  bisher (keine Brüche mit bestehenden Tracker-Daten).
- **lib/ai.js — KI-Anrede = Vorlagen-Anrede (C2):** `buildPrompt` kennt jetzt
  die informelle WG-Gesucht-Anrede („Hallo <Vorname>,") und den Fall „Nachname
  bekannt, Geschlecht unbekannt" („Sehr geehrte(r) Frau/Herr <Name>,").
  KI-Anschreiben begannen bisher in diesen Fällen fälschlich mit
  „Sehr geehrte Damen und Herren,".
- **content.js — Ton-Konsistenz im Tracker (D3):** „Als beworben markieren"
  protokolliert jetzt den Ton des laufenden Durchlaufs (falls aktiv) statt
  immer den Filter-Ton.
- **content.js — vollständige Tracker-Einträge aus `advance()` (D2):**
  Überspringen/Weiter liefert Titel + URL mit, damit im Edge-Case neu
  entstehende Einträge nicht leer in der Bewerbungsliste stehen.

### Manifest

- **`activeTab`-Berechtigung entfernt (E1):** wurde nirgends genutzt
  (Minimal-Permissions, relevant für den Chrome-Web-Store-Review). Verbleiben:
  `scripting`, `storage`, `tabs` — alle nachweislich in Verwendung.
- **Version auf 1.7.1 angehoben** (Build-Kennung im Overlay zeigt die neue
  Version nach dem Neuladen der Extension + der Portal-Tabs).

### Verifikation

- Syntax-Check aller JS-Dateien (JavaScriptCore): fehlerfrei.
- Funktionaler Smoke-Test der Logik-Module (Extraktion mit Umlauten,
  Kaltmiete-Priorität, alle drei Anrede-Fälle, Listing-IDs aller vier
  Portal-Adapter, KI-Prompt-Anrede): alle Fälle bestanden.
- Encoding-Prüfung (`file`): alle Dateien sauberes UTF-8, keine Umlaut-Probleme
  gefunden (Details in `AUDIT.md`, C3).
