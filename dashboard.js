(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const parse = WBA.parse;
  const letter = WBA.letter;
  const store = WBA.store;
  const portals = WBA.portals;
  const stats = WBA.stats;
  const i18n = WBA.i18n;
  // Kurzform für Wörterbuch-Zugriffe. Übersetzt wird NUR die Oberfläche –
  // Anschreiben, Nachfass-Text und Selbstauskunft bleiben deutsch (lib/i18n.js).
  const tr = (k, p) => i18n.t(k, p);

  // Inline-SVG-Icons in alle [data-icon]-Platzhalter einsetzen (lib/icons.js).
  if (WBA.icons) document.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = WBA.icons.svg(el.dataset.icon); });

  // Nach der Veröffentlichung hier die Store-Adresse eintragen (ohne Slash am Ende),
  // dann erscheint automatisch der „⭐ Bewerten"-Button im Footer.
  // Beispiel: "https://chromewebstore.google.com/detail/deine-extension-id"
  const STORE_URL = "https://chromewebstore.google.com/detail/fgcagcmjhmlghmndobjkocddmbjjnnob";

  // „gender" (Anrede/Form) wurde entfernt: Das Feld floss nirgends in Anschreiben
  // oder Selbstauskunft ein – totes Formularfeld, das nur Ausfüllarbeit vortäuschte.
  const profileFields = ["name","age","job","income","persons","pets","about","email","phone","employment","street","plz","city"];
  let currentMode = "standard";
  let docsState = {};
  let historyList = [];
  let selectedPortals = {};

  /* ================= THEME ================= */
  const sysDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let themeManual = false;
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); $("themeToggle").checked = t === "dark"; }
  $("themeToggle").addEventListener("change", () => {
    themeManual = true;
    const t = $("themeToggle").checked ? "dark" : "light";
    applyTheme(t); store.setTheme(t); toast(tr($("themeToggle").checked ? "app.themeDark" : "app.themeLight"), "info");
  });
  async function initTheme() {
    const saved = await store.getTheme();
    if (saved) { themeManual = true; applyTheme(saved); return; }
    applyTheme(sysDark && sysDark.matches ? "dark" : "light");
    if (sysDark && sysDark.addEventListener) sysDark.addEventListener("change", (e) => { if (!themeManual) applyTheme(e.matches ? "dark" : "light"); });
  }

  /* ================= SPRACHE =================
     Ein Klick auf den Pill schaltet Deutsch ⇄ Englisch. Kein Reload: statische
     Texte kommen aus [data-i18n*], alles dynamisch Gerenderte wird neu gebaut.
     Der ERZEUGTE BRIEF bleibt in beiden Sprachen deutsch – genau das ist der
     Nutzen für Nicht-Deutschsprachige. */
  // Der Generieren-Knopf heißt je nach Zustand anders („generieren" vs. „neu
  // formulieren") – nach jedem Sprachwechsel neu aus dem Zustand ableiten.
  function syncGenerateLabel() {
    const empty = $("output").classList.contains("out-empty");
    $("generate").textContent = tr(empty ? "letter.generate" : "letter.regenerate");
    if (empty) $("output").textContent = tr("letter.outEmpty");
  }
  function applyLanguage() {
    i18n.apply(document);
    // Alles, was JS erzeugt hat, trägt keine data-i18n-Marker → neu rendern.
    renderPortals(); renderChecklist(); renderHistory(); renderTracker();
    updateProfileUI(); refreshParsed(); syncGenerateLabel();
    $("copyBtn").textContent = tr("letter.copy");
    // Statusmeldungen gehören zur alten Sprache und sind ohnehin flüchtig.
    ["genStatus", "flatStatus", "searchStatus", "aiStatus", "profileNote", "docHint"].forEach((id) => {
      const el = $(id); if (el) { el.textContent = ""; el.className = el.id === "profileNote" || el.id === "docHint" ? "saved-note" : "form-status"; }
    });
  }
  $("langToggle").addEventListener("click", async () => {
    await i18n.setLang(i18n.lang === "de" ? "en" : "de");
    toast(tr("lang.switched"), "ok");
  });
  // Auch auf Wechsel aus anderen Kontexten reagieren (z. B. Overlay auf einer Portalseite).
  i18n.onChange(applyLanguage);

  /* ================= TOAST ================= */
  function toast(msg, type) {
    const c = $("toastContainer"); if (!c) return;
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = msg; c.appendChild(el);
    while (c.children.length > 3) c.firstChild.remove();
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 2400);
  }
  function flash(id, msg) { toast(msg, /^✓/.test(msg) ? "ok" : "info"); }

  /* ================= NAVIGATION ================= */
  function showTab(tab) {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab));
    if (history.replaceState) history.replaceState(null, "", "#" + tab);
    if (tab === "bewerbungen") renderTracker();
  }
  document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  const TABS = ["suchen", "anschreiben", "bewerbungen", "profil", "unterlagen"];
  // background.js aktualisiert bei "openDashboard" nur die URL (#profil etc.) eines
  // schon offenen Tabs – ohne diesen Listener würde der Reiter nicht wechseln.
  window.addEventListener("hashchange", () => {
    const tab = (location.hash || "").replace("#", "");
    if (TABS.includes(tab)) showTab(tab);
  });
  // Tabs mit ←/→ wechseln, wenn der Fokus auf der Navigation liegt.
  $("nav").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const btns = [...document.querySelectorAll(".nav-btn")];
    const i = btns.findIndex((b) => b.classList.contains("active"));
    const next = btns[(i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length];
    if (next) { e.preventDefault(); showTab(next.dataset.tab); next.focus(); }
  });

  /* ================= PROFIL ================= */
  async function loadProfile() {
    const data = await store.getProfile();
    profileFields.forEach((f) => { if (data[f] != null && $(f)) $(f).value = data[f]; });
    const flat = await store.getFlat();
    if (flat.desc != null) $("flatDesc").value = flat.desc;
    if (flat.contactAnrede != null) $("contactAnrede").value = flat.contactAnrede;
    if (flat.contactName != null) $("contactName").value = flat.contactName;
    // Falls ein Alt-Profil noch Beruf/Einkommen trotz Bürgergeld enthält: bereinigen + persistieren.
    if ($("employment").value === "buergergeld" && ($("job").value || $("income").value)) {
      $("job").value = ""; $("income").value = ""; store.setProfile(getProfile());
    }
    refreshParsed();
  }
  function getProfile() { const p = {}; profileFields.forEach((f) => (p[f] = $(f) ? $(f).value.trim() : "")); return p; }
  // Autosave (entprellt): Wer den Tab schließt, ohne „Profil speichern" zu klicken,
  // verliert sonst still alle Eingaben. Der Button bleibt als explizite Bestätigung.
  let profileSaveTimer = null;
  function autosaveProfile() {
    clearTimeout(profileSaveTimer);
    profileSaveTimer = setTimeout(() => { profileSaveTimer = null; store.setProfile(getProfile()); }, 600);
  }
  function saveProfile() { clearTimeout(profileSaveTimer); profileSaveTimer = null; store.setProfile(getProfile()); flash("profileNote", tr("profile.saved")); updateProfileUI(); }
  function clearProfile() {
    if (!confirm(tr("profile.resetConfirm"))) return;
    clearTimeout(profileSaveTimer); profileSaveTimer = null; // ausstehender Autosave würde das Alte zurückschreiben
    // Löscht alles Persönliche, was die DSE der Funktion zusagt – nicht nur wba_profile.
    store.remove([store.KEYS.profile, store.KEYS.history, store.KEYS.flat, store.KEYS.docs, store.KEYS.textfp]);
    profileFields.forEach((f) => { if ($(f)) $(f).value = ""; });
    $("flatDesc").value = ""; $("contactAnrede").value = ""; $("contactName").value = "";
    historyList = []; docsState = {};
    refreshParsed(); renderHistory();
    updateProfileUI(); renderChecklist(); flash("profileNote", tr("profile.resetDone"));
  }
  function clearAllData() {
    if (!confirm(tr("profile.clearAllConfirm"))) return;
    clearTimeout(profileSaveTimer); profileSaveTimer = null;
    // Theme/Sprache sind reine UI-Einstellungen ohne Personenbezug und bleiben;
    // das Migrations-Flag bleibt, damit migrate() keine Alt-Daten zurückholt.
    const keep = [store.KEYS.theme, store.KEYS.lang, store.KEYS.migrated];
    const keys = Object.values(store.KEYS).filter((k) => keep.indexOf(k) < 0);
    // Alt-Reste der v1-localStorage-Ära mit entfernen (die Migration kopiert nur, löscht nicht).
    keys.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    store.remove(keys).then(() => location.reload());
  }
  function saveFlat() {
    store.setFlat({ desc: $("flatDesc").value.trim(), contactAnrede: $("contactAnrede").value, contactName: $("contactName").value.trim() });
  }
  $("saveProfile").addEventListener("click", saveProfile);
  $("clearProfile").addEventListener("click", clearProfile);
  $("clearAllData").addEventListener("click", clearAllData);
  ["flatDesc","contactName"].forEach((id) => $(id).addEventListener("input", saveFlat));
  $("contactAnrede").addEventListener("change", saveFlat);
  $("employment").addEventListener("change", renderChecklist);

  function profileCompleteness() {
    const p = getProfile();
    const filled = profileFields.filter((f) => (p[f] || "").trim() !== "").length;
    return Math.round((filled / profileFields.length) * 100);
  }
  // Bei Bürgergeld/Grundsicherung gibt es kein Erwerbseinkommen und keinen aktiven Beruf:
  // Beruf- und Einkommensfeld leeren (auch vorher Eingetragenes), sperren und ausgrauen.
  function syncEmploymentLock() {
    const bg = $("employment") && $("employment").value === "buergergeld";
    ["job", "income"].forEach((id) => {
      const el = $(id); if (!el) return;
      if (bg) el.value = "";
      el.disabled = !!bg;
      const field = el.closest(".field"); if (field) field.classList.toggle("locked", !!bg);
    });
  }
  function updateProfileUI() {
    syncEmploymentLock();
    const pct = profileCompleteness();
    if ($("progressBar")) $("progressBar").style.width = pct + "%";
    if ($("progressLabel")) $("progressLabel").textContent = tr("profile.progress", { pct });
    // EINE Regel statt Banner + Schrittleiste + Pill einzeln: Die Onboarding-Karte
    // ist nur sichtbar, solange kein Name im Profil steht. Danach ist der
    // Profil-Tab der einzige (ausreichende) Einstieg.
    const ob = $("onboarding");
    if (ob) ob.hidden = !!getProfile().name;
  }
  $("welcomeProfile").addEventListener("click", () => showTab("profil"));
  // Schritt 1 der Anleitung führt direkt ins Profil.
  document.querySelectorAll('.step.clickable').forEach((s) => s.addEventListener("click", () => showTab(s.dataset.step)));
  profileFields.forEach((f) => {
    const el = $(f); if (!el) return;
    el.addEventListener("input", () => { updateProfileUI(); autosaveProfile(); });
    el.addEventListener("change", () => { updateProfileUI(); autosaveProfile(); });
  });

  /* ================= VALIDIERUNG ================= */
  const VALIDATED = ["name","age","persons","income","email"];
  function setFieldError(id, msg) {
    const el = $(id); if (!el) return;
    el.classList.add("invalid");
    let err = el.parentElement.querySelector(".field-error");
    if (!err) { err = document.createElement("div"); err.className = "field-error"; el.parentElement.appendChild(err); }
    err.textContent = msg;
  }
  function clearFieldError(id) {
    const el = $(id); if (!el) return;
    el.classList.remove("invalid");
    const err = el.parentElement.querySelector(".field-error"); if (err) err.remove();
  }
  function setStatus(msg, type) { const s = $("genStatus"); s.textContent = msg || ""; s.className = "form-status" + (type ? " " + type : ""); }
  function validate(p) {
    VALIDATED.forEach(clearFieldError);
    let errors = 0;
    if (!p.name) { setFieldError("name", tr("val.name")); errors++; }
    if (p.age) { const a = Number(p.age); if (!Number.isFinite(a) || a < 14 || a > 120) { setFieldError("age", tr("val.age")); errors++; } }
    if (p.persons) { const nn = Number(p.persons); if (!Number.isInteger(nn) || nn < 1 || nn > 20) { setFieldError("persons", tr("val.persons")); errors++; } }
    if (p.income && !/\d/.test(p.income)) { setFieldError("income", tr("val.income")); errors++; }
    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) { setFieldError("email", tr("val.email")); errors++; }
    return errors;
  }
  VALIDATED.forEach((id) => { const el = $(id); if (el) el.addEventListener("input", () => { clearFieldError(id); if (!$("genStatus").classList.contains("info")) setStatus(""); }); });

  /* ================= ANSCHREIBEN ================= */
  let parsedInfo = {};
  function renderChips(info) {
    const box = $("flatParsed"); const chips = [];
    if (info.zimmer) chips.push(tr("chip.rooms", { n: info.zimmer }));
    if (info.groesse) chips.push(info.groesse + " m²");
    // preisLabel stammt aus der deutschen Anzeige („Kaltmiete“ …) und bleibt so.
    if (info.preis) chips.push(info.preis + (info.preisLabel && info.preisLabel !== "Miete" ? " " + info.preisLabel : ""));
    if (info.ort) chips.push(info.ort);
    if (info.frei) chips.push(tr("chip.free", { date: info.frei }));
    box.innerHTML = "";
    chips.forEach((label) => { const el = document.createElement("span"); el.className = "chip"; el.textContent = label; box.appendChild(el); });
    return chips.length;
  }
  function refreshParsed() { parsedInfo = parse.extractFlatInfo($("flatDesc").value); return renderChips(parsedInfo); }
  $("flatDesc").addEventListener("input", refreshParsed);

  // EIN Ton-Zustand für die ganze App: Die Moduswahl hier und das
  // „Ton der Anschreiben"-Dropdown im Suchen-Tab steuern dieselbe Einstellung
  // (filters.ton) und bleiben synchron – vorher konnten Durchlauf und
  // Einzel-Anschreiben unbemerkt mit verschiedenen Tönen laufen.
  function setTone(tone) {
    currentMode = tone;
    document.querySelectorAll("#modeBar [data-mode]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-mode") === tone));
    if ($("fTon") && $("fTon").value !== tone) $("fTon").value = tone;
  }
  document.querySelectorAll("#modeBar [data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTone(btn.getAttribute("data-mode"));
      saveFilters();
      if (!$("output").classList.contains("out-empty")) generate();
    });
  });

  // Handeingaben in eine fail-safe Anrede-Klassifikation überführen:
  // Name OHNE gewählte Anrede bleibt neutral (nie aus dem Namen raten).
  function manualSalutation() {
    const anrede = $("contactAnrede").value;
    const name = $("contactName").value.trim();
    if (anrede && name) return { category: anrede === "Frau" ? "frau" : "herr", name };
    return { category: "neutral" };
  }

  async function generate() {
    const wasEmpty = $("output").classList.contains("out-empty");
    const p = getProfile();
    const flat = { desc: $("flatDesc").value.trim(), contactAnrede: $("contactAnrede").value, contactName: $("contactName").value.trim(), salutation: manualSalutation() };
    const errors = validate(p);
    if (errors > 0) {
      setStatus(errors === 1 ? tr("val.fixOne") : tr("val.fixMany", { n: errors }), "error");
      toast(tr(errors === 1 ? "val.toastOne" : "val.toastMany"), "info");
      showTab("profil");
      const firstBad = document.querySelector(".invalid"); if (firstBad) firstBad.focus();
      return;
    }
    parsedInfo = parse.extractFlatInfo(flat.desc);

    // KI bevorzugt (im Hintergrund), sonst der kompositorische Generator.
    let text = null;
    const settings = await store.getSettings();
    const btn = $("generate");
    if (WBA.ai && WBA.ai.isConfigured(settings)) {
      const label = btn.textContent; btn.disabled = true; btn.textContent = tr("letter.aiWriting");
      text = await WBA.ai.request({ profile: p, flat, mode: currentMode, info: parsedInfo, docs: docsState });
      btn.disabled = false; btn.textContent = label;
      // Blacklist gilt auch für KI-Texte: Floskel drin → eingebauten Generator nutzen.
      if (text && letter.containsBlacklisted(text, p.about)) text = null;
      if (!text) toast(tr("letter.aiFallback"), "info");
    }
    if (!text) text = await letter.generate(p, flat, currentMode, parsedInfo, { docs: docsState });

    const out = $("output");
    out.classList.remove("out-empty"); out.textContent = text;
    out.classList.remove("reveal"); void out.offsetWidth; out.classList.add("reveal");
    saveFlat();
    pushHistory({ tone: currentMode, flatSummary: parse.summaryFromInfo(parsedInfo) || (flat.desc ? parse.flatOneLine(flat) : tr("letter.noFlat")), contactName: flat.contactName, text });
    $("generate").textContent = tr("letter.regenerate");
    setStatus("", "");
    if (!flat.desc) toast(tr("letter.tipAddText"), "info");
    else if (wasEmpty) toast(tr("letter.created"), "ok");
    else toast(tr("letter.recreated"), "ok");
  }
  $("generate").addEventListener("click", generate);
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && $("tab-anschreiben").classList.contains("active")) { e.preventDefault(); generate(); } });

  $("copyBtn").addEventListener("click", async () => {
    const out = $("output"); if (out.classList.contains("out-empty")) return;
    const text = out.textContent;
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    const btn = $("copyBtn"); btn.classList.add("copied"); btn.textContent = tr("letter.copied");
    setTimeout(() => { btn.classList.remove("copied"); btn.textContent = tr("letter.copy"); }, 1500);
    toast(tr("letter.copiedToast"), "ok");
  });

  $("pasteClip").addEventListener("click", async () => {
    const status = $("flatStatus");
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) { status.className = "form-status info"; status.textContent = tr("paste.empty"); return; }
      $("flatDesc").value = text.trim();
      const hits = refreshParsed();
      // Ansprechpartner:in automatisch übernehmen, wenn das Feld noch leer ist.
      const c = parse.extractContact(text);
      if (c && !$("contactName").value.trim()) { $("contactAnrede").value = c.anrede; $("contactName").value = c.name; }
      saveFlat();
      status.className = "form-status ok";
      status.textContent = hits ? (hits === 1 ? tr("paste.okOne") : tr("paste.okMany", { n: hits })) : tr("paste.okNone");
      // Anrede-Kategorie sichtbar machen (fail-safe: Unsicheres bleibt neutral).
      status.textContent += tr("paste.salutation", { badge: WBA.salutation.badge(manualSalutation()).text });
    } catch (e) { status.className = "form-status info"; status.textContent = tr("paste.manual"); $("flatDesc").focus(); }
  });

  // Text aus einem offenen Anzeigen-Tab lesen (Dashboard ist selbst ein Tab).
  $("loadFromTab").addEventListener("click", async () => {
    const status = $("flatStatus");
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting) { status.className = "form-status info"; status.textContent = tr("tab.notInstalled"); return; }
    try {
      const tabs = await chrome.tabs.query({});
      const selfUrl = location.href;
      // NUR Portal-Tabs: für andere Seiten fehlt die Host-Berechtigung, executeScript
      // würde dort immer scheitern (früherer Fallback auf den jüngsten Tab war ein
      // toter Pfad und erzeugte nur die irreführende „Konnte den Tab nicht lesen"-Meldung).
      // Bei mehreren Portal-Tabs den zuletzt benutzten nehmen.
      const cand = tabs.filter((t) => t.url && /^https?:/i.test(t.url) && t.url !== selfUrl && portals.forUrl(t.url));
      const portalTab = cand.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
      if (!portalTab) { status.className = "form-status info"; status.textContent = tr("tab.noTab"); return; }
      // Nur anzeigen-eigene Bereiche extrahieren (contentSel des Portal-Adapters),
      // sonst Titel/Meta – nie „Ähnliche Anzeigen"/Werbung.
      const tabPortal = portals.forUrl(portalTab.url);
      const results = await chrome.scripting.executeScript({
        target: { tabId: portalTab.id },
        func: parse.pageExtractor,
        args: [(tabPortal && tabPortal.contentSel) || ""],
      });
      const text = (results && results[0] && results[0].result) || "";
      const info = parse.extractFlatInfo(text);
      const hits = Object.keys(info).filter((k) => k !== "preisLabel").length;
      const contact = parse.extractContact(text);
      if (hits >= 1) { $("flatDesc").value = parse.summaryFromInfo(info); refreshParsed(); }
      if (contact) { $("contactAnrede").value = contact.anrede; $("contactName").value = contact.name; }
      saveFlat();
      status.className = "form-status ok";
      status.textContent = hits ? tr("tab.ok", { title: portalTab.title || tr("letter.flat") }) : tr("tab.noData");
      status.textContent += tr("paste.salutation", { badge: WBA.salutation.badge(manualSalutation()).text });
    } catch (e) { status.className = "form-status info"; status.textContent = tr("tab.failed"); }
  });

  /* ---- Sofort-Demo (Aha-Moment ohne Profil) ---- */
  // Zeigt in einem Klick, was die Erweiterung tut: Beispiel-Anzeige rein,
  // fertiges Anschreiben raus. Bewusst OHNE Persistenz (kein saveFlat, kein
  // Verlauf) und IMMER über den eingebauten Generator (keine KI-Kosten/Latenz).
  const DEMO_FLAT_TEXT = "Helle 3-Zimmer-Wohnung, 72 m², in Köln-Ehrenfeld. Kaltmiete 950 €. Mit Balkon und Einbauküche, frei ab 01.09.2026. Ansprechpartnerin: Frau Weber.";
  const DEMO_PROFILE = { name: "Max Mustermann", age: "32", job: "Softwareentwickler", employment: "unbefristet", income: "3.200 €", persons: "1", pets: "keine" };
  let demoRunning = false;
  async function runDemo() {
    if (demoRunning) return;
    demoRunning = true;
    try {
      showTab("anschreiben");
      $("flatDesc").value = DEMO_FLAT_TEXT;
      const hits = refreshParsed(); // Chips zeigen sofort, was erkannt wurde
      const real = getProfile();
      const isDemoProfile = !real.name;
      const p = isDemoProfile ? DEMO_PROFILE : real;
      const flat = { desc: DEMO_FLAT_TEXT, salutation: { category: "frau", name: "Weber" } };
      const text = await letter.generate(p, flat, currentMode, parsedInfo, { docs: isDemoProfile ? {} : docsState });
      const out = $("output");
      out.classList.remove("out-empty"); out.textContent = text;
      out.classList.remove("reveal"); void out.offsetWidth; out.classList.add("reveal");
      $("generate").textContent = tr("letter.regenerate");
      if (isDemoProfile) setStatus(tr("demo.withDemoProfile"), "info");
      else setStatus(tr("demo.withYourProfile"), "info");
      toast(hits ? tr("demo.toast", { n: hits }) : tr("demo.toastPlain"), "ok");
    } finally { demoRunning = false; }
  }
  if ($("demoBtn")) $("demoBtn").addEventListener("click", runDemo);
  if ($("welcomeDemo")) $("welcomeDemo").addEventListener("click", runDemo);

  /* ---- Verlauf ---- */
  // Ton-WERTE bleiben deutsch (Schlüssel der Textbaustein-Engine) – nur das Label wechselt.
  function toneLabel(t) { return WBA.i18n.DICT["tone." + t] ? tr("tone." + t) : t; }
  function relTime(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return tr("time.now");
    const m = Math.round(s / 60); if (m < 60) return tr("time.min", { n: m });
    const h = Math.round(m / 60); if (h < 24) return tr("time.hour", { n: h });
    const d = Math.round(h / 24); return tr(d > 1 ? "time.days" : "time.day", { n: d });
  }
  function pushHistory(entry) {
    if (historyList.length && historyList[0].text === entry.text) return;
    entry.ts = Date.now(); historyList.unshift(entry); historyList = historyList.slice(0, 10);
    store.setHistory(historyList); renderHistory();
  }
  function renderHistory() {
    const box = $("historyList"); if (!box) return;
    $("historyCount").textContent = historyList.length ? "(" + historyList.length + ")" : "";
    box.innerHTML = "";
    if (!historyList.length) { const em = document.createElement("div"); em.className = "history-empty"; em.textContent = tr("history.empty"); box.appendChild(em); return; }
    historyList.forEach((e) => {
      const item = document.createElement("button"); item.type = "button"; item.className = "history-item";
      const main = document.createElement("span"); main.className = "hi-main";
      main.textContent = (e.contactName ? e.contactName + " · " : "") + (e.flatSummary || tr("letter.flat"));
      const meta = document.createElement("span"); meta.className = "hi-meta"; meta.textContent = toneLabel(e.tone) + " · " + relTime(e.ts);
      item.appendChild(main); item.appendChild(meta);
      item.addEventListener("click", () => {
        const out = $("output"); out.classList.remove("out-empty"); out.textContent = e.text;
        out.classList.remove("reveal"); void out.offsetWidth; out.classList.add("reveal");
        $("generate").textContent = tr("letter.regenerate"); toast(tr("history.loaded"), "info");
      });
      box.appendChild(item);
    });
    const clear = document.createElement("button"); clear.type = "button"; clear.className = "btn history-clear"; clear.textContent = tr("history.clear");
    clear.addEventListener("click", () => { historyList = []; store.setHistory([]); renderHistory(); toast(tr("history.cleared"), "info"); });
    box.appendChild(clear);
  }

  /* ================= UNTERLAGEN ================= */
  // Die IDs sind Speicher-Schlüssel und bleiben unverändert – nur die Beschriftung
  // folgt der Oberflächensprache (die deutschen Fachbegriffe stehen in der
  // englischen Fassung mit dabei, weil Vermieter genau danach fragen).
  function checklistItems(p) {
    const item = (id) => ({ id, label: tr("doc." + id) });
    const items = [item("ausweis")];
    // Bei negativer/fehlender SCHUFA (noSchufa-Schalter) wird sie nicht verlangt –
    // stattdessen unten die Bürgschaft als realistische Alternative anbieten.
    if (!docsState.noSchufa) items.push(item("schufa"));
    if (p.employment === "buergergeld") { items.push(item("jobcenter")); items.push(item("kdu")); }
    else if (p.employment === "rente") { items.push(item("rente")); }
    else if (p.employment === "selbststaendig") { items.push(item("bwa")); }
    else if (p.employment === "azubi") { items.push(item("ausbildung")); items.push(item("buergschaft")); }
    else { items.push(item("gehalt")); }
    items.push(item("mietschulden"));
    if (docsState.noSchufa && !items.some((i) => i.id === "buergschaft")) {
      items.push({ id: "buergschaft", label: tr("doc.buergschaftAlt") });
    }
    items.push(item("selbstauskunft"));
    return items;
  }
  function setDoc(id, checked) { docsState[id] = checked; store.setDocs(docsState); }
  // SCHUFA-Schutz-Schalter: nie erwähnen + nicht verlangen (siehe dashboard.html).
  if ($("noSchufa")) $("noSchufa").addEventListener("change", () => {
    docsState.noSchufa = $("noSchufa").checked;
    if (docsState.noSchufa) docsState.schufa = false; // ein evtl. gesetztes „liegt bereit" zurücknehmen
    store.setDocs(docsState);
    renderChecklist();
    toast(tr(docsState.noSchufa ? "docs.noSchufaOn" : "docs.noSchufaOff"), "info");
  });
  function renderChecklist() {
    const p = getProfile(); const box = $("checklist"); box.innerHTML = "";
    checklistItems(p).forEach((it) => {
      const row = document.createElement("label"); row.className = "check-item" + (docsState[it.id] ? " done" : "");
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!docsState[it.id];
      cb.addEventListener("change", () => { setDoc(it.id, cb.checked); row.classList.toggle("done", cb.checked); });
      const span = document.createElement("span"); span.textContent = it.label;
      row.appendChild(cb); row.appendChild(span); box.appendChild(row);
    });
  }
  function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  // ACHTUNG: Die Selbstauskunft ist ein DEUTSCHES Dokument für deutsche Vermieter
  // und bleibt in JEDER Oberflächensprache deutsch – wie das Anschreiben selbst.
  // Deshalb hier bewusst feste Texte statt i18n (siehe Invariante in lib/i18n.js).
  function empLabelDe(emp) { return { unbefristet: "Angestellt (unbefristet)", befristet: "Angestellt (befristet)", selbststaendig: "Selbstständig", azubi: "Ausbildung / Studium", rente: "Rente / Pension", buergergeld: "Arbeitslos / Bürgergeld / Grundsicherung" }[emp] || ""; }
  function selbstauskunftHTML(p, flat, info) {
    const today = new Date().toLocaleDateString("de-DE");
    const rows = (pairs) => pairs.filter((x) => x[1]).map((x) => "<tr><th>" + esc(x[0]) + "</th><td>" + esc(x[1]) + "</td></tr>").join("");
    let finanz = [["Beschäftigung", empLabelDe(p.employment)]];
    if (p.employment === "buergergeld") finanz.push(["Mietzahlung", "über das Jobcenter (Kosten der Unterkunft) – Direktzahlung an den Vermieter möglich"]);
    else if (p.income) finanz.push([p.employment === "rente" ? "Rente (netto/Monat)" : "Einkommen (netto/Monat)", p.income]);
    const wohnung = parse.flatOneLine(flat);
    const einzug = info && info.frei ? (info.frei === "sofort" ? "sofort" : "ab " + info.frei) : "";
    return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Mieterselbstauskunft</title>' +
'<style>*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#111;background:#fff;margin:0;padding:32px 40px;line-height:1.5}.banner{background:#eef;border:1px solid #ccd;border-radius:10px;padding:10px 14px;font-size:13px;color:#334;margin-bottom:24px}h1{font-size:24px;margin:0 0 2px}.date{color:#666;font-size:13px;margin:0 0 22px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#4f46e5;border-bottom:2px solid #e5e7ff;padding-bottom:4px;margin:22px 0 8px}table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-weight:600;color:#374151;width:210px;vertical-align:top;padding:5px 8px 5px 0}td{padding:5px 0;vertical-align:top}.decl{margin-top:26px;font-size:13px;color:#374151}.sign{display:flex;gap:40px;margin-top:40px;font-size:13px;color:#666}.sign>div{flex:1;border-top:1px solid #999;padding-top:6px}@media print{.banner{display:none}body{padding:0}}</style></head><body>' +
'<div class="banner">Deine Selbstauskunft ist fertig. Zum Speichern: <b>Strg/Cmd + P</b> → „Als PDF speichern". (Dieser Hinweis wird nicht mitgedruckt.)</div>' +
'<h1>Mieterselbstauskunft</h1><p class="date">Stand: ' + esc(today) + '</p>' +
'<h2>Bewerber:in</h2><table>' + rows([["Name", p.name],["Alter", p.age ? p.age + " Jahre" : ""],["Beruf", p.job],["E-Mail", p.email],["Telefon", p.phone]]) + '</table>' +
'<h2>Haushalt</h2><table>' + rows([["Anzahl Personen", p.persons],["Haustiere", p.pets]]) + '</table>' +
'<h2>Finanzielles</h2><table>' + rows(finanz) + '</table>' +
'<h2>Gewünschte Wohnung</h2><table>' + rows([["Objekt", wohnung],["Gewünschter Einzug", einzug]]) + '</table>' +
(p.about ? '<h2>Bemerkungen</h2><p style="font-size:14px">' + esc(p.about) + '</p>' : '') +
'<p class="decl">Ich versichere, dass die vorstehenden Angaben der Wahrheit entsprechen.</p>' +
'<div class="sign"><div>Ort, Datum</div><div>Unterschrift</div></div></body></html>';
  }
  $("makeSelbstauskunft").addEventListener("click", () => {
    const p = getProfile();
    if (!p.name) { flash("docHint", tr("docs.needName")); showTab("profil"); return; }
    const flat = { desc: $("flatDesc").value.trim() }; const info = parse.extractFlatInfo(flat.desc);
    const w = window.open("", "_blank");
    if (!w) { flash("docHint", tr("docs.popupBlocked")); return; }
    w.document.open(); w.document.write(selbstauskunftHTML(p, flat, info)); w.document.close();
    setDoc("selbstauskunft", true); renderChecklist();
    flash("docHint", tr("docs.opened"));
  });

  /* ================= SUCHEN ================= */
  function renderPortals() {
    const box = $("portalGrid"); box.innerHTML = "";
    // Anzeige nach Bekanntheit sortiert (Logik bleibt id-basiert, Array-Reihenfolge egal).
    const portalOrder = ["immoscout", "kleinanzeigen", "immowelt", "wg-gesucht"];
    const ordered = portals.PORTALS.slice().sort(
      (a, b) => portalOrder.indexOf(a.id) - portalOrder.indexOf(b.id)
    );
    ordered.forEach((p) => {
      const on = selectedPortals[p.id] !== false; // Standard: alle an
      const label = document.createElement("label"); label.className = "portal-toggle" + (on ? " on" : "");
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = on;
      cb.addEventListener("change", () => { selectedPortals[p.id] = cb.checked; label.classList.toggle("on", cb.checked); saveFilters(); });
      const name = document.createElement("span"); name.className = "pt-name"; name.textContent = p.name;
      label.appendChild(cb); label.appendChild(name);
      if (p.experimental) { const pill = document.createElement("span"); pill.className = "pill exp"; pill.textContent = tr("search.experimental"); label.appendChild(pill); }
      box.appendChild(label);
    });
  }
  function readFilters() {
    return {
      ort: $("fOrt").value.trim(),
      zimmerMin: $("fZimmer").value.trim(), qmMin: $("fQm").value.trim(),
      preisMax: $("fPreis").value.trim(), ton: $("fTon").value,
      autoOverlay: $("autoOverlay") ? $("autoOverlay").checked : true,
      portals: selectedPortals
    };
  }
  function saveFilters() { store.setFilters(readFilters()); }
  ["fOrt","fZimmer","fQm","fPreis","fTon","autoOverlay"].forEach((id) => { const el = $(id); if (el) el.addEventListener("change", saveFilters); });
  // Ton-Dropdown hält die Moduswahl im Anschreiben-Tab synchron (eine Einstellung).
  if ($("fTon")) $("fTon").addEventListener("change", () => setTone($("fTon").value));

  async function loadFilters() {
    const f = await store.getFilters();
    if (f.ort) $("fOrt").value = f.ort;
    if (f.zimmerMin) $("fZimmer").value = f.zimmerMin;
    if (f.qmMin) $("fQm").value = f.qmMin;
    if (f.preisMax) $("fPreis").value = f.preisMax;
    if (f.ton) setTone(f.ton); // synchronisiert Dropdown UND Moduswahl
    if ($("autoOverlay")) $("autoOverlay").checked = f.autoOverlay !== false; // Standard: an
    selectedPortals = f.portals || {};
    renderPortals();
  }

  $("startSearch").addEventListener("click", async () => {
    const btn = $("startSearch");
    if (btn.disabled) return; // Doppelklick würde alle Portal-Tabs doppelt öffnen
    const f = readFilters();
    const status = $("searchStatus");
    if (!f.ort) { status.className = "form-status info"; status.textContent = tr("search.noCity"); $("fOrt").focus(); return; }
    const chosen = portals.PORTALS.filter((p) => selectedPortals[p.id] !== false);
    if (!chosen.length) { status.className = "form-status info"; status.textContent = tr("search.noPortal"); return; }
    saveFilters();
    setTone(f.ton || "standard");
    if (typeof chrome === "undefined" || !chrome.tabs) { status.className = "form-status info"; status.textContent = tr("search.notInstalled", { urls: chosen.map((p) => p.buildSearchUrl(f)).join(" | ") }); return; }
    btn.disabled = true;
    try {
      // Filter hinterlegen: das Content-Script füllt sie auf der Portalseite in die echte Suchmaske.
      await store.setPending({ portals: chosen.map((p) => p.id), filters: f });
      let opened = 0;
      for (let i = 0; i < chosen.length; i++) {
        const url = chosen[i].buildSearchUrl(f);
        try { await chrome.tabs.create({ url, active: i === 0 }); opened++; } catch (e) {}
      }
      if (!opened) {
        status.className = "form-status error";
        status.textContent = tr("search.openFailed");
        return;
      }
      status.className = "form-status ok";
      status.textContent = tr("search.opened", { n: opened });
      toast(tr("search.openedToast", { n: opened }), "ok");
    } finally { btn.disabled = false; }
  });

  /* ================= BEWERBUNGEN (Tracker) ================= */
  const STATUSES = ["vorbereitet", "beworben", "antwort", "besichtigung", "übersprungen"];
  // Status-WERTE bleiben deutsch (Speicher-Schlüssel) – nur das Label wechselt.
  function statusLabel(s) { return WBA.i18n.DICT["status." + s] ? tr("status." + s) : s; }

  // Besichtigungs-Termin als Kalender-Datei (.ics) – lokale „floating time",
  // damit der Termin in der Zeitzone des Kalenders gilt. Mechanik wie CSV-Export.
  function icsStamp(dd) {
    const p2 = (n) => String(n).padStart(2, "0");
    return dd.getFullYear() + p2(dd.getMonth() + 1) + p2(dd.getDate()) + "T" + p2(dd.getHours()) + p2(dd.getMinutes()) + "00";
  }
  function downloadIcs(e) {
    const start = new Date(e.besichtigung);
    if (isNaN(start)) { toast(tr("tracker.icsNoDate"), "info"); return; }
    const end = new Date(start.getTime() + 45 * 60000);
    const escIcs = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WohnungsBewerber//DE", "BEGIN:VEVENT",
      "UID:" + store.trackerKey(e.portal, e.listingId).replace(/[^A-Za-z0-9._-]/g, "-") + "@wohnungsbewerber",
      "DTSTAMP:" + icsStamp(new Date()),
      "DTSTART:" + icsStamp(start),
      "DTEND:" + icsStamp(end),
      "SUMMARY:" + escIcs(tr("tracker.icsSummary", { title: e.title || tr("letter.flat") })),
      e.ort ? "LOCATION:" + escIcs(e.ort) : "",
      e.url ? "DESCRIPTION:" + escIcs(e.url) : "",
      "END:VEVENT", "END:VCALENDAR",
    ].filter(Boolean);
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "besichtigung.ics"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(tr("tracker.icsSaved"), "ok");
  }

  // Nachfassen: höflichen Text kopieren, Zeitpunkt merken, Anzeige öffnen.
  // Gesendet wird – wie immer – nur vom Nutzer selbst auf der Portalseite.
  // letter.followUp() liefert bewusst DEUTSCHEN Text – er geht an die Vermietung.
  async function followUpFor(e) {
    const profile = await store.getProfile();
    const text = letter.followUp(e, profile);
    try { await navigator.clipboard.writeText(text); }
    catch (err) { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    await store.upsertTracker({ portal: e.portal, listingId: e.listingId, followupAt: Date.now() });
    toast(tr("tracker.followUpCopied"), "ok");
    if (e.url) { if (typeof chrome !== "undefined" && chrome.tabs) chrome.tabs.create({ url: e.url }); else window.open(e.url, "_blank"); }
    renderTracker();
  }
  /* ---------- Auswertung „Was bei dir funktioniert" (lib/stats.js) ----------
     Zeigt nur, was lib/stats.js für belastbar hält: Gruppen unter der
     Mindest-Fallzahl bekommen KEINEN Balken und keine Prozentzahl, sondern den
     offenen Hinweis, wie viele Bewerbungen noch fehlen. Lieber eine ehrliche
     Lücke als eine Quote, die auf zwei Zufällen steht. */
  function fmtDays(d) { return d.toLocaleString(i18n.locale(), { maximumFractionDigits: 1 }); }

  function statRow(label, g, minGroup) {
    const row = document.createElement("div"); row.className = "stat-row";
    const name = document.createElement("span"); name.className = "stat-label"; name.textContent = label;
    const track = document.createElement("span"); track.className = "stat-bar";
    const val = document.createElement("span"); val.className = "stat-val";
    if (g.enough) {
      const pct = Math.round(g.rate * 100);
      const fill = document.createElement("span");
      fill.style.width = pct + "%"; // Zahl aus eigener Rechnung, kein Nutzer-Input
      track.appendChild(fill);
      val.textContent = tr("stats.value", { pct: pct, replies: g.replies, applied: g.applied });
    } else {
      track.classList.add("is-empty");
      val.classList.add("is-muted");
      val.textContent = tr("stats.tooFew", { n: g.applied, min: minGroup });
    }
    row.append(name, track, val);
    return row;
  }

  function statBlock(titleKey, groups, labelFn, minGroup) {
    if (!groups.length) return null;
    const wrap = document.createElement("div"); wrap.className = "stat-block";
    const head = document.createElement("h3"); head.className = "stat-head"; head.textContent = tr(titleKey);
    wrap.appendChild(head);
    // Alle Zeilen in EIN Grid (siehe .stat-rows in shared.css) – nur so haben
    // die Balken aller Zeilen dieselbe Schiene und bleiben vergleichbar.
    const rows = document.createElement("div"); rows.className = "stat-rows";
    groups.forEach((g) => rows.appendChild(statRow(labelFn(g.key), g, minGroup)));
    wrap.appendChild(rows);
    return wrap;
  }

  function renderStats(list) {
    const body = $("statsBody");
    if (!body) return;
    const s = stats.summary(list);
    body.textContent = "";
    if (!s.applied) {
      const p = document.createElement("p"); p.className = "hint"; p.textContent = tr("stats.empty");
      body.appendChild(p); return;
    }
    // Erste Zeile ist die Erkenntnis, nicht die Rohdaten. Ohne belastbaren
    // Vorsprung steht hier ausdrücklich, dass es (noch) keinen gibt.
    const lead = document.createElement("p"); lead.className = "stat-lead";
    if (s.leadTone) lead.textContent = tr("stats.leadTone", { name: toneLabel(s.leadTone.key), pct: Math.round(s.leadTone.rate * 100) });
    else { lead.classList.add("is-muted"); lead.textContent = tr("stats.leadNone"); }
    body.appendChild(lead);

    const byTone = statBlock("stats.byTone", s.byTone, toneLabel, s.minGroup);
    if (byTone) body.appendChild(byTone);
    const byPortal = statBlock("stats.byPortal", s.byPortal, (id) => (portals.byId(id) || {}).name || id, s.minGroup);
    if (byPortal) body.appendChild(byPortal);

    if (s.replyTime) {
      const note = document.createElement("p"); note.className = "stat-note";
      note.textContent = tr("stats.replyTime", {
        avg: fmtDays(s.replyTime.avgDays), max: fmtDays(s.replyTime.maxDays), n: s.replyTime.n,
      });
      body.appendChild(note);
    }
  }

  async function renderTracker() {
    const list = await store.getTracker();
    const filter = $("trackerFilter").value;
    const box = $("trackerList"); box.innerHTML = "";
    const nav = $("navTrackerCount");
    if (nav) { nav.hidden = !list.length; nav.textContent = list.length; }
    renderStats(list); // eigene Karte unter der Liste – unabhängig vom Status-Filter
    // Kompakte Erfolgs-Statistik (immer über der Gesamtliste, unabhängig vom Filter):
    // Antworten = „antwort" + „besichtigung" (eine Besichtigung setzt eine Antwort voraus).
    const nBeworben = list.filter((e) => store.APPLIED_STATUS.includes(e.status)).length;
    const nAntworten = list.filter((e) => e.status === "antwort" || e.status === "besichtigung").length;
    const nBesicht = list.filter((e) => e.status === "besichtigung").length;
    if (nBeworben) {
      const stats = document.createElement("div"); stats.className = "tracker-stats";
      const chip = (t) => { const s = document.createElement("span"); s.className = "chip"; s.textContent = t; stats.appendChild(s); };
      chip(tr("tracker.statApplied", { n: nBeworben }));
      chip(tr(nAntworten === 1 ? "tracker.statReply" : "tracker.statReplies", { n: nAntworten, pct: Math.round((nAntworten / nBeworben) * 100) }));
      if (nBesicht) chip(tr(nBesicht === 1 ? "tracker.statViewing" : "tracker.statViewings", { n: nBesicht }));
      box.appendChild(stats);
    }

    const shown = filter ? list.filter((e) => e.status === filter) : list;
    if (!shown.length) {
      // anhängen statt innerHTML setzen – die Statistik-Zeile darüber bleibt erhalten
      const empty = document.createElement("div"); empty.className = "empty";
      empty.innerHTML = '<span class="emoji">' + (WBA.icons ? WBA.icons.svg("inbox", 34) : "") + "</span><h3>" +
        esc(tr(filter ? "tracker.emptyTitleFiltered" : "tracker.emptyTitle")) + "</h3><p>" + esc(tr("tracker.emptyText")) + "</p>";
      box.appendChild(empty);
      return;
    }
    shown.forEach((e) => {
      const item = document.createElement("div"); item.className = "tracker-item";
      const main = document.createElement("div"); main.className = "ti-main";
      const title = document.createElement("p"); title.className = "ti-title"; title.textContent = e.title || e.flatSummary || tr("letter.flat");
      const meta = document.createElement("div"); meta.className = "ti-meta";
      const portalName = (portals.byId(e.portal) || {}).name || e.portal || "";
      meta.textContent = [portalName, e.ort, e.qm ? e.qm + " m²" : "", e.preis, relTime(e.ts || Date.now())].filter(Boolean).join(" · ");
      main.appendChild(title); main.appendChild(meta);
      if (e.url) { title.style.cursor = "pointer"; title.addEventListener("click", () => { if (typeof chrome !== "undefined" && chrome.tabs) chrome.tabs.create({ url: e.url }); else window.open(e.url, "_blank"); }); }

      // Besichtigung: Termin-Feld (+ ICS-Export, sobald ein Termin gesetzt ist)
      if (e.status === "besichtigung") {
        const extra = document.createElement("div"); extra.className = "ti-extra";
        const lbl = document.createElement("span"); lbl.textContent = tr("tracker.appointment");
        const dt = document.createElement("input"); dt.type = "datetime-local"; dt.value = e.besichtigung || "";
        dt.setAttribute("aria-label", tr("tracker.appointmentAria"));
        dt.addEventListener("change", async () => {
          await store.upsertTracker({ portal: e.portal, listingId: e.listingId, besichtigung: dt.value });
          renderTracker();
        });
        extra.appendChild(lbl); extra.appendChild(dt);
        if (e.besichtigung && !isNaN(new Date(e.besichtigung))) {
          const ics = document.createElement("button"); ics.type = "button"; ics.className = "btn";
          ics.textContent = tr("tracker.ics"); ics.title = tr("tracker.icsTitle");
          ics.addEventListener("click", () => downloadIcs(e));
          extra.appendChild(ics);
        }
        main.appendChild(extra);
      }

      // Nachfass-Erinnerung: beworben + N Tage ohne Antwort → Hinweis + Aktion.
      if (e.status === "beworben") {
        const waitDays = (WBA.CONFIG && WBA.CONFIG.FOLLOWUP_AFTER_DAYS) || 4;
        const days = Math.floor((Date.now() - (e.appliedAt || e.ts || Date.now())) / 86400000);
        if (e.followupAt) {
          const extra = document.createElement("div"); extra.className = "ti-extra";
          const note = document.createElement("span"); note.className = "ti-done-note";
          note.textContent = tr("tracker.followedUp", { when: relTime(e.followupAt) });
          extra.appendChild(note); main.appendChild(extra);
        } else if (days >= waitDays) {
          const extra = document.createElement("div"); extra.className = "ti-extra";
          const hint = document.createElement("span"); hint.className = "ti-followup";
          hint.textContent = tr("tracker.noReplyDays", { n: days });
          const fu = document.createElement("button"); fu.type = "button"; fu.className = "btn";
          fu.textContent = tr("tracker.followUp"); fu.title = tr("tracker.followUpTitle");
          fu.addEventListener("click", () => followUpFor(e));
          extra.appendChild(hint); extra.appendChild(fu);
          main.appendChild(extra);
        }
      }

      const sel = document.createElement("select"); sel.style.width = "auto";
      STATUSES.forEach((s) => { const o = document.createElement("option"); o.value = s; o.textContent = statusLabel(s); if (e.status === s) o.selected = true; sel.appendChild(o); });
      sel.addEventListener("change", async () => { await store.upsertTracker({ portal: e.portal, listingId: e.listingId, status: sel.value }); renderTracker(); });

      const badge = document.createElement("span"); badge.className = "status-badge status-" + (e.status || "vorbereitet"); badge.textContent = statusLabel(e.status || "vorbereitet");

      // Eintrag löschen (z. B. Fehlklick, erledigte/abgesagte Wohnung, Datenhygiene).
      const del = document.createElement("button");
      del.type = "button"; del.className = "btn"; del.textContent = "✕";
      del.title = tr("tracker.delete"); del.setAttribute("aria-label", tr("tracker.delete"));
      del.style.cssText = "width:auto;padding:4px 10px;flex:0 0 auto";
      del.addEventListener("click", async () => {
        await store.removeTracker(e.portal, e.listingId);
        toast(tr("tracker.deleted"), "info");
        renderTracker();
      });

      item.appendChild(main); item.appendChild(badge); item.appendChild(sel); item.appendChild(del);
      box.appendChild(item);
    });
  }
  $("trackerFilter").addEventListener("change", renderTracker);
  $("exportTracker").addEventListener("click", async () => {
    const list = await store.getTracker();
    if (!list.length) { toast(tr("tracker.nothingToExport"), "info"); return; }
    // Die CSV liest der Nutzer selbst → Kopfzeile, Statuswörter und Datumsformat
    // folgen der Oberflächensprache.
    const loc = i18n.locale();
    const head = ["csv.portal","csv.title","csv.city","csv.sqm","csv.price","csv.tone","csv.status","csv.viewing","csv.date","csv.url"].map((k) => tr(k));
    const rows = list.map((e) => [ (portals.byId(e.portal) || {}).name || e.portal, e.title || e.flatSummary || "", e.ort || "", e.qm || "", e.preis || "", toneLabel(e.ton || ""), statusLabel(e.status || "vorbereitet"), e.besichtigung && !isNaN(new Date(e.besichtigung)) ? new Date(e.besichtigung).toLocaleString(loc) : "", e.ts ? new Date(e.ts).toLocaleString(loc) : "", e.url || "" ]);
    // CSV-Formel-Injection verhindern: Zellen, die mit = + - @ beginnen, entschärfen.
    const safe = (c) => { let s = String(c == null ? "" : c); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const csv = [head].concat(rows).map((r) => r.map(safe).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = tr("csv.file"); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(tr("tracker.exported"), "ok");
  });

  /* ================= KI-EINSTELLUNGEN ================= */
  function aiSyncFields() {
    const mode = $("aiMode").value;
    $("aiKeyWrap").hidden = mode !== "anthropic";
    $("aiModelWrap").hidden = mode !== "anthropic";
  }
  async function loadSettings() {
    const s = await store.getSettings();
    if ($("aiMode")) $("aiMode").value = s.mode || "off";
    if ($("aiKey")) $("aiKey").value = s.apiKey || "";
    if ($("aiModel")) $("aiModel").value = s.model || "claude-haiku-4-5";
    aiSyncFields();
    if ($("aiPill")) $("aiPill").hidden = !WBA.ai.isConfigured(s);
  }
  function readSettings() {
    return {
      mode: $("aiMode").value,
      apiKey: $("aiKey").value.trim(),
      model: $("aiModel").value,
    };
  }
  if ($("aiMode")) $("aiMode").addEventListener("change", aiSyncFields);
  if ($("aiSave")) $("aiSave").addEventListener("click", async () => {
    const s = readSettings();
    await store.setSettings(s);
    if ($("aiPill")) $("aiPill").hidden = !WBA.ai.isConfigured(s);
    const st = $("aiStatus"); st.className = "form-status ok"; st.textContent = tr("ai.saved");
    toast(tr("ai.savedToast"), "ok");
  });
  // Technische Fehler in eine Handlungsanweisung übersetzen – niemand kann mit
  // „Anthropic HTTP 401" oder „Failed to fetch" etwas anfangen.
  function aiErrorText(err) {
    err = String(err || "");
    if (err === "not_configured") return tr("ai.errNotConfigured");
    if (/401|invalid.*key|authentication/i.test(err)) return tr("ai.err401");
    if (/403/.test(err)) return tr("ai.err403");
    if (/404/.test(err)) return tr("ai.err404");
    if (/429/.test(err)) return tr("ai.err429");
    if (/5\d\d/.test(err)) return tr("ai.err5xx", { code: (err.match(/5\d\d/) || [""])[0] });
    if (/abort/i.test(err)) return tr("ai.errTimeout");
    if (/failed to fetch|network/i.test(err)) return tr("ai.errNetwork");
    if (err === "empty") return tr("ai.errEmpty");
    return tr("ai.errOther", { err: err.slice(0, 120) });
  }
  if ($("aiTest")) $("aiTest").addEventListener("click", async () => {
    const s = readSettings();
    await store.setSettings(s);
    const st = $("aiStatus");
    const btn = $("aiTest");
    if (!WBA.ai.isConfigured(s)) { st.className = "form-status info"; st.textContent = tr("ai.errNotConfigured"); return; }
    st.className = "form-status info"; st.textContent = tr("ai.testing");
    btn.disabled = true;
    try {
      const r = await WBA.ai.requestDetailed({
        profile: { name: "Max Mustermann", employment: "unbefristet", income: "3000 €", persons: "1" },
        flat: { desc: "3-Zimmer-Wohnung in Köln, 70 m², Kaltmiete 900 €", contactAnrede: "", contactName: "" },
        mode: "standard", info: parse.extractFlatInfo("3-Zimmer-Wohnung in Köln, 70 m², Kaltmiete 900 €"),
      });
      if (r.text) { st.className = "form-status ok"; st.textContent = tr("ai.answers", { text: r.text.slice(0, 80) }); }
      else { st.className = "form-status error"; st.textContent = aiErrorText(r.error); }
    } finally { btn.disabled = false; }
  });

  /* ================= INIT ================= */
  // „⭐ Bewerten"-Button nur einblenden, wenn oben eine Store-Adresse hinterlegt wurde.
  if (STORE_URL && $("rateBtn")) { $("rateBtn").href = STORE_URL.replace(/\/$/, "") + "/reviews"; $("rateBtn").hidden = false; }

  (async function init() {
    await store.migrate();
    // Sprache VOR allem anderen: jeder Renderer unten holt seine Texte daraus.
    await i18n.init();
    i18n.apply(document);
    await initTheme();
    await loadProfile();
    await loadSettings();
    docsState = await store.getDocs();
    if ($("noSchufa")) $("noSchufa").checked = !!docsState.noSchufa;
    historyList = await store.getHistory();
    await loadFilters();
    renderChecklist(); renderHistory(); updateProfileUI(); syncGenerateLabel();
    const tab = (location.hash || "").replace("#", "");
    if (TABS.includes(tab)) showTab(tab);
    renderTracker();
  })();
})();
