/* WBA.CONFIG + WBA.log – zentrale Konstanten und konsistentes Logging.
   Wird in ALLEN Kontexten als ERSTES Modul geladen (manifest.json,
   background.js/importScripts, dashboard.html), damit jedes Modul darauf
   zugreifen kann. Läuft in Fenster- wie Worker-Kontext. */
(function (root) {
  "use strict";
  const WBA = (root.WBA = root.WBA || {});

  /**
   * Zentrale Konstanten. Für Debug-Ausgaben in einer laufenden Extension:
   * in der Konsole des jeweiligen Kontexts `WBA.CONFIG.DEBUG = true` setzen.
   * @type {{DEBUG: boolean} & Record<string, number>}
   */
  WBA.CONFIG = {
    /** Ausführliche Debug-Logs (WBA.log.debug) aktivieren. */
    DEBUG: false,

    /* ---- content.js: Seiten-Erkennung & Formulare ---- */
    /** Max. Wartezeit, bis eine Seite als Listing/Trefferliste erkennbar ist (ms). */
    DETECT_TIMEOUT_MS: 9000,
    /** Max. Wartezeit auf das Kontaktformular-Nachrichtenfeld (ms). */
    FORM_TIMEOUT_MS: 5000,
    /** Max. Wartezeit auf die Portal-Suchmaske vor driveSearchForm (ms). */
    SEARCH_FORM_TIMEOUT_MS: 4000,
    /** Drosselung der MutationObserver-Prüfungen (ms). */
    MUTATION_THROTTLE_MS: 250,
    /** Entprellung des SPA-URL-Watchers (ms). */
    URL_WATCH_DEBOUNCE_MS: 300,
    /** Bewerbungs-Durchläufe verfallen nach dieser Zeit (ms): ein tagealter,
     *  nie gestoppter Durchlauf soll nicht plötzlich „Anzeige 3/12" anzeigen
     *  oder beim nächsten Portal-Besuch weiterlaufen. 12 h deckt auch lange
     *  Bewerbungs-Sessions ab. */
    RUN_EXPIRY_MS: 12 * 60 * 60 * 1000,
    /** Angeforderte Portal-Suchen (wba_pending) verfallen nach dieser Zeit (ms):
     *  ein Suchauftrag gilt für die aktuelle Sitzung – er darf nicht Wochen
     *  später beim nächsten Portal-Besuch ungefragt die Suchmaske abschicken. */
    PENDING_EXPIRY_MS: 10 * 60 * 1000,

    /* ---- dashboard.js: Bewerbungs-Cockpit ---- */
    /** Nach so vielen Tagen ohne Antwort auf eine Bewerbung („beworben")
     *  schlägt der Tracker das Nachfassen vor. */
    FOLLOWUP_AFTER_DAYS: 4,

    /* ---- lib/ai.js: KI-Aufrufe ---- */
    /** Timeout für Anthropic-Fetches (ms). */
    AI_TIMEOUT_MS: 30000,

    /* ---- lib/letter.js: Anti-Wiederholung ---- */
    /** Anzahl gespeicherter Text-Fingerprints (letzte N Anschreiben). */
    TEXT_HISTORY_SIZE: 20,
    /** Max. erlaubte Trigramm-Überlappung mit jedem historischen Text (0..1). */
    TEXT_OVERLAP_LIMIT: 0.4,
    /** Max. Würfel-Versuche, bevor der beste Kandidat genommen wird. */
    TEXT_MAX_ATTEMPTS: 5,
  };

  /**
   * Einheitliches Logging mit "[WBA]"-Präfix.
   * error/warn erscheinen immer; info/debug nur mit WBA.CONFIG.DEBUG = true
   * (Ausnahme: info wird für die Build-Kennung genutzt und erscheint immer).
   */
  WBA.log = {
    error: (...a) => console.error("[WBA]", ...a),
    warn: (...a) => console.warn("[WBA]", ...a),
    info: (...a) => console.info("[WBA]", ...a),
    debug: (...a) => { if (WBA.CONFIG.DEBUG) console.debug("[WBA]", ...a); },
  };
})(typeof self !== "undefined" ? self : this);
