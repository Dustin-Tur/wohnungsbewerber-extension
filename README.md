# WohnungsBewerber 🏠

**Chrome-Extension, die den Bewerbungsprozess bei der Wohnungssuche automatisiert.**
Sie erkennt Wohnungsanzeigen auf den großen Portalen und bereitet in Sekunden eine individuelle Bewerbung vor – prüfen und absenden machst du selbst.

🔗 **Live & Infos:** [wohnungsbewerber.app](https://wohnungsbewerber.app)
🧩 **Veröffentlicht im Chrome Web Store** · Version 2.4.5 · Manifest V3

---

## Was die Extension macht
- Erkennt Wohnungsanzeigen auf **ImmobilienScout24, Kleinanzeigen, WG-Gesucht, Immowelt & Immonet**
- Liest die relevanten Eckdaten der Anzeige aus (Parsing)
- Erstellt mit KI (**Claude**) ein passendes, persönliches Anschreiben – inklusive korrekter Anrede
- Verwaltet deine Bewerberdaten **lokal im Browser** – keine Datenweitergabe
- Du behältst die Kontrolle: **Prüfen und Absenden übernimmst du selbst**

## Datenschutz
Alle Daten bleiben **lokal** auf deinem Gerät (`chrome.storage`). Es gibt keinen eigenen Server; für die Textgenerierung wird ein **von dir selbst hinterlegter** Anthropic-API-Key genutzt. Kein Tracking, keine Weitergabe.

## Technik
- **JavaScript**, **Chrome Extension APIs (Manifest V3)**
- Modularer Aufbau in `lib/` (Parsing, Portale, Anschreiben, KI-Anbindung …)
- Service Worker (`background.js`), Content Scripts, Dashboard-Oberfläche
- Anbindung der **Anthropic Claude API**
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
