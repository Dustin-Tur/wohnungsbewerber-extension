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

    /* ---- lib/store.js: kontextübergreifender Schreib-Mutex (FUN-02) ---- */
    /** Ein gehaltener Lock gilt als verwaist und wird übernommen, wenn er älter
     *  ist (ms) – ein abgestürzter Tab blockiert damit nie dauerhaft. */
    LOCK_EXPIRY_MS: 8000,
    /** Max. Wartezeit auf den Lock (ms); > LOCK_EXPIRY_MS, damit ein verwaister
     *  Lock innerhalb der Wartezeit sicher abläuft. Danach sichtbarer Fehler. */
    LOCK_TIMEOUT_MS: 10000,

    /* ---- QUA-06: lokaler Selbsttest gegen Portal-Umbauten ---- */
    /** Ab so vielen „Anzeigenseite ohne Kontaktformular"-Fehlschlägen in Folge
     *  zeigt das Dashboard die Portal-Warnung. */
    SELFCHECK_WARN_FROM: 5,

    /* ---- LEG-13: Speicherbegrenzung ---- */
    /** Anschreiben-Verlauf: Einträge älter als so viele Tage werden beim
     *  Dashboard-Start automatisch entfernt (Datensparsamkeit). */
    HISTORY_MAX_AGE_DAYS: 90,
    /** Tracker-Aufräum-Knopf: löscht Einträge, die älter sind als so viele Tage
     *  und weder Antwort noch Besichtigung haben. */
    TRACKER_CLEANUP_AGE_DAYS: 90,

    /* ---- dashboard.js: Bewerbungs-Cockpit ---- */
    /** Nach so vielen Tagen ohne Antwort auf eine Bewerbung („beworben")
     *  schlägt der Tracker das Nachfassen vor. */
    FOLLOWUP_AFTER_DAYS: 4,

    /* ---- lib/ai.js: KI-Aufrufe ---- */
    /** Timeout für Anthropic-Fetches (ms). */
    AI_TIMEOUT_MS: 30000,
    /** Ab so vielen Anzeigen fragt der Durchlauf-Start bei aktivierter KI nach –
     *  jede Anzeige löst einen kostenpflichtigen Call über den Nutzer-Schlüssel aus. */
    AI_RUN_CONFIRM_FROM: 5,

    /* ---- lib/letter.js: Anti-Wiederholung ---- */
    /** Anzahl gespeicherter Text-Fingerprints (letzte N Anschreiben). */
    TEXT_HISTORY_SIZE: 20,
    /** Max. erlaubte Trigramm-Überlappung mit jedem historischen Text (0..1). */
    TEXT_OVERLAP_LIMIT: 0.4,
    /** Max. Würfel-Versuche, bevor der beste Kandidat genommen wird. */
    TEXT_MAX_ATTEMPTS: 5,
  };

  /* Design-Tokens für JS-erzeugte Oberflächen: das Overlay im Shadow DOM und der
     Puls-Stil auf der Portalseite (UX-08). WERTE-PAARUNG mit shared.css :root –
     CSS kann keine JS-Werte lesen, deshalb ZWEI dokumentierte Orte statt
     verstreuter Literale. Bei Farbänderungen BEIDE Stellen pflegen
     (shared.css trägt den Gegen-Hinweis). */
  WBA.TOKENS = {
    accent: "#17795A", accentRgb: "23,121,90",   // shared.css --accent
    accentDark: "#0f6047",                        // dunkles Ende von --grad
    accent2Rgb: "203,110,69",                     // --accent-2 (#CB6E45)
    text: "#1B2420", muted: "#56615A",            // --text / --muted
    border: "rgba(27,36,32,0.14)",                // --border
    card: "#ffffff", inputBg: "#F5EEE2",          // --card / --input-bg
    ok: "#16a34a", okRgb: "22,163,74", okText: "#15803d",  // --ok + Lesetext
    warn: "#b45309", warnRgb: "180,83,9",         // --warn
    dark: {                                        // shared.css html[data-theme="dark"]
      text: "#F2EDE3", muted: "#A79F92",
      border: "rgba(255,249,240,0.15)",
      card: "#1C1A16", inputBg: "rgba(255,249,240,0.05)",
      accent: "#3FBE8E", accentRgb: "63,190,142",
      okText: "#34d399",
    },
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
