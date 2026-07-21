# WohnungsBewerber – Chrome-Erweiterung

Hilft dir, auf den großen Portalen (WG-Gesucht, Kleinanzeigen, ImmoScout24, Immowelt/Immonet)
Wohnungen zu finden und die Bewerbungen vorzubereiten – **du prüfst und sendest jede Nachricht
selbst**. Es wird nie automatisch versendet. Alles läuft lokal, keine Datenweitergabe.

**Einfach herunterladen, installieren, fertig.** Die Erweiterung erstellt Anschreiben komplett
kostenlos und ohne Internetverbindung – es ist keinerlei Einrichtung nötig.

## Installieren (einmalig, ca. 1 Minute)

1. Öffne in Chrome die Seite `chrome://extensions`
2. Oben rechts **„Entwicklermodus"** einschalten.
3. Auf **„Entpackte Erweiterung laden"** klicken.
4. Diesen Ordner (`chrome-extension`) auswählen.
5. Fertig – das 🏠-Symbol erscheint in der Symbolleiste (ggf. übers Puzzle-Symbol anpinnen).

## Nach einem Update neu laden (wichtig!)

Wenn eine neue Version eingespielt wurde, reicht es **nicht**, nur die Erweiterung neu zu laden –
bereits geöffnete Wohnungs-Tabs verwenden sonst noch die alte Version. Immer beide Schritte:

1. `chrome://extensions` öffnen → bei „WohnungsBewerber" auf **⟳ (neu laden)** klicken.
2. **Jeden offenen Wohnungs-Anzeige-Tab neu laden** (⌘R / F5) – dieser Schritt ist zwingend.
3. Kontrolle: Im Overlay (oben rechts) steht eine kleine **Versionsnummer** (z. B. `v1.7.0`).
   Stimmt sie mit der aktuellen Version überein, läuft der neue Code.

## Benutzen

**Ein Klick aufs 🏠-Symbol öffnet die App** (als eigener Tab; ein bereits offener App-Tab wird
wiederverwendet). Die App hat oben die Navigation:
- **🔎 Suchen** – Ort, Größe, Preis, Zimmer und Portale wählen → „Suche starten" öffnet die Suche
  und füllt die Filter auf dem Portal selbst aus. (Bei ImmoScout/Immowelt kann der Bot-Schutz bremsen.)
- **✍️ Anschreiben** – Anzeigentext einfügen/aus offenem Tab laden, Ton wählen, Anschreiben erzeugen.
- **📮 Bewerbungen** – Überblick, welche Wohnungen du beworben hast (Status, Export als CSV).
- **👤 Profil** – einmal ausfüllen (Name, Kontakt … – wird lokal gespeichert).
- **📄 Unterlagen** – Selbstauskunft als PDF erstellen und Checkliste abhaken.

**Auf einer Wohnungsanzeige** erscheint automatisch ein kleines Overlay: Es füllt dein Anschreiben
ins Kontaktformular und hebt den echten „Senden"-Knopf hervor – **du prüfst und sendest selbst**.

**Ganz unten auf der Seite** gibt es einen ausgegrauten Punkt „⚙️ Nur für Experten: eigene
KI-Anbindung". Das ist **komplett optional und standardmäßig aus** – die eingebaute Vorlage reicht
für alle Anschreiben aus. Nur wer selbst einen Claude-API-Schlüssel besitzt und weiß, dass dabei
eigene Kosten entstehen, kann dort optional eine externe KI-Anbindung hinterlegen.

## Warum das lokal funktioniert

Die Erweiterung liest Anzeigen **direkt auf der Seite, auf der du gerade bist** – dort gibt es
keine Portalsperre (CORS). Nachrichten werden nie automatisch gesendet: Der Assistent bereitet nur
vor, du bestätigst selbst. So bleibt dein Konto sicher.

## Aufbau der Dateien

- `manifest.json` – Konfiguration der Erweiterung (Manifest V3)
- `dashboard.html` / `dashboard.js` – die App (Suche, Anschreiben, Bewerbungen, Profil, Unterlagen)
- `content.js` – läuft auf den Portalseiten: füllt Such- & Kontaktformular vor und zeigt das Overlay
- `background.js` – Service-Worker: öffnet/fokussiert die App beim Klick aufs Symbol
- `shared.css` – gemeinsames Design-System
- `lib/parse.js` – Erkennung von Eckdaten (inkl. Ort & Ausstattung) aus Anzeigentext
- `lib/letter.js` – Erzeugung der Anschreiben (lokale Vorlage, Standard – kostenlos, offline)
- `lib/ai.js` – optionale, standardmäßig ausgeschaltete externe KI-Anbindung (Experten-Feature)
- `lib/portals.js` – Portal-Adapter (Such-URLs + Formular-Erkennung; je Portal erweiterbar)
- `lib/store.js` – lokaler Speicher (chrome.storage) für Profil, Filter, Bewerbungen …
- `icons/` – Toolbar-Icons (16/32/48/128)
