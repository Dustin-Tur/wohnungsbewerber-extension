/* WBA.i18n – Oberflächensprache (Deutsch / Englisch).

   ┌─ PRODUKT-INVARIANTE (NICHT aufweichen):
   │  Übersetzt wird ausschließlich die BEDIENOBERFLÄCHE. Die erzeugten
   │  Anschreiben, der Nachfass-Text, die Anreden und die Selbstauskunft
   │  bleiben IMMER Deutsch – genau das ist der Wert für Nicht-Deutschsprachige:
   │  englische Oberfläche → deutsche Ausgabe. Wer hier `letter.js`,
   │  `salutation.greeting()` oder die Selbstauskunft übersetzt, zerstört das
   └─ Produkt.

   Warum eine eigene Schicht statt chrome.i18n/_locales?
   chrome.i18n folgt starr der Browsersprache und lässt sich vom Nutzer nicht
   umschalten. Ein Expat mit deutschem Chrome (oder umgekehrt) säße fest. Diese
   Schicht ist ein persistenter Nutzer-Schalter (wba_lang) und läuft in allen
   Kontexten: Dashboard, Content-Script und Service-Worker (kein DOM nötig).

   Verwendung:
     await WBA.i18n.init();           // Sprache laden (einmal je Kontext)
     WBA.i18n.t("nav.search")         // Text holen
     WBA.i18n.t("tracker.days", {n:5})// mit Platzhaltern
     WBA.i18n.apply(document);        // alle [data-i18n*] im DOM füllen
     WBA.i18n.onChange(fn);           // auf Sprachwechsel reagieren
*/
(function (root) {
  "use strict";
  const WBA = (root.WBA = root.WBA || {});

  const LANGS = ["de", "en"];
  const STORAGE_KEY = "wba_lang";

  /* ================================================================
     WÖRTERBUCH
     Ein Eintrag je Schlüssel, deutsche und englische Fassung direkt
     nebeneinander – so fällt beim Ändern sofort auf, wenn eine Seite
     fehlt. Fehlt "en", wird still auf "de" zurückgefallen.
     Platzhalter: {name}
     ================================================================ */
  const DICT = {
    /* ---------- Sprachschalter ---------- */
    "lang.switchTo": { de: "EN", en: "DE" },
    "lang.switchTitle": { de: "Switch to English", en: "Auf Deutsch umschalten" },
    "lang.switched": { de: "Sprache: Deutsch", en: "Language: English" },

    /* ---------- Kopf & Navigation ---------- */
    "app.themeToggle": { de: "Hell/Dunkel umschalten", en: "Toggle light/dark" },
    "app.themeToggleAria": { de: "Zwischen hellem und dunklem Design umschalten", en: "Switch between light and dark theme" },
    "app.themeDark": { de: "Dunkles Design aktiv", en: "Dark theme active" },
    "app.themeLight": { de: "Helles Design aktiv", en: "Light theme active" },
    "nav.search": { de: "Suchen", en: "Search" },
    "nav.letter": { de: "Anschreiben", en: "Letter" },
    "nav.applications": { de: "Bewerbungen", en: "Applications" },
    "nav.profile": { de: "Profil", en: "Profile" },
    "nav.documents": { de: "Unterlagen", en: "Documents" },

    /* ---------- Onboarding ---------- */
    "onb.title": { de: "Willkommen beim WohnungsBewerber!", en: "Welcome to WohnungsBewerber!" },
    "onb.text": {
      de: "In drei Schritten zur ersten Bewerbung – alle Daten bleiben lokal, gesendet wird nur von dir.",
      en: "Three steps to your first application – all data stays on your device, and only you ever send anything.",
    },
    "onb.aria": { de: "So funktioniert WohnungsBewerber", en: "How WohnungsBewerber works" },
    "onb.step1": { de: "Profil ausfüllen", en: "Fill in your profile" },
    "onb.step1sub": { de: "einmalig deine Daten", en: "your details, once" },
    "onb.step2": { de: "Suche starten", en: "Start a search" },
    "onb.step2sub": { de: "Ort &amp; Filter wählen", en: "pick city &amp; filters" },
    "onb.step3": { de: "Prüfen &amp; senden", en: "Check &amp; send" },
    "onb.step3sub": { de: "du klickst selbst", en: "you click send yourself" },
    "onb.demo": { de: "Beispiel ansehen", en: "See an example" },
    "onb.profile": { de: "Profil ausfüllen →", en: "Fill in profile →" },
    "onb.germanNote": {
      de: "",
      en: "Don’t speak German? The tool writes your application letter <b>in German</b> – the language every landlord here expects. You only fill in this English form.",
    },

    /* ---------- Suchen ---------- */
    "search.title": { de: "Wohnung suchen", en: "Find an apartment" },
    "search.hint": {
      de: "Filter setzen – der Assistent öffnet die Trefferlisten und geht die Anzeigen später mit dir durch. Du prüfst und sendest jede Nachricht selbst.",
      en: "Set your filters – the assistant opens the result lists and walks you through the listings. You check and send every message yourself.",
    },
    "search.city": { de: "Ort / Stadt", en: "City" },
    "search.cityPh": { de: "z. B. Köln", en: "e.g. Köln (German spelling)" },
    "search.rooms": { de: "Zimmer (min.)", en: "Rooms (min.)" },
    "search.roomsPh": { de: "z. B. 2", en: "e.g. 2" },
    "search.size": { de: "Größe ab (m²)", en: "Size from (m²)" },
    "search.sizePh": { de: "z. B. 55", en: "e.g. 55" },
    "search.price": { de: "Kaltmiete bis (€)", en: "Base rent (Kaltmiete) up to (€)" },
    "search.pricePh": { de: "z. B. 900", en: "e.g. 900" },
    "search.tone": { de: "Ton der Anschreiben", en: "Tone of the letters" },
    "search.portals": { de: "Portale", en: "Portals" },
    "search.autoOverlay": {
      de: "Assistent-Overlay automatisch auf Wohnungsanzeigen anzeigen",
      en: "Show the assistant overlay automatically on listing pages",
    },
    "search.start": { de: "Suche starten", en: "Start search" },
    "search.loginNote": {
      de: "<b>Wichtig:</b> Du musst auf dem jeweiligen Portal eingeloggt sein, um Nachrichten senden zu können.",
      en: "<b>Important:</b> you need to be logged in on each portal to be able to send messages.",
    },
    "search.botNote": {
      de: "Bei ImmoScout &amp; Immowelt kann die automatische Suche durch den Bot-Schutz gebremst werden – dann öffnet der Assistent die Suche und du klickst dich normal durch.",
      en: "On ImmoScout &amp; Immowelt the automatic search can be slowed down by bot protection – the assistant then simply opens the search and you click through as usual.",
    },
    "search.cityNote": {
      de: "",
      en: "Use the German name of the city – the portals don’t know “Cologne” or “Munich”, only “Köln” and “München”.",
    },
    "search.noCity": { de: "Bitte einen Ort eingeben.", en: "Please enter a city." },
    "search.noPortal": { de: "Bitte mindestens ein Portal auswählen.", en: "Please select at least one portal." },
    "search.notInstalled": {
      de: "Suche öffnen ist nur in der installierten Erweiterung möglich. (URLs: {urls})",
      en: "Opening the search only works in the installed extension. (URLs: {urls})",
    },
    "search.openFailed": {
      de: "Die Trefferlisten konnten nicht geöffnet werden – bitte erneut versuchen.",
      en: "The result lists could not be opened – please try again.",
    },
    "search.opened": {
      de: "✓ {n} Trefferliste(n) geöffnet. Im ersten Tab startest du den Durchlauf – der Assistent bereitet jede Anzeige vor.",
      en: "✓ {n} result list(s) opened. Start the run in the first tab – the assistant prepares every listing for you.",
    },
    "search.openedToast": { de: "Suche geöffnet auf {n} Portal(en)", en: "Search opened on {n} portal(s)" },
    "search.experimental": { de: "experimentell", en: "experimental" },

    /* ---------- Ton-Bezeichnungen (Werte bleiben deutsch!) ---------- */
    "tone.standard": { de: "Standard", en: "Standard" },
    "tone.formal": { de: "Formal", en: "Formal" },
    "tone.kurz": { de: "Kurz", en: "Short" },
    "tone.herzlich": { de: "Herzlich", en: "Warm" },
    "tone.selbstbewusst": { de: "Selbstsicher", en: "Confident" },

    /* ---------- Anschreiben ---------- */
    "letter.title": { de: "Anschreiben für eine Anzeige", en: "Letter for a single listing" },
    "letter.hint": {
      de: "Text der Anzeige einfügen (oder aus der geöffneten Anzeige laden) und ein Anschreiben erzeugen.",
      en: "Paste the listing text (or load it from the open listing) and generate a letter.",
    },
    "letter.germanNote": {
      de: "",
      en: "<b>The letter is written in German</b> – ready to paste into the portal’s contact form. Everything you fill in here stays English.",
    },
    "letter.contactSalutation": { de: "Ansprechpartner:in (optional)", en: "Contact person (optional)" },
    "letter.noSalutation": { de: "— keine namentliche Anrede —", en: "— no name in the salutation —" },
    "letter.frau": { de: "Frau", en: "Ms. (Frau)" },
    "letter.herr": { de: "Herr", en: "Mr. (Herr)" },
    "letter.contactName": { de: "Name der Kontaktperson", en: "Contact’s last name" },
    "letter.contactNamePh": { de: "z. B. Schmidt", en: "e.g. Schmidt" },
    "letter.listingText": { de: "Anzeigentext", en: "Listing text" },
    "letter.listingTextPh": { de: "Anzeigentext hier einfügen …", en: "Paste the listing text here …" },
    "letter.paste": { de: "Aus Zwischenablage einfügen", en: "Paste from clipboard" },
    "letter.loadTab": { de: "Aus offener Anzeige laden", en: "Load from open listing" },
    "letter.demo": { de: "Beispiel laden", en: "Load example" },
    "letter.generate": { de: "Bewerbung generieren", en: "Generate application" },
    "letter.regenerate": { de: "Neu formulieren", en: "Write a new version" },
    "letter.kbd": { de: "⌘/Strg", en: "⌘/Ctrl" },
    "letter.kbdHint": { de: "erzeugt / formuliert neu", en: "generates / rewrites" },
    "letter.outEmpty": {
      de: "Hier erscheint dein fertiges Anschreiben – klick oben auf „Bewerbung generieren“.",
      en: "Your finished German letter appears here – click “Generate application” above.",
    },
    "letter.copy": { de: "Kopieren", en: "Copy" },
    "letter.copied": { de: "✓ Kopiert", en: "✓ Copied" },
    "letter.copiedToast": { de: "In Zwischenablage kopiert", en: "Copied to clipboard" },
    "letter.aiWriting": { de: "KI schreibt …", en: "AI is writing …" },
    "letter.aiFallback": { de: "KI nicht erreichbar – eingebauter Generator genutzt", en: "AI unavailable – used the built-in generator" },
    "letter.created": { de: "Anschreiben erstellt ✓", en: "Letter created ✓" },
    "letter.recreated": { de: "Neue Formulierung erstellt", en: "New version created" },
    "letter.tipAddText": {
      de: "Tipp: Anzeigentext ergänzen für ein persönlicheres Anschreiben",
      en: "Tip: add the listing text for a more personal letter",
    },
    "letter.noFlat": { de: "Ohne Wohnungsangabe", en: "No listing details" },
    "letter.flat": { de: "Wohnung", en: "Apartment" },

    /* ---------- Verlauf ---------- */
    "history.title": { de: "Zuletzt erstellt", en: "Recently created" },
    "history.empty": { de: "Noch nichts erstellt.", en: "Nothing created yet." },
    "history.clear": { de: "Verlauf leeren", en: "Clear history" },
    "history.cleared": { de: "Verlauf geleert", en: "History cleared" },
    "history.loaded": { de: "Aus Verlauf geladen", en: "Loaded from history" },

    /* ---------- Zeit ---------- */
    "time.now": { de: "gerade eben", en: "just now" },
    "time.min": { de: "vor {n} Min", en: "{n} min ago" },
    "time.hour": { de: "vor {n} Std", en: "{n} h ago" },
    "time.day": { de: "vor {n} Tag", en: "{n} day ago" },
    "time.days": { de: "vor {n} Tagen", en: "{n} days ago" },

    /* ---------- Bewerbungen (Tracker) ---------- */
    "tracker.title": { de: "Deine Bewerbungen", en: "Your applications" },
    "tracker.filterAria": { de: "Bewerbungen nach Status filtern", en: "Filter applications by status" },
    "tracker.all": { de: "Alle", en: "All" },
    "tracker.export": { de: "Export (CSV)", en: "Export (CSV)" },
    "tracker.hint": {
      de: "Überblick über alle vorbereiteten und gesendeten Bewerbungen – damit nichts doppelt läuft oder vergessen wird.",
      en: "An overview of every prepared and sent application – so nothing goes out twice or gets forgotten.",
    },
    "status.vorbereitet": { de: "Vorbereitet", en: "Prepared" },
    "status.beworben": { de: "Beworben", en: "Applied" },
    "status.antwort": { de: "Antwort erhalten", en: "Reply received" },
    "status.besichtigung": { de: "Besichtigung", en: "Viewing" },
    "status.übersprungen": { de: "Übersprungen", en: "Skipped" },
    "tracker.statApplied": { de: "{n} beworben", en: "{n} applied" },
    "tracker.statReply": { de: "{n} Antwort ({pct} %)", en: "{n} reply ({pct}%)" },
    "tracker.statReplies": { de: "{n} Antworten ({pct} %)", en: "{n} replies ({pct}%)" },
    "tracker.statViewing": { de: "{n} Besichtigung", en: "{n} viewing" },
    "tracker.statViewings": { de: "{n} Besichtigungen", en: "{n} viewings" },
    "tracker.emptyTitle": { de: "Noch keine Bewerbungen", en: "No applications yet" },
    "tracker.emptyTitleFiltered": { de: "Noch keine Bewerbungen mit diesem Status", en: "No applications with this status yet" },
    "tracker.emptyText": {
      de: "Starte eine Suche und gehe die Anzeigen durch – hier erscheint dann jede vorbereitete und gesendete Bewerbung.",
      en: "Start a search and work through the listings – every prepared and sent application shows up here.",
    },
    "tracker.appointment": { de: "Termin:", en: "Appointment:" },
    "tracker.appointmentAria": { de: "Besichtigungstermin", en: "Viewing appointment" },
    "tracker.ics": { de: "In Kalender (ICS)", en: "Add to calendar (ICS)" },
    "tracker.icsTitle": { de: "Termin als Kalender-Datei speichern", en: "Save the appointment as a calendar file" },
    "tracker.icsSaved": { de: "Kalender-Datei gespeichert", en: "Calendar file saved" },
    "tracker.icsNoDate": { de: "Bitte zuerst einen gültigen Termin wählen", en: "Please pick a valid date and time first" },
    "tracker.icsSummary": { de: "Besichtigung: {title}", en: "Viewing: {title}" },
    "tracker.followedUp": { de: "Nachgefasst {when}", en: "Followed up {when}" },
    "tracker.noReplyDays": { de: "Seit {n} Tagen keine Antwort", en: "No reply for {n} days" },
    "tracker.followUp": { de: "Nachfassen", en: "Follow up" },
    "tracker.followUpTitle": {
      de: "Höflichen Nachfass-Text kopieren und Anzeige öffnen",
      en: "Copy a polite German follow-up message and open the listing",
    },
    "tracker.followUpCopied": {
      de: "Nachfass-Text kopiert – auf der Anzeigenseite einfügen und senden",
      en: "German follow-up copied – paste it on the listing page and send it yourself",
    },
    "tracker.delete": { de: "Eintrag löschen", en: "Delete entry" },
    "tracker.deleted": { de: "Eintrag gelöscht", en: "Entry deleted" },
    "tracker.nothingToExport": { de: "Keine Bewerbungen zum Exportieren", en: "No applications to export" },
    "tracker.exported": { de: "CSV exportiert", en: "CSV exported" },

    /* ---------- Auswertung „Was bei dir funktioniert“ (lib/stats.js) ----------
       Die Texte sind bewusst vorsichtig formuliert: Sie beschreiben, was in den
       eigenen Daten steht, und versprechen keine Kausalität. */
    "stats.title": { de: "Was bei dir funktioniert", en: "What works for you" },
    "stats.hint": {
      de: "Gerechnet wird nur mit dem, was ohnehin auf deinem Gerät liegt: Ton, Portal und Status deiner eigenen Bewerbungen. Nichts davon verlässt den Browser.",
      en: "Calculated purely from what is already on your device: the tone, portal and status of your own applications. None of it leaves your browser.",
    },
    "stats.byTone": { de: "Antwortquote nach Ton", en: "Reply rate by tone" },
    "stats.byPortal": { de: "Antwortquote nach Portal", en: "Reply rate by portal" },
    "stats.value": { de: "{pct} % · {replies} von {applied}", en: "{pct}% · {replies} of {applied}" },
    // Nicht „{n} von {min}“ – das läse sich neben „5 von 11“ (Antworten von
    // Bewerbungen) als Quote und würde genau die Verwechslung stiften,
    // die diese Zeile vermeiden soll.
    "stats.tooFew": { de: "erst {n} Bewerbungen (Quote ab {min})", en: "only {n} applications (rate from {min})" },
    "stats.leadTone": {
      de: "Auf „{name}“ kommen bei dir bisher die meisten Antworten ({pct} %).",
      en: "So far “{name}” gets you the most replies ({pct}%).",
    },
    "stats.leadNone": {
      de: "Noch kein belastbarer Unterschied zwischen den Tonlagen – dafür braucht es ein paar Bewerbungen mehr je Ton.",
      en: "No reliable difference between the tones yet – that needs a few more applications per tone.",
    },
    "stats.replyTime": {
      de: "Antworten kamen im Schnitt nach {avg} Tagen, die späteste nach {max} Tagen (aus {n} Antworten).",
      en: "Replies took {avg} days on average, the slowest {max} days (based on {n} replies).",
    },
    "stats.empty": {
      de: "Sobald du dich beworben hast, siehst du hier, welcher Ton und welches Portal bei dir am ehesten zu einer Antwort führen.",
      en: "Once you have applied, this is where you see which tone and which portal actually get you replies.",
    },
    "csv.portal": { de: "Portal", en: "Portal" },
    "csv.title": { de: "Titel", en: "Title" },
    "csv.city": { de: "Ort", en: "City" },
    "csv.sqm": { de: "m²", en: "m²" },
    "csv.price": { de: "Preis", en: "Price" },
    "csv.tone": { de: "Ton", en: "Tone" },
    "csv.status": { de: "Status", en: "Status" },
    "csv.viewing": { de: "Besichtigung", en: "Viewing" },
    "csv.date": { de: "Datum", en: "Date" },
    "csv.url": { de: "URL", en: "URL" },
    "csv.file": { de: "bewerbungen.csv", en: "applications.csv" },

    /* ---------- Profil ---------- */
    "profile.title": { de: "Dein Profil", en: "Your profile" },
    "profile.hint": {
      de: "Einmal ausfüllen – wird lokal gespeichert und für alle Anschreiben genutzt.",
      en: "Fill in once – stored locally on your device and used for every letter.",
    },
    "profile.progress": { de: "Profil zu {pct} % ausgefüllt", en: "Profile {pct}% complete" },
    "profile.name": { de: "Voller Name", en: "Full name" },
    "profile.namePh": { de: "Max Mustermann", en: "Jane Doe" },
    "profile.email": { de: "E-Mail (Kontakt)", en: "Email (contact)" },
    "profile.emailPh": { de: "name@mail.de", en: "name@mail.com" },
    "profile.phone": { de: "Telefon (Kontakt)", en: "Phone (contact)" },
    "profile.addressHint": {
      de: "Adresse – damit Kontaktformulare komplett automatisch ausgefüllt werden.",
      en: "Your address – so contact forms can be filled in completely.",
    },
    "profile.street": { de: "Straße &amp; Nr.", en: "Street &amp; number" },
    "profile.zip": { de: "PLZ", en: "Postcode (PLZ)" },
    "profile.city": { de: "Wohnort", en: "City you live in" },
    "profile.moreSummary": { de: "Für bessere Anschreiben (optional, aber empfohlen)", en: "For better letters (optional, but recommended)" },
    "profile.age": { de: "Alter", en: "Age" },
    "profile.job": { de: "Beruf", en: "Job title" },
    "profile.jobPh": { de: "z. B. Softwareentwickler", en: "e.g. software developer" },
    "profile.employment": { de: "Beschäftigung", en: "Employment" },
    "emp.none": { de: "keine Angabe", en: "not specified" },
    "emp.unbefristet": { de: "Angestellt (unbefristet)", en: "Employed (permanent contract)" },
    "emp.befristet": { de: "Angestellt (befristet)", en: "Employed (fixed-term contract)" },
    "emp.selbststaendig": { de: "Selbstständig", en: "Self-employed" },
    "emp.azubi": { de: "Ausbildung / Studium", en: "Apprenticeship / studying" },
    "emp.rente": { de: "Rente / Pension", en: "Retired / pension" },
    "emp.buergergeld": { de: "Arbeitslos / Bürgergeld / Grundsicherung", en: "Unemployed / Bürgergeld / basic support" },
    "profile.income": { de: "Einkommen (netto/Monat)", en: "Income (net, per month)" },
    "profile.incomePh": { de: "z. B. 3200 €", en: "e.g. 3200 €" },
    "profile.persons": { de: "Anzahl Personen", en: "Number of people" },
    "profile.pets": { de: "Haustiere", en: "Pets" },
    "profile.petsPh": { de: "z. B. keine / 1 Katze", en: "e.g. none / 1 cat" },
    "profile.buergergeldNote": {
      de: "Wählst du bei „Beschäftigung“ <b>„Arbeitslos / Bürgergeld / Grundsicherung“</b>, werden Beruf und Einkommen automatisch deaktiviert – die Miete läuft dann über das Jobcenter.",
      en: "If you pick <b>“Unemployed / Bürgergeld / basic support”</b> under Employment, job and income are switched off automatically – the rent is then covered by the Jobcenter.",
    },
    "profile.about": { de: "Kurze persönliche Beschreibung", en: "Short personal description" },
    "profile.aboutPh": {
      de: "z. B. ruhig, ordentlich, Nichtraucher, festes Arbeitsverhältnis seit 4 Jahren.",
      en: "e.g. quiet, tidy, non-smoker, permanent job for 4 years.",
    },
    "profile.save": { de: "Profil speichern", en: "Save profile" },
    "profile.reset": { de: "Zurücksetzen", en: "Reset" },
    "profile.saved": { de: "✓ Profil gespeichert", en: "✓ Profile saved" },
    "profile.resetDone": { de: "Profil zurückgesetzt", en: "Profile reset" },
    "profile.resetConfirm": {
      de: "Profil zurücksetzen? Gelöscht werden: Profildaten, Anschreiben-Verlauf, eingefügte Anzeige, Unterlagen-Status und gespeicherte Textmuster. Bewerbungsliste und KI-Einstellungen bleiben erhalten.",
      en: "Reset your profile? This deletes: profile data, letter history, the pasted listing, document status and stored text fingerprints. Your application list and AI settings are kept.",
    },
    "profile.clearAll": { de: "Alle Daten löschen", en: "Delete all data" },
    "profile.exportAll": { de: "Alle Daten sichern (JSON)", en: "Back up all data (JSON)" },
    "export.file": { de: "wohnungsbewerber-daten.json", en: "wohnungsbewerber-data.json" },
    "export.done": { de: "Daten als JSON gesichert ✓", en: "Data backed up as JSON ✓" },
    "profile.clearAllConfirm": {
      de: "Wirklich ALLE Daten löschen? Zusätzlich zum Profil werden auch Bewerbungsliste, Suchfilter, laufende Durchläufe und die KI-Einstellungen samt API-Schlüssel entfernt. Nur Design und Sprache bleiben. Das lässt sich nicht rückgängig machen.",
      en: "Really delete ALL data? Besides your profile this also removes the application list, search filters, running queues and the AI settings including the API key. Only theme and language are kept. This cannot be undone.",
    },

    /* ---------- Validierung ---------- */
    "val.name": { de: "Bitte gib deinen Namen ein.", en: "Please enter your name." },
    "val.age": { de: "Bitte ein realistisches Alter angeben (14–120).", en: "Please enter a realistic age (14–120)." },
    "val.persons": { de: "Bitte eine ganze Zahl ab 1 angeben.", en: "Please enter a whole number of 1 or more." },
    "val.income": { de: "Bitte einen Betrag mit Zahl angeben, z. B. 2500 €.", en: "Please enter an amount with digits, e.g. 2500 €." },
    "val.email": { de: "Bitte eine gültige E-Mail-Adresse angeben.", en: "Please enter a valid email address." },
    "val.fixOne": { de: "Bitte korrigiere die markierte Angabe im Profil.", en: "Please correct the highlighted field in your profile." },
    "val.fixMany": { de: "Bitte korrigiere die {n} markierten Angaben im Profil.", en: "Please correct the {n} highlighted fields in your profile." },
    "val.toastOne": { de: "Bitte eine Angabe im Profil korrigieren", en: "Please correct one field in your profile" },
    "val.toastMany": { de: "Bitte Angaben im Profil korrigieren", en: "Please correct some fields in your profile" },

    /* ---------- Einfügen / Tab lesen ---------- */
    "paste.empty": {
      de: "Die Zwischenablage ist leer. Kopiere zuerst den Anzeigentext (Strg/Cmd + C).",
      en: "The clipboard is empty. Copy the listing text first (Ctrl/Cmd + C).",
    },
    "paste.okOne": { de: "✓ Eingefügt – 1 Angabe erkannt.", en: "✓ Pasted – 1 detail detected." },
    "paste.okMany": { de: "✓ Eingefügt – {n} Angaben erkannt.", en: "✓ Pasted – {n} details detected." },
    "paste.okNone": {
      de: "✓ Text eingefügt. (Keine Eckdaten erkannt – du kannst sie von Hand ergänzen.)",
      en: "✓ Text pasted. (No key details detected – you can add them by hand.)",
    },
    "paste.manual": { de: "Bitte den Text direkt ins Feld einfügen (Strg/Cmd + V).", en: "Please paste the text straight into the field (Ctrl/Cmd + V)." },
    "paste.salutation": { de: " · Anrede {badge}", en: " · Salutation {badge}" },
    "tab.notInstalled": {
      de: "Diese Funktion ist nur in der installierten Erweiterung verfügbar.",
      en: "This only works in the installed extension.",
    },
    "tab.noTab": {
      de: "Kein offener Anzeigen-Tab gefunden. Öffne die Wohnungsanzeige auf einem der unterstützten Portale und versuche es erneut.",
      en: "No open listing tab found. Open the listing on one of the supported portals and try again.",
    },
    "tab.ok": { de: "✓ Aus „{title}“ übernommen.", en: "✓ Taken from “{title}”." },
    "tab.noData": {
      de: "Tab gelesen, aber keine Eckdaten erkannt – bitte Text von Hand einfügen.",
      en: "Read the tab, but found no key details – please paste the text by hand.",
    },
    "tab.failed": { de: "Konnte den Tab nicht lesen. Bitte den Anzeigentext manuell einfügen.", en: "Could not read that tab. Please paste the listing text manually." },
    "tab.reload": {
      de: "Der Portal-Tab reagiert nicht – vermutlich war er schon vor der Installation bzw. dem letzten Update offen. Bitte lade ihn neu (F5) und versuche es dann erneut.",
      en: "The portal tab is not responding – it was probably open before the install or last update. Please reload it (F5) and try again.",
    },

    /* ---------- Demo ---------- */
    "demo.withDemoProfile": {
      de: "Beispiel mit Demo-Profil „Max Mustermann“ – fülle dein Profil aus, dann steht hier dein Name.",
      en: "Example using the demo profile “Max Mustermann” – fill in your profile and your own name appears here.",
    },
    "demo.withYourProfile": {
      de: "Beispiel-Anzeige geladen – Anschreiben mit deinem Profil erstellt.",
      en: "Example listing loaded – letter created from your profile.",
    },
    "demo.toast": { de: "Beispiel erstellt – {n} Angaben aus der Anzeige erkannt ✓", en: "Example created – {n} details detected in the listing ✓" },
    "demo.toastPlain": { de: "Beispiel erstellt ✓", en: "Example created ✓" },

    /* ---------- Chips (erkannte Eckdaten) ---------- */
    "chip.rooms": { de: "{n} Zimmer", en: "{n} rooms" },
    "chip.roomsShort": { de: "{n} Zi.", en: "{n} rm" },
    "chip.free": { de: "frei ab {date}", en: "available from {date}" },

    /* ---------- Unterlagen ---------- */
    "docs.title": { de: "Unterlagen", en: "Documents" },
    "docs.hint": {
      de: "Selbstauskunft als PDF erstellen und abhaken, was du beilegst. (Dateien lassen sich aus Sicherheitsgründen nicht automatisch anhängen – das machst du beim Senden selbst.)",
      en: "Create your tenant self-disclosure as a PDF and tick off what you attach. (For security reasons files can’t be attached automatically – you do that yourself when sending.)",
    },
    "docs.make": { de: "Selbstauskunft als PDF erstellen", en: "Create tenant self-disclosure (PDF)" },
    "docs.checklist": { de: "Dokumenten-Checkliste", en: "Document checklist" },
    "docs.germanNote": {
      de: "",
      en: "The self-disclosure (<i>Mieterselbstauskunft</i>) is generated in German – landlords here expect that form.",
    },
    "docs.needName": { de: "Bitte zuerst im Profil mindestens den Namen ausfüllen.", en: "Please fill in at least your name in the profile first." },
    "docs.popupBlocked": { de: "Bitte Pop-ups für die Erweiterung erlauben und erneut klicken.", en: "Please allow pop-ups for the extension and click again." },
    "docs.opened": {
      de: "✓ Selbstauskunft geöffnet – dort Strg/Cmd + P zum Speichern als PDF.",
      en: "✓ Self-disclosure opened – press Ctrl/Cmd + P there to save it as a PDF.",
    },
    "docs.noSchufaLabel": {
      de: "<b>Meine SCHUFA ist negativ – oder ich habe keine.</b><br>Die SCHUFA wird dann in deinen Anschreiben <b>nie</b> erwähnt und oben nicht mehr verlangt. Tipp: Eine Bürgschaft oder die Mietschuldenfreiheitsbescheinigung überzeugt Vermieter oft genauso.",
      en: "<b>My SCHUFA is negative – or I don’t have one.</b><br>The SCHUFA will then <b>never</b> be mentioned in your letters and is dropped from the checklist above. Tip: a guarantor (<i>Bürgschaft</i>) or a rent-payment confirmation from your current landlord often convinces just as well.",
    },
    "docs.noSchufaOn": { de: "Okay – die SCHUFA wird in Anschreiben nie erwähnt", en: "Okay – the SCHUFA will never be mentioned in your letters" },
    "docs.noSchufaOff": { de: "SCHUFA ist wieder Teil der Checkliste", en: "SCHUFA is back on the checklist" },
    "doc.ausweis": { de: "Personalausweis (Kopie, Vorder- & Rückseite)", en: "ID card or passport (copy, both sides)" },
    "doc.schufa": { de: "SCHUFA-Bonitätsauskunft (aktuell)", en: "SCHUFA credit report (recent)" },
    "doc.jobcenter": { de: "Aktueller Bescheid des Jobcenters (Bürgergeld/Grundsicherung)", en: "Current Jobcenter decision letter (Bürgergeld / basic support)" },
    "doc.kdu": { de: "Bestätigung der Mietkostenübernahme (Jobcenter)", en: "Confirmation that the Jobcenter covers the rent" },
    "doc.rente": { de: "Rentenbescheid", en: "Pension statement (Rentenbescheid)" },
    "doc.bwa": { de: "BWA / letzter Steuerbescheid", en: "Business figures (BWA) / latest tax assessment" },
    "doc.ausbildung": { de: "Ausbildungsvertrag / Immatrikulationsbescheinigung", en: "Apprenticeship contract / certificate of enrolment" },
    "doc.buergschaft": { de: "Bürgschaft (z. B. der Eltern)", en: "Guarantor declaration (Bürgschaft, e.g. from your parents)" },
    "doc.buergschaftAlt": {
      de: "Bürgschaft (z. B. Eltern oder Freunde) – gute Alternative zur SCHUFA",
      en: "Guarantor declaration (Bürgschaft, e.g. parents or friends) – a good alternative to the SCHUFA",
    },
    "doc.gehalt": { de: "Einkommensnachweise (letzte 3 Gehaltsabrechnungen)", en: "Proof of income (last 3 payslips)" },
    "doc.mietschulden": { de: "Mietschuldenfreiheitsbescheinigung (aktueller Vermieter)", en: "Rent-payment confirmation from your current landlord" },
    "doc.selbstauskunft": { de: "Ausgefüllte Selbstauskunft (unten erstellen)", en: "Completed self-disclosure (create it below)" },

    /* ---------- Fußzeile ---------- */
    "footer.feedback": { de: "Feedback geben", en: "Send feedback" },
    "footer.rate": { de: "Bewerten", en: "Rate" },
    "footer.note": {
      de: "Alle Daten bleiben lokal in deinem Browser. WohnungsBewerber sendet nie automatisch – du prüfst und bestätigst jede Nachricht selbst.",
      en: "All data stays local in your browser. WohnungsBewerber never sends anything automatically – you check and confirm every message yourself.",
    },

    /* ---------- KI-Einstellungen ---------- */
    "ai.summary": { de: "Nur für Experten: eigene KI-Anbindung (optional)", en: "Experts only: connect your own AI (optional)" },
    "ai.active": { de: "aktiv", en: "active" },
    "ai.hint": {
      de: "Nicht nötig – die App erstellt Anschreiben bereits ohne diese Einstellung, komplett kostenlos und ohne Internetverbindung. Nur aktivieren, wenn du selbst einen Claude-API-Schlüssel besitzt und weißt, dass dabei <strong>eigene Kosten bei dir</strong> entstehen (nicht beim Hersteller dieser Erweiterung).",
      en: "Not needed – the app already writes letters without this setting, completely free and offline. Only switch it on if you own a Claude API key and understand that <strong>you</strong> pay for the usage (not the maker of this extension).",
    },
    "ai.mode": { de: "Modus", en: "Mode" },
    "ai.modeOff": { de: "Aus – eingebaute Vorlage nutzen (Standard)", en: "Off – use the built-in generator (default)" },
    "ai.modeAnthropic": { de: "Claude direkt (eigener API-Schlüssel)", en: "Claude directly (your own API key)" },
    "ai.key": { de: "Claude API-Schlüssel", en: "Claude API key" },
    "ai.keyHint": {
      de: "Liegt unverschlüsselt im Browserprofil dieses Rechners (für andere Programme und Personen mit Zugriff lesbar). Nutze deshalb am besten einen eigenen Schlüssel mit Ausgabenlimit (console.anthropic.com → Limits).",
      en: "Stored unencrypted in this computer's browser profile (readable by other software and people with access). Best use a dedicated key with a spend limit (console.anthropic.com → Limits).",
    },
    "ai.model": { de: "Modell", en: "Model" },
    "ai.modelHaiku": { de: "Haiku 4.5 – günstig &amp; schnell (empfohlen)", en: "Haiku 4.5 – cheap &amp; fast (recommended)" },
    "ai.modelSonnet": { de: "Sonnet 5 – höhere Qualität", en: "Sonnet 5 – higher quality" },
    "ai.modelOpus": { de: "Opus 4.8 – beste Qualität", en: "Opus 4.8 – best quality" },
    "ai.consent": {
      de: "Mir ist bewusst, dass beim Erzeugen mit KI meine Profil- und Anzeigendaten (einschließlich Einkommens- bzw. Sozialleistungsangaben und Kontaktdaten) an Anthropic in die USA übermittelt werden. <a href=\"https://wohnungsbewerber.app/datenschutz.html\" target=\"_blank\" rel=\"noopener\">Datenschutzerklärung</a>",
      en: "I understand that when generating with AI, my profile and listing data (including income or benefits details and contact data) are transmitted to Anthropic in the USA. <a href=\"https://wohnungsbewerber.app/en/privacy/\" target=\"_blank\" rel=\"noopener\">Privacy policy</a>",
    },
    "ai.consentRequired": { de: "Bitte bestätige zuerst den Datenhinweis (Häkchen), um die KI zu aktivieren.", en: "Please confirm the data notice (checkbox) first to enable the AI." },
    "ai.save": { de: "Speichern", en: "Save" },
    "ai.test": { de: "KI testen", en: "Test the AI" },
    "ai.saved": { de: "✓ Gespeichert.", en: "✓ Saved." },
    "ai.savedToast": { de: "KI-Einstellungen gespeichert ✓", en: "AI settings saved ✓" },
    "ai.testing": { de: "Teste KI …", en: "Testing the AI …" },
    "ai.answers": { de: "✓ KI antwortet – {text}…", en: "✓ The AI replies – {text}…" },
    "ai.errNotConfigured": { de: "Bitte Modus + API-Schlüssel ausfüllen.", en: "Please set the mode and the API key." },
    "ai.err401": { de: "Der API-Schlüssel wurde abgelehnt (401) – bitte den Schlüssel prüfen.", en: "The API key was rejected (401) – please check the key." },
    "ai.err403": { de: "Zugriff verweigert (403) – Schlüssel bzw. Berechtigungen prüfen.", en: "Access denied (403) – check the key and its permissions." },
    "ai.err404": { de: "Nicht gefunden (404) – bitte den Modellnamen prüfen.", en: "Not found (404) – please check the model name." },
    "ai.err429": { de: "Zu viele Anfragen (429) – kurz warten und erneut testen.", en: "Too many requests (429) – wait a moment and test again." },
    "ai.err5xx": { de: "Der Server meldet einen Fehler ({code}) – später erneut versuchen.", en: "The server reported an error ({code}) – try again later." },
    "ai.errTimeout": { de: "Zeitüberschreitung nach 30 s – Server nicht erreichbar?", en: "Timed out after 30 s – server unreachable?" },
    "ai.errNetwork": { de: "Netzwerkfehler – bitte die Internetverbindung prüfen.", en: "Network error – please check your internet connection." },
    "ai.errEmpty": { de: "Die KI hat einen leeren Text geliefert – bitte erneut testen.", en: "The AI returned an empty text – please test again." },
    "ai.errOther": { de: "Keine Antwort ({err}). Bitte den API-Schlüssel prüfen.", en: "No answer ({err}). Please check the API key." },

    /* ---------- Anrede-Erkennung (Badge) ---------- */
    "salut.frau": { de: "erkannt: Frau {name}", en: "detected: Frau {name}" },
    "salut.herr": { de: "erkannt: Herr {name}", en: "detected: Herr {name}" },
    "salut.familie": { de: "erkannt: Familie {name}", en: "detected: Familie {name}" },
    "salut.vorname": { de: "erkannt: {name} (locker)", en: "detected: {name} (informal)" },
    "salut.firma": { de: "Firma erkannt – neutrale Anrede", en: "Company detected – neutral salutation" },
    "salut.unsure": { de: "unsicher: „{name}“ – Anrede bitte wählen", en: "unsure: “{name}” – please pick a salutation" },
    "salut.neutral": { de: "neutral, da unsicher", en: "neutral, because unsure" },

    /* ---------- Popup ---------- */
    "popup.opening": { de: "wird geöffnet …", en: "opening …" },

    /* ================================================================
       OVERLAY auf den Portalseiten (content.js)
       ================================================================ */
    "ov.minimize": { de: "Minimieren", en: "Minimize" },
    "ov.close": { de: "Schließen", en: "Close" },
    "ov.updated": { de: "Die Erweiterung wurde aktualisiert – bitte die Seite neu laden.", en: "The extension was updated – please reload the page." },
    "ov.found": { de: "{n} Anzeigen gefunden", en: "{n} listings found" },
    "ov.foundText": {
      de: "Der Assistent öffnet die Anzeigen nacheinander und bereitet dein Anschreiben vor. Du prüfst und sendest jede Nachricht selbst.",
      en: "The assistant opens the listings one by one and prepares your German letter. You check and send every message yourself.",
    },
    "ov.resumable": { de: "Ein Durchlauf läuft bereits – du kannst ihn fortsetzen.", en: "A run is already in progress – you can resume it." },
    "ov.start": { de: "Durchlauf starten ({n})", en: "Start run ({n})" },
    "ov.resume": { de: "Fortsetzen", en: "Resume" },
    "ov.resultsFoot": {
      de: "Du musst auf dem Portal eingeloggt sein, um Nachrichten zu senden. Bei ImmoScout &amp; Immowelt kann der Bot-Schutz bremsen.",
      en: "You need to be logged in on the portal to send messages. On ImmoScout &amp; Immowelt bot protection can slow things down.",
    },
    "ov.progress": { de: "Anzeige {i} / {n}", en: "Listing {i} of {n}" },
    "ov.single": { de: "Einzelne Anzeige", en: "Single listing" },
    "ov.noProfile": {
      de: "Bitte fülle zuerst dein Profil aus, dann kann ich das Anschreiben erstellen.",
      en: "Please fill in your profile first, then I can write the letter.",
    },
    "ov.filled": {
      de: "✓ Anschreiben ins Kontaktformular eingefügt. Bitte prüfen und selbst senden.",
      en: "✓ German letter inserted into the contact form. Please check it and send it yourself.",
    },
    "ov.hadText": {
      de: "Im Nachrichtenfeld steht bereits Text – ich habe nichts überschrieben. „Einfügen“ ersetzt ihn durch diesen Entwurf.",
      en: "There is already text in the message field – nothing was overwritten. “Insert” replaces it with this draft.",
    },
    "ov.noForm": {
      de: "Kontaktformular nicht gefunden. Öffne es auf der Seite oder füge das Anschreiben unten manuell ein.",
      en: "No contact form found. Open it on the page, or copy the letter below and paste it manually.",
    },
    "letter.copyFailed": {
      de: "Kopieren fehlgeschlagen – der Text ist jetzt markiert, drücke Strg+C.",
      en: "Copying failed – the text is now selected, press Ctrl+C.",
    },
    "tracker.followUpCopyFailed": {
      de: "Kopieren fehlgeschlagen – bitte erneut versuchen. Der Eintrag wurde NICHT als nachgefasst markiert.",
      en: "Copying failed – please try again. The entry was NOT marked as followed up.",
    },
    "err.save": {
      de: "⚠️ Speichern fehlgeschlagen – die Änderung wurde NICHT übernommen. ({err})",
      en: "⚠️ Saving failed – your change was NOT stored. ({err})",
    },
    "ov.aiRunConfirm": {
      de: "Durchlauf über {n} Anzeigen mit aktivierter KI starten? Das sind bis zu {n} kostenpflichtige Anfragen über deinen eigenen API-Schlüssel.",
      en: "Start a run over {n} listings with AI enabled? That's up to {n} paid requests on your own API key.",
    },
    "ov.allApplied": {
      de: "Alle Treffer dieser Liste hast du bereits beworben – es gibt hier nichts Neues. Ändere die Suche oder schau später wieder vorbei.",
      en: "You already applied to every result in this list – nothing new here. Change your search or check back later.",
    },
    "ov.alreadyApplied": {
      de: "⚠️ Auf diese Anzeige hast du dich bereits beworben – nicht doppelt senden. Dein Eintrag in der Bewerbungsliste bleibt unverändert.",
      en: "⚠️ You already applied to this listing – don't send twice. Your entry in the applications list stays unchanged.",
    },
    "ov.alreadyAppliedOn": {
      de: "⚠️ Bereits beworben am {d} – nicht doppelt senden. Dein Eintrag in der Bewerbungsliste bleibt unverändert.",
      en: "⚠️ Already applied on {d} – don't send twice. Your entry in the applications list stays unchanged.",
    },
    "ov.salutTitle": { de: "Erkannte Anrede – falsche Anreden werden nie geraten", en: "Detected salutation – a salutation is never guessed" },
    "ov.salutCorrect": { de: "Anrede korrigieren", en: "Correct the salutation" },
    "ov.salutNeutral": { de: "Neutral (ohne Namen)", en: "Neutral (no name)" },
    "ov.salutHallo": { de: "Hallo {name}", en: "Hallo {name}" },
    "ov.salutChanged": { de: "✓ Anrede angepasst: „{g}“", en: "✓ Salutation changed: “{g}”" },
    "ov.insert": { de: "Einfügen", en: "Insert" },
    "ov.new": { de: "Neu", en: "New" },
    "ov.copy": { de: "Kopieren", en: "Copy" },
    "ov.send": { de: "Prüfen &amp; senden", en: "Check &amp; send" },
    "ov.fillProfile": { de: "Profil ausfüllen", en: "Fill in profile" },
    "ov.nextSent": { de: "Gesendet · Nächste", en: "Sent · next" },
    "ov.skip": { de: "Überspringen", en: "Skip" },
    "ov.stop": { de: "Durchlauf stoppen", en: "Stop the run" },
    "ov.markSent": { de: "Als beworben markieren", en: "Mark as applied" },
    "ov.marked": { de: "✓ Beworben", en: "✓ Applied" },
    "ov.markedMsg": { de: "✓ Als beworben gemerkt – viel Erfolg!", en: "✓ Marked as applied – good luck!" },
    "ov.foot": {
      de: "Der Assistent sendet nie selbst. Du klickst den echten „Senden“-Knopf der Seite.",
      en: "The assistant never sends anything. You click the portal’s own “send” button.",
    },
    "ov.inserted": { de: "✓ Eingefügt. Bitte prüfen und senden.", en: "✓ Inserted. Please check it and send." },
    "ov.noFormFound": { de: "Kein Formular gefunden – bitte manuell einfügen.", en: "No form found – please paste it manually." },
    "ov.copied": { de: "✓ Kopiert.", en: "✓ Copied." },
    "ov.copyFailed": { de: "Kopieren nicht möglich – Text markieren.", en: "Copying failed – select the text instead." },
    "ov.doneMsg": {
      de: "Durchlauf abgeschlossen – alle Anzeigen dieser Liste sind durch. Öffne die Zentrale für den Überblick.",
      en: "Run finished – every listing in this list is done. Open the dashboard for the overview.",
    },
    "ov.toApplications": { de: "Zu den Bewerbungen", en: "Go to applications" },
    "ov.searchHint": {
      de: "Ich konnte die Suche hier nicht automatisch ausfüllen. Bitte gib deine Suche oben auf der Seite ein",
      en: "I could not fill in the search here automatically. Please enter your search at the top of the page",
    },
    "ov.searchHintFilters": { de: " – deine Filter: <b>{filters}</b>", en: " – your filters: <b>{filters}</b>" },
    "ov.searchHintEnd": {
      de: ". Sobald Treffer erscheinen, bereite ich jede Anzeige für dich vor.",
      en: ". As soon as results appear, I prepare every listing for you.",
    },
    "ov.filterFrom": { de: "ab {n} m²", en: "from {n} m²" },
    "ov.filterUpTo": { de: "bis {n} €", en: "up to {n} €" },
  };

  /* ================================================================
     KERN
     ================================================================ */
  let lang = "de";
  const listeners = [];

  /** Browsersprache → unterstützte Sprache (alles außer Deutsch: Englisch). */
  function detect() {
    let l = "";
    try { l = (root.navigator && (navigator.language || (navigator.languages || [])[0])) || ""; } catch (e) {}
    return /^de\b/i.test(l) ? "de" : "en";
  }

  function normalize(l) { return LANGS.indexOf(l) >= 0 ? l : null; }

  /**
   * Übersetzten Text holen. Fehlt der Schlüssel oder die englische Fassung,
   * wird deutsch (bzw. der Schlüssel selbst) geliefert – nie „undefined“ in
   * der Oberfläche.
   * @param {string} key
   * @param {Record<string, string|number>} [params] Platzhalter {name}
   */
  function t(key, params) {
    const e = DICT[key];
    let s = e ? (e[lang] != null && e[lang] !== "" ? e[lang] : e.de) : key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
    return s;
  }

  /** Existiert für die AKTUELLE Sprache ein nicht-leerer Text? (nur-EN-Hinweise) */
  function has(key) { const e = DICT[key]; return !!(e && e[lang]); }

  function setLangLocal(l) {
    l = normalize(l); if (!l || l === lang) return false;
    lang = l;
    listeners.forEach((fn) => { try { fn(lang); } catch (e) {} });
    return true;
  }

  /** Sprache setzen UND speichern (wirkt in allen Kontexten). */
  async function setLang(l) {
    l = normalize(l); if (!l) return;
    const changed = setLangLocal(l);
    if (WBA.store) await WBA.store.setLang(l);
    return changed;
  }

  /** Einmal je Kontext: gespeicherte Sprache laden, sonst Browsersprache. */
  async function init() {
    let saved = null;
    try { saved = WBA.store ? await WBA.store.getLang() : null; } catch (e) {}
    lang = normalize(saved) || detect();
    watch();
    return lang;
  }

  /** Sprachwechsel aus einem ANDEREN Kontext (z. B. Dashboard → offener Portal-Tab). */
  let watching = false;
  function watch() {
    if (watching) return;
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged) return;
    watching = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[STORAGE_KEY]) return;
      setLangLocal(changes[STORAGE_KEY].newValue);
    });
  }

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  /** Datums-/Zahlenformat passend zur Oberflächensprache (Nutzer sitzt in DE). */
  function locale() { return lang === "en" ? "en-GB" : "de-DE"; }

  /* ================================================================
     DOM-ANWENDUNG
     data-i18n            → textContent
     data-i18n-html       → innerHTML (nur eigene Wörterbuch-Texte!)
     data-i18n-attr       → "placeholder:key;title:key"
     data-i18n-only="en"  → Element nur in dieser Sprache zeigen
     ================================================================ */
  function apply(root_) {
    const doc = root_ || (typeof document !== "undefined" ? document : null);
    if (!doc || !doc.querySelectorAll) return;
    doc.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
    // innerHTML ist hier unbedenklich: die Texte stammen ausschließlich aus DICT
    // (statisch, kein Nutzer-Input) – dieselbe Zusicherung wie bei lib/icons.js.
    doc.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
    doc.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.getAttribute("data-i18n-attr").split(";").forEach((pair) => {
        const i = pair.indexOf(":"); if (i < 0) return;
        const attr = pair.slice(0, i).trim(), key = pair.slice(i + 1).trim();
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
    doc.querySelectorAll("[data-i18n-only]").forEach((el) => {
      el.hidden = el.getAttribute("data-i18n-only") !== lang;
    });
    if (doc.documentElement && doc.documentElement.setAttribute) doc.documentElement.setAttribute("lang", lang);
  }

  WBA.i18n = {
    get lang() { return lang; },
    LANGS, STORAGE_KEY, DICT,
    t, has, init, setLang, onChange, detect, locale, apply,
  };
})(typeof self !== "undefined" ? self : this);
