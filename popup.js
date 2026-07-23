/* Mini-Launcher: öffnet die Vollseiten-App (dashboard.html) bzw. fokussiert einen
   bereits offenen App-Tab, und schließt sich sofort selbst. Selbstenthaltend –
   unabhängig vom Service-Worker, damit hier nie ein „Datei nicht gefunden" auftritt. */
(function () {
  "use strict";

  // Beschriftung für Nicht-Deutschsprachige. Bewusst die BROWSERSPRACHE und
  // synchron: der Launcher schließt sich nach wenigen Millisekunden wieder, für
  // ein asynchrones chrome.storage-Lesen (die vom Nutzer gewählte Sprache) bleibt
  // keine Zeit. Muss hier stehen und nicht als Inline-Script in popup.html –
  // Manifest V3 erzwingt script-src 'self' und blockiert Inline-Scripts.
  try {
    if (!/^de\b/i.test(navigator.language || "")) {
      const s = document.getElementById("s");
      if (s) s.textContent = "opening …";
    }
  } catch (e) {}

  function done() { try { window.close(); } catch (e) {} }
  try {
    var base = chrome.runtime.getURL("dashboard.html");
    chrome.tabs.query({}, function (tabs) {
      if (chrome.runtime.lastError) { chrome.tabs.create({ url: base }); done(); return; }
      var ex = (tabs || []).find(function (t) { return t.url && t.url.indexOf(base) === 0; });
      if (ex) {
        // Tab kann zwischen query und update geschlossen worden sein → dann neu öffnen.
        chrome.tabs.update(ex.id, { active: true }, function () {
          if (chrome.runtime.lastError) { chrome.tabs.create({ url: base }); done(); return; }
          if (ex.windowId != null && chrome.windows) {
            chrome.windows.update(ex.windowId, { focused: true }, function () { void chrome.runtime.lastError; done(); });
          } else done();
        });
      } else {
        chrome.tabs.create({ url: base });
        done();
      }
    });
  } catch (e) {
    try { chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") }); } catch (e2) {}
    done();
  }
})();
