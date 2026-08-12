# WohnungsBewerber 🏠

**Chrome-Extension, die den Bewerbungsprozess bei der Wohnungssuche automatisiert.**
Sie erkennt Wohnungsanzeigen auf den großen Portalen und bereitet in Sekunden eine individuelle Bewerbung vor – prüfen und absenden machst du selbst.

🔗 **Live & Infos:** [wohnungsbewerber.app](https://wohnungsbewerber.app)
🧩 **Veröffentlicht im Chrome Web Store** · aktuelle Version: siehe [manifest.json](manifest.json) bzw. Store-Eintrag · Manifest V3

---

## Was die Extension macht
- Erkennt Wohnungsanzeigen auf **ImmobilienScout24, Kleinanzeigen, WG-Gesucht & Immowelt**
- Liest die relevanten Eckdaten der Anzeige aus (Parsing)
- Erstellt in Sekunden ein passendes, persönliches Anschreiben – **lokal auf deinem Gerät**, inklusive korrekter Anrede (optional per eigener Claude-Anbindung)
- Verwaltet deine Bewerberdaten **lokal im Browser** – keine Datenweitergabe
- Du behältst die Kontrolle: **Prüfen und Absenden übernimmst du selbst**

## Datenschutz
Alle Daten bleiben **lokal** auf deinem Gerät (`chrome.storage`). Die Anschreiben werden **standardmäßig direkt im Browser** erzeugt – ohne eigenen Server, ohne Internetverbindung, kostenlos. Kein Tracking, keine Weitergabe.

Optionales Experten-Feature (standardmäßig **aus**): Wer möchte, kann einen **selbst hinterlegten** Anthropic-API-Key eintragen, um die Texte stattdessen von Claude formulieren zu lassen. Nur dann werden Anzeigen- und Profildaten an Anthropic übertragen, und es entstehen eigene Kosten beim Nutzer.

## Technik
- **JavaScript**, **Chrome Extension APIs (Manifest V3)**
- Modularer Aufbau in `lib/` (Parsing, Portale, lokaler Anschreiben-Generator `letter.js`, optionale KI-Anbindung …)
- Service Worker (`background.js`), Content Scripts, Dashboard-Oberfläche
- **Optionale** Anbindung der Anthropic Claude API (Experten-Feature, standardmäßig aus)
- Eigene Tests in `tests/`

## Projektstruktur
| Datei / Ordner | Inhalt |
|---|---|
| `manifest.json` | Extension-Konfiguration (Manifest V3) |
| `content.js` | Läuft auf den Portal-Seiten, steuert die Erkennung |
| `dashboard.html` / `dashboard.js` | Oberfläche zum Verwalten von Daten & Bewerbungen |
| `lib/` | Kernlogik: `parse.js`, `portals.js`, `letter.js`, `ai.js`, `store.js` … |
| `icons/` | Extension-Icons |
| `tests/` | Tests |

## Entstehung
Konzipiert, entwickelt und veröffentlicht von **Dustin Tur** – KI-gestützt gebaut („Vibe Coding") mit **Claude Code**, von der ersten Idee bis zum Live-Betrieb.

---
*Dieses Repository enthält den Extension-Code. Marketing-Assets und die Landingpage sind bewusst ausgeklammert.*

---

## Lizenz & Rechte
© 2026 Dustin Tur. Alle Rechte vorbehalten.

Dieser Quellcode darf zur **Ansicht und Bewertung** (z. B. im Rahmen einer Bewerbung) eingesehen werden. Eine Weiterverwendung, Vervielfältigung, Veröffentlichung oder Verbreitung – ganz oder in Teilen – ist ohne vorherige schriftliche Zustimmung des Autors nicht gestattet.
