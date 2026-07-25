/* WBA.store – zentraler Speicher (chrome.storage.local) für alle Kontexte.
   Kapselt Keys + async Zugriff und migriert einmalig alte localStorage-Daten.
   In Erweiterungsseiten (Popup/Dashboard) ist localStorage der alten Version
   erreichbar; dort läuft die Migration. */
(function (root) {
  "use strict";
  const WBA = (root.WBA = root.WBA || {});

  const KEYS = {
    profile: "wba_profile",
    flat: "wba_flat",
    theme: "wba_theme",
    lang: "wba_lang",          // Oberflächensprache "de"/"en" (lib/i18n.js)
    history: "wba_history",
    docs: "wba_docs",
    filters: "wba_filters",
    tracker: "wba_tracker",
    run: "wba_run",            // laufender Bewerbungs-Durchlauf (Queue-Status)
    settings: "wba_settings",  // KI-Einstellungen (Modus, API-Key, Modell)
    pending: "wba_pending",    // angeforderte Suche, die das Content-Script noch ausfüllen soll
    textfp: "wba_textfp",      // Trigramm-Fingerprints der letzten 20 Anschreiben (Anti-Wiederholung)
    lastUrl: "wba_lasturl",
    migrated: "wba_migrated_v1",
  };

  const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

  // Alle Callbacks prüfen chrome.runtime.lastError (sonst „Unchecked runtime.lastError"
  // in der Konsole). get() fällt im Fehlerfall auf die Defaults zurück, statt zu
  // hängen; set()/remove() REJECTEN dagegen (FUN-03) – ein fehlgeschlagener
  // Schreibvorgang darf für Aufrufer nie wie Erfolg aussehen. Jeder Aufrufer
  // behandelt den Fehler selbst (Meldung oder bewusstes log.warn).
  function get(defaults) {
    // defaults: Objekt { key: fallback }
    return new Promise((resolve) => {
      if (!hasChrome) { resolve(Object.assign({}, defaults)); return; }
      try {
        chrome.storage.local.get(defaults, (res) => {
          if (chrome.runtime.lastError) { resolve(Object.assign({}, defaults)); return; }
          resolve(res || {});
        });
      } catch (e) { resolve(Object.assign({}, defaults)); }
    });
  }
  function set(obj) {
    return new Promise((resolve, reject) => {
      if (!hasChrome) { resolve(); return; }
      try {
        chrome.storage.local.set(obj, () => {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          resolve();
        });
      } catch (e) { reject(e); }
    });
  }
  function remove(keys) {
    return new Promise((resolve, reject) => {
      if (!hasChrome) { resolve(); return; }
      try {
        chrome.storage.local.remove(keys, () => {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          resolve();
        });
      } catch (e) { reject(e); }
    });
  }

  // Bequeme, typisierte Zugriffe -----------------------------------------
  async function getProfile() { return (await get({ [KEYS.profile]: {} }))[KEYS.profile] || {}; }
  async function setProfile(p) { return set({ [KEYS.profile]: p }); }

  async function getFlat() { return (await get({ [KEYS.flat]: {} }))[KEYS.flat] || {}; }
  async function setFlat(f) { return set({ [KEYS.flat]: f }); }

  async function getTheme() { return (await get({ [KEYS.theme]: null }))[KEYS.theme]; }
  async function setTheme(t) { return set({ [KEYS.theme]: t }); }

  // Oberflächensprache: null = noch nie gewählt → lib/i18n.js nimmt die Browsersprache.
  async function getLang() { return (await get({ [KEYS.lang]: null }))[KEYS.lang]; }
  async function setLang(l) { return set({ [KEYS.lang]: l }); }

  async function getHistory() { return (await get({ [KEYS.history]: [] }))[KEYS.history] || []; }
  async function setHistory(l) { return set({ [KEYS.history]: l }); }

  async function getDocs() { return (await get({ [KEYS.docs]: {} }))[KEYS.docs] || {}; }
  async function setDocs(d) { return set({ [KEYS.docs]: d }); }

  async function getFilters() { return (await get({ [KEYS.filters]: {} }))[KEYS.filters] || {}; }
  async function setFilters(f) { return set({ [KEYS.filters]: f }); }

  async function getTracker() { return (await get({ [KEYS.tracker]: [] }))[KEYS.tracker] || []; }
  async function setTracker(l) { return set({ [KEYS.tracker]: l }); }

  async function getRun() { return (await get({ [KEYS.run]: null }))[KEYS.run]; }
  async function setRun(r) { return set({ [KEYS.run]: r }); }

  async function getPending() { return (await get({ [KEYS.pending]: null }))[KEYS.pending]; }
  async function setPending(p) { return p ? set({ [KEYS.pending]: p }) : remove(KEYS.pending); }

  async function getSettings() { return (await get({ [KEYS.settings]: {} }))[KEYS.settings] || {}; }
  async function setSettings(s) { return set({ [KEYS.settings]: s }); }

  /**
   * Fingerprints der letzten N generierten Anschreiben (Anti-Wiederholung).
   * Eintrag: { ts: number, h: number[] } – Trigramm-Hashes, siehe WBA.letter.generate().
   * @returns {Promise<Array<{ts: number, h: number[]}>>}
   */
  async function getTextFPs() { return (await get({ [KEYS.textfp]: [] }))[KEYS.textfp] || []; }
  /** Fingerprint vorne anfügen; Liste auf CONFIG.TEXT_HISTORY_SIZE (20) begrenzen. */
  function pushTextFP(fp) {
    return withWriteLock(async () => {
      const list = await getTextFPs();
      list.unshift(fp);
      const max = (WBA.CONFIG && WBA.CONFIG.TEXT_HISTORY_SIZE) || 20;
      return set({ [KEYS.textfp]: list.slice(0, max) });
    });
  }

  // Tracker-Helfer: eindeutige Bewerbung finden / hinzufügen ---------------
  function trackerKey(portal, listingId) { return portal + ":" + listingId; }

  // Read-Modify-Write-Zyklen serialisieren (Tracker-Liste, Text-Fingerprints).
  // ZWEI Ebenen (FUN-02):
  //  1) Lokaler Promise-Lock: serialisiert Aufrufe INNERHALB dieses Kontexts.
  //  2) Storage-Mutex (wba_lock): serialisiert über Kontexte hinweg – jeder
  //     Portal-Tab, das Dashboard und der Service-Worker laden eigene Kopien
  //     dieses Moduls; chrome.storage.local ist Last-Write-Wins, parallele
  //     Tabs (der Suche-Autopilot öffnet sie selbst) verloren sonst Einträge.
  // chrome.storage hat kein Compare-and-Swap. Muster daher: Anspruch schreiben,
  // kurzen Zufallsversatz warten, gegenlesen – nur wenn der eigene Anspruch noch
  // steht, gilt der Lock als gehalten. Das schließt das Kollisionsfenster nicht
  // auf null, verkleinert es aber von „jederzeit" auf wenige Millisekunden.
  // Ein verwaister Lock (Tab abgestürzt) läuft nach LOCK_EXPIRY_MS ab; nach
  // LOCK_TIMEOUT_MS gibt es einen Fehler, den das FUN-03-Netz sichtbar macht.
  const LOCK_KEY = "wba_lock";
  const LOCK_ID = Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
  const randMs = (min, max) => min + Math.floor(Math.random() * (max - min));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function acquireStorageLock() {
    if (!hasChrome) return; // ohne chrome.storage gibt es keinen zweiten Kontext
    const C = WBA.CONFIG || {};
    const expiry = C.LOCK_EXPIRY_MS || 8000;
    const timeout = C.LOCK_TIMEOUT_MS || 10000;
    const t0 = Date.now();
    for (;;) {
      const cur = (await get({ [LOCK_KEY]: null }))[LOCK_KEY];
      if (!cur || !cur.ts || Date.now() - cur.ts > expiry) {
        await set({ [LOCK_KEY]: { id: LOCK_ID, ts: Date.now() } });
        await sleep(randMs(15, 40));
        const check = (await get({ [LOCK_KEY]: null }))[LOCK_KEY];
        if (check && check.id === LOCK_ID) return;
      }
      if (Date.now() - t0 > timeout) throw new Error("Speicher-Lock nicht verfügbar (Timeout)");
      await sleep(randMs(25, 60));
    }
  }
  async function releaseStorageLock() {
    if (!hasChrome) return;
    try {
      const cur = (await get({ [LOCK_KEY]: null }))[LOCK_KEY];
      if (cur && cur.id === LOCK_ID) await remove(LOCK_KEY);
    } catch (e) { (WBA.log || console).warn("Lock-Freigabe fehlgeschlagen (läuft ab):", e); }
  }
  let writeLock = Promise.resolve();
  function withWriteLock(fn) {
    const job = async () => {
      await acquireStorageLock();
      try { return await fn(); }
      finally { await releaseStorageLock(); }
    };
    const run = writeLock.then(job, job);
    writeLock = run.then(() => {}, () => {});
    return run;
  }

  /**
   * Tracker-Eintrag anlegen oder (per portal+listingId) mergen – serialisiert
   * über den Write-Lock, damit parallele Aufrufe keine Einträge verlieren.
   * @param {{portal: string, listingId: string, status?: string, title?: string,
   *   url?: string, ort?: string, qm?: string, preis?: string, ton?: string}} entry
   * @returns {Promise<Array<Object>>} Aktualisierte Liste.
   */
  function upsertTracker(entry) {
    return withWriteLock(async () => {
      const list = await getTracker();
      const key = trackerKey(entry.portal, entry.listingId);
      const idx = list.findIndex((e) => trackerKey(e.portal, e.listingId) === key);
      const prev = idx >= 0 ? list[idx] : null;
      const merged = Object.assign({}, prev || { ts: Date.now() }, entry);
      // Bewerbungs-Zeitpunkt zentral stempeln (Basis der Nachfass-Erinnerung):
      // beim ERSTEN Wechsel auf „beworben" – egal ob aus content.js (advance/
      // markSent) oder dem Dashboard-Select. Bleibt danach stabil.
      if (entry.status === "beworben" && (!prev || prev.status !== "beworben") && !merged.appliedAt) {
        merged.appliedAt = Date.now();
      }
      // Antwort-Zeitpunkt analog stempeln – beim ERSTEN Wechsel auf „antwort"
      // oder „besichtigung" (eine Besichtigung kann direkt gesetzt werden, ohne
      // dass vorher „antwort" durchlaufen wurde). Bleibt danach stabil und ist
      // die einzige Grundlage der Antwortzeit in lib/stats.js.
      const REPLIED = ["antwort", "besichtigung"];
      if (REPLIED.includes(entry.status) && (!prev || !REPLIED.includes(prev.status)) && !merged.repliedAt) {
        merged.repliedAt = Date.now();
      }
      // Fehlklicks korrigierbar machen (FUN-15): Wird der Status ausdrücklich auf
      // einen Nicht-Antwort-Status zurückgesetzt, fällt auch der Antwort-Zeitstempel
      // weg – sonst verfälscht ein versehentliches „Antwort erhalten" dauerhaft die
      // Antwortzeit-Statistik (lib/stats.js) und ließe sich nur durch Löschen des
      // ganzen Eintrags beheben.
      if (entry.status && !REPLIED.includes(entry.status) && merged.repliedAt) {
        delete merged.repliedAt;
      }
      if (idx >= 0) list[idx] = merged;
      else list.unshift(merged);
      await setTracker(list);
      return list;
    });
  }

  /**
   * Tracker-Eintrag löschen (per portal+listingId) – serialisiert über den
   * Write-Lock, damit parallele Upserts keine Einträge wiederbeleben.
   * @param {string} portal @param {string} listingId
   * @returns {Promise<Array<Object>>} Aktualisierte Liste.
   */
  function removeTracker(portal, listingId) {
    return withWriteLock(async () => {
      const list = await getTracker();
      const key = trackerKey(portal, listingId);
      const next = list.filter((e) => trackerKey(e.portal, e.listingId) !== key);
      await setTracker(next);
      return next;
    });
  }

  /**
   * Wurde die Anzeige bereits beworben (Status „beworben"/„antwort"/„besichtigung")?
   * „Übersprungen" zählt bewusst NICHT – soll bei neuem Durchlauf wieder auftauchen.
   * @param {string} portal @param {string} listingId @returns {Promise<boolean>}
   */
  const APPLIED_STATUS = ["beworben", "antwort", "besichtigung"];
  async function hasApplied(portal, listingId) {
    const list = await getTracker();
    const key = trackerKey(portal, listingId);
    return list.some((e) => trackerKey(e.portal, e.listingId) === key && APPLIED_STATUS.includes(e.status));
  }

  // Einmalige Migration alter localStorage-Daten -> chrome.storage ---------
  async function migrate() {
    if (!hasChrome) return;
    const state = await get({ [KEYS.migrated]: false });
    if (state[KEYS.migrated]) return;
    if (typeof localStorage === "undefined") { await set({ [KEYS.migrated]: true }); return; }

    const toCopy = {};
    const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };

    const prof = readJSON(KEYS.profile); if (prof) toCopy[KEYS.profile] = prof;
    const flat = readJSON(KEYS.flat); if (flat) toCopy[KEYS.flat] = flat;
    const hist = readJSON(KEYS.history); if (hist) toCopy[KEYS.history] = hist;
    const docs = readJSON(KEYS.docs); if (docs) toCopy[KEYS.docs] = docs;
    const theme = localStorage.getItem(KEYS.theme); if (theme) toCopy[KEYS.theme] = theme;
    const lastUrl = localStorage.getItem(KEYS.lastUrl); if (lastUrl) toCopy[KEYS.lastUrl] = lastUrl;

    toCopy[KEYS.migrated] = true;
    await set(toCopy);
  }

  WBA.store = {
    KEYS,
    get, set, remove,
    getProfile, setProfile,
    getFlat, setFlat,
    getTheme, setTheme,
    getLang, setLang,
    getHistory, setHistory,
    getDocs, setDocs,
    getFilters, setFilters,
    getTracker, setTracker,
    getRun, setRun,
    getPending, setPending,
    getSettings, setSettings,
    getTextFPs, pushTextFP,
    trackerKey, upsertTracker, removeTracker, hasApplied, APPLIED_STATUS,
    migrate,
  };
})(typeof self !== "undefined" ? self : this);
