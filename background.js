/* background.js – schlanker Service-Worker.
   - Der Klick aufs Symbol öffnet den Mini-Launcher (popup.html), der die App öffnet/fokussiert.
   - Content-Scripts können keine Tabs öffnen → sie schicken "openDashboard" hierher.
   - KI-Anfragen ("aiGenerate") laufen hier: der Service-Worker macht den API-Call
     (umgeht die CSP der Portalseiten und hält den Key aus dem Seitenkontext heraus).
   - openOrFocusDashboard dedupliziert (fokussiert offenen App-Tab, statt neu zu öffnen).

   DESIGN-INVARIANTE: Dieser Worker macht NUR den KI-Textabruf und öffnet/fokussiert
   das Dashboard. Er darf NIE Formulare auf Portalseiten absenden oder Nachrichten im
   Namen des Nutzers verschicken – Senden bleibt immer eine manuelle Nutzer-Handlung
   (siehe ausführliche Invariante am Kopf von content.js). */
"use strict";

importScripts("lib/config.js", "lib/i18n.js", "lib/parse.js", "lib/salutation.js", "lib/letter.js", "lib/store.js", "lib/ai.js");

function openOrFocusDashboard(hash) {
  const base = chrome.runtime.getURL("dashboard.html");
  const openNew = () => { try { chrome.tabs.create({ url: base + (hash ? "#" + hash : "") }); } catch (e) {} };
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError) { openNew(); return; }
    const existing = (tabs || []).find((t) => t.url && t.url.indexOf(base) === 0);
    if (!existing) { openNew(); return; }
    const target = hash ? base + "#" + hash : undefined;
    // Tab kann zwischen query und update geschlossen worden sein → lastError
    // prüfen und dann sauber einen neuen Tab öffnen.
    chrome.tabs.update(existing.id, target ? { active: true, url: target } : { active: true }, () => {
      if (chrome.runtime.lastError) { openNew(); return; }
      if (existing.windowId != null) {
        chrome.windows.update(existing.windowId, { focused: true }, () => { void chrome.runtime.lastError; });
      }
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "openDashboard") {
    openOrFocusDashboard(msg.hash);
    sendResponse && sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "aiGenerate") {
    (async () => {
      try {
        const settings = await WBA.store.getSettings();
        if (!WBA.ai.isConfigured(settings)) { sendResponse({ error: "not_configured" }); return; }
        const text = await WBA.ai.callProvider(settings, msg.payload || {});
        sendResponse(text ? { text } : { error: "empty" });
      } catch (e) {
        if (WBA.log) WBA.log.debug("aiGenerate fehlgeschlagen:", e);
        sendResponse({ error: String((e && e.message) || e) });
      }
    })();
    return true; // asynchron antworten
  }

  return false;
});

// Oberflächensprache EINMAL festschreiben, damit sie nie „springt":
//  - Neuinstallation: keine Festlegung → lib/i18n.js nimmt die Browsersprache
//    (englischer Browser ⇒ englische Oberfläche, genau die Expat-Zielgruppe).
//  - Update einer bestehenden Installation: die BISHER GEZEIGTE Sprache festschreiben
//    (i18n.detect() = dieselbe Ableitung aus der Browsersprache, die bis dahin galt).
//    Hart auf Deutsch zu pinnen wäre falsch, seit es die englische Oberfläche gibt:
//    ein Expat mit englischem Browser säße nach dem Update vor deutschen Knöpfen (FUN-11).
async function pinLanguageOnUpdate() {
  try {
    if (await WBA.store.getLang()) return; // Nutzer hat bereits selbst gewählt
    await WBA.store.setLang(WBA.i18n.detect());
  } catch (e) { if (WBA.log) WBA.log.debug("Sprache konnte nicht festgeschrieben werden:", e); }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") openOrFocusDashboard("profil");
  else if (details.reason === "update") pinLanguageOnUpdate();
});
