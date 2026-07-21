(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const parse = WBA.parse;
  const letter = WBA.letter;
  const store = WBA.store;
  const portals = WBA.portals;

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
    applyTheme(t); store.setTheme(t); toast(($("themeToggle").checked ? "Dunkles" : "Helles") + " Design aktiv", "info");
  });
  async function initTheme() {
    const saved = await store.getTheme();
    if (saved) { themeManual = true; applyTheme(saved); return; }
    applyTheme(sysDark && sysDark.matches ? "dark" : "light");
    if (sysDark && sysDark.addEventListener) sysDark.addEventListener("change", (e) => { if (!themeManual) applyTheme(e.matches ? "dark" : "light"); });
  }

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
  function saveProfile() { clearTimeout(profileSaveTimer); profileSaveTimer = null; store.setProfile(getProfile()); flash("profileNote", "✓ Profil gespeichert"); updateProfileUI(); }
  function clearProfile() {
    if (!confirm("Profil wirklich zurücksetzen?")) return;
    clearTimeout(profileSaveTimer); profileSaveTimer = null; // ausstehender Autosave würde das Alte zurückschreiben
    store.remove(store.KEYS.profile);
    profileFields.forEach((f) => { if ($(f)) $(f).value = ""; });
    updateProfileUI(); renderChecklist(); flash("profileNote", "Profil zurückgesetzt");
  }
  function saveFlat() {
    store.setFlat({ desc: $("flatDesc").value.trim(), contactAnrede: $("contactAnrede").value, contactName: $("contactName").value.trim() });
  }
  $("saveProfile").addEventListener("click", saveProfile);
  $("clearProfile").addEventListener("click", clearProfile);
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
    if ($("progressLabel")) $("progressLabel").textContent = "Profil zu " + pct + " % ausgefüllt";
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
    if (!p.name) { setFieldError("name", "Bitte gib deinen Namen ein."); errors++; }
    if (p.age) { const a = Number(p.age); if (!Number.isFinite(a) || a < 14 || a > 120) { setFieldError("age", "Bitte ein realistisches Alter angeben (14–120)."); errors++; } }
    if (p.persons) { const nn = Number(p.persons); if (!Number.isInteger(nn) || nn < 1 || nn > 20) { setFieldError("persons", "Bitte eine ganze Zahl ab 1 angeben."); errors++; } }
    if (p.income && !/\d/.test(p.income)) { setFieldError("income", "Bitte einen Betrag mit Zahl angeben, z. B. 2500 €."); errors++; }
    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) { setFieldError("email", "Bitte eine gültige E-Mail-Adresse angeben."); errors++; }
    return errors;
  }
  VALIDATED.forEach((id) => { const el = $(id); if (el) el.addEventListener("input", () => { clearFieldError(id); if (!$("genStatus").classList.contains("info")) setStatus(""); }); });

  /* ================= ANSCHREIBEN ================= */
  let parsedInfo = {};
  function renderChips(info) {
    const box = $("flatParsed"); const chips = [];
    if (info.zimmer) chips.push(info.zimmer + " Zimmer");
    if (info.groesse) chips.push(info.groesse + " m²");
    if (info.preis) chips.push(info.preis + (info.preisLabel && info.preisLabel !== "Miete" ? " " + info.preisLabel : ""));
    if (info.ort) chips.push(info.ort);
    if (info.frei) chips.push("frei ab " + info.frei);
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
      setStatus("Bitte korrigiere die " + errors + (errors === 1 ? " markierte Angabe" : " markierten Angaben") + " im Profil.", "error");
      toast(errors === 1 ? "Bitte eine Angabe im Profil korrigieren" : "Bitte Angaben im Profil korrigieren", "info");
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
      const label = btn.textContent; btn.disabled = true; btn.textContent = "KI schreibt …";
      text = await WBA.ai.request({ profile: p, flat, mode: currentMode, info: parsedInfo, docs: docsState });
      btn.disabled = false; btn.textContent = label;
      // Blacklist gilt auch für KI-Texte: Floskel drin → eingebauten Generator nutzen.
      if (text && letter.containsBlacklisted(text, p.about)) text = null;
      if (!text) toast("KI nicht erreichbar – eingebauter Generator genutzt", "info");
    }
    if (!text) text = await letter.generate(p, flat, currentMode, parsedInfo, { docs: docsState });

    const out = $("output");
    out.classList.remove("out-empty"); out.textContent = text;
    out.classList.remove("reveal"); void out.offsetWidth; out.classList.add("reveal");
    saveFlat();
    pushHistory({ tone: currentMode, flatSummary: parse.summaryFromInfo(parsedInfo) || (flat.desc ? parse.flatOneLine(flat) : "Ohne Wohnungsangabe"), contactName: flat.contactName, text });
    $("generate").textContent = "Neu formulieren";
    setStatus("", "");
    if (!flat.desc) toast("Tipp: Anzeigentext ergänzen für ein persönlicheres Anschreiben", "info");
    else if (wasEmpty) toast("Anschreiben erstellt ✓", "ok");
    else toast("Neue Formulierung erstellt", "ok");
  }
  $("generate").addEventListener("click", generate);
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && $("tab-anschreiben").classList.contains("active")) { e.preventDefault(); generate(); } });

  $("copyBtn").addEventListener("click", async () => {
    const out = $("output"); if (out.classList.contains("out-empty")) return;
    const text = out.textContent;
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    const btn = $("copyBtn"); btn.classList.add("copied"); btn.textContent = "✓ Kopiert";
    setTimeout(() => { btn.classList.remove("copied"); btn.textContent = "Kopieren"; }, 1500);
    toast("In Zwischenablage kopiert", "ok");
  });

  $("pasteClip").addEventListener("click", async () => {
    const status = $("flatStatus");
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) { status.className = "form-status info"; status.textContent = "Die Zwischenablage ist leer. Kopiere zuerst den Anzeigentext (Strg/Cmd + C)."; return; }
      $("flatDesc").value = text.trim();
      const hits = refreshParsed();
      // Ansprechpartner:in automatisch übernehmen, wenn das Feld noch leer ist.
      const c = parse.extractContact(text);
      if (c && !$("contactName").value.trim()) { $("contactAnrede").value = c.anrede; $("contactName").value = c.name; }
      saveFlat();
      status.className = "form-status ok";
      status.textContent = hits ? "✓ Eingefügt – " + hits + (hits === 1 ? " Angabe erkannt." : " Angaben erkannt.") : "✓ Text eingefügt. (Keine Eckdaten erkannt – du kannst sie von Hand ergänzen.)";
      // Anrede-Kategorie sichtbar machen (fail-safe: Unsicheres bleibt neutral).
      status.textContent += " · Anrede " + WBA.salutation.badge(manualSalutation()).text;
    } catch (e) { status.className = "form-status info"; status.textContent = "Bitte den Text direkt ins Feld einfügen (Strg/Cmd + V)."; $("flatDesc").focus(); }
  });

  // Text aus einem offenen Anzeigen-Tab lesen (Dashboard ist selbst ein Tab).
  $("loadFromTab").addEventListener("click", async () => {
    const status = $("flatStatus");
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting) { status.className = "form-status info"; status.textContent = "Diese Funktion ist nur in der installierten Erweiterung verfügbar."; return; }
    try {
      const tabs = await chrome.tabs.query({});
      const selfUrl = location.href;
      // NUR Portal-Tabs: für andere Seiten fehlt die Host-Berechtigung, executeScript
      // würde dort immer scheitern (früherer Fallback auf den jüngsten Tab war ein
      // toter Pfad und erzeugte nur die irreführende „Konnte den Tab nicht lesen"-Meldung).
      // Bei mehreren Portal-Tabs den zuletzt benutzten nehmen.
      const cand = tabs.filter((t) => t.url && /^https?:/i.test(t.url) && t.url !== selfUrl && portals.forUrl(t.url));
      const portalTab = cand.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
      if (!portalTab) { status.className = "form-status info"; status.textContent = "Kein offener Anzeigen-Tab gefunden. Öffne die Wohnungsanzeige auf einem der unterstützten Portale und versuche es erneut."; return; }
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
      status.textContent = hits ? "✓ Aus „" + (portalTab.title || "Anzeige") + "\" übernommen." : "Tab gelesen, aber keine Eckdaten erkannt – bitte Text von Hand einfügen.";
      status.textContent += " · Anrede " + WBA.salutation.badge(manualSalutation()).text;
    } catch (e) { status.className = "form-status info"; status.textContent = "Konnte den Tab nicht lesen. Bitte den Anzeigentext manuell einfügen."; }
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
      $("generate").textContent = "Neu formulieren";
      if (isDemoProfile) setStatus("Beispiel mit Demo-Profil „Max Mustermann“ – fülle dein Profil aus, dann steht hier dein Name.", "info");
      else setStatus("Beispiel-Anzeige geladen – Anschreiben mit deinem Profil erstellt.", "info");
      toast(hits ? "Beispiel erstellt – " + hits + " Angaben aus der Anzeige erkannt ✓" : "Beispiel erstellt ✓", "ok");
    } finally { demoRunning = false; }
  }
  if ($("demoBtn")) $("demoBtn").addEventListener("click", runDemo);
  if ($("welcomeDemo")) $("welcomeDemo").addEventListener("click", runDemo);

  /* ---- Verlauf ---- */
  function toneLabel(t) { return { standard: "Standard", formal: "Formal", kurz: "Kurz", herzlich: "Herzlich", selbstbewusst: "Selbstsicher" }[t] || t; }
  function relTime(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return "gerade eben";
    const m = Math.round(s / 60); if (m < 60) return "vor " + m + " Min";
    const h = Math.round(m / 60); if (h < 24) return "vor " + h + " Std";
    const d = Math.round(h / 24); return "vor " + d + " Tag" + (d > 1 ? "en" : "");
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
    if (!historyList.length) { const em = document.createElement("div"); em.className = "history-empty"; em.textContent = "Noch nichts erstellt."; box.appendChild(em); return; }
    historyList.forEach((e) => {
      const item = document.createElement("button"); item.type = "button"; item.className = "history-item";
      const main = document.createElement("span"); main.className = "hi-main";
      main.textContent = (e.contactName ? e.contactName + " · " : "") + (e.flatSummary || "Wohnung");
      const meta = document.createElement("span"); meta.className = "hi-meta"; meta.textContent = toneLabel(e.tone) + " · " + relTime(e.ts);
      item.appendChild(main); item.appendChild(meta);
      item.addEventListener("click", () => {
        const out = $("output"); out.classList.remove("out-empty"); out.textContent = e.text;
        out.classList.remove("reveal"); void out.offsetWidth; out.classList.add("reveal");
        $("generate").textContent = "Neu formulieren"; toast("Aus Verlauf geladen", "info");
      });
      box.appendChild(item);
    });
    const clear = document.createElement("button"); clear.type = "button"; clear.className = "btn history-clear"; clear.textContent = "Verlauf leeren";
    clear.addEventListener("click", () => { historyList = []; store.setHistory([]); renderHistory(); toast("Verlauf geleert", "info"); });
    box.appendChild(clear);
  }

  /* ================= UNTERLAGEN ================= */
  function checklistItems(p) {
    const items = [
      { id: "ausweis", label: "Personalausweis (Kopie, Vorder- & Rückseite)" }
    ];
    // Bei negativer/fehlender SCHUFA (noSchufa-Schalter) wird sie nicht verlangt –
    // stattdessen unten die Bürgschaft als realistische Alternative anbieten.
    if (!docsState.noSchufa) items.push({ id: "schufa", label: "SCHUFA-Bonitätsauskunft (aktuell)" });
    if (p.employment === "buergergeld") { items.push({ id: "jobcenter", label: "Aktueller Bescheid des Jobcenters (Bürgergeld/Grundsicherung)" }); items.push({ id: "kdu", label: "Bestätigung der Mietkostenübernahme (Jobcenter)" }); }
    else if (p.employment === "rente") { items.push({ id: "rente", label: "Rentenbescheid" }); }
    else if (p.employment === "selbststaendig") { items.push({ id: "bwa", label: "BWA / letzter Steuerbescheid" }); }
    else if (p.employment === "azubi") { items.push({ id: "ausbildung", label: "Ausbildungsvertrag / Immatrikulationsbescheinigung" }); items.push({ id: "buergschaft", label: "Bürgschaft (z. B. der Eltern)" }); }
    else { items.push({ id: "gehalt", label: "Einkommensnachweise (letzte 3 Gehaltsabrechnungen)" }); }
    items.push({ id: "mietschulden", label: "Mietschuldenfreiheitsbescheinigung (aktueller Vermieter)" });
    if (docsState.noSchufa && !items.some((i) => i.id === "buergschaft")) {
      items.push({ id: "buergschaft", label: "Bürgschaft (z. B. Eltern oder Freunde) – gute Alternative zur SCHUFA" });
    }
    items.push({ id: "selbstauskunft", label: "Ausgefüllte Selbstauskunft (unten erstellen)" });
    return items;
  }
  function setDoc(id, checked) { docsState[id] = checked; store.setDocs(docsState); }
  // SCHUFA-Schutz-Schalter: nie erwähnen + nicht verlangen (siehe dashboard.html).
  if ($("noSchufa")) $("noSchufa").addEventListener("change", () => {
    docsState.noSchufa = $("noSchufa").checked;
    if (docsState.noSchufa) docsState.schufa = false; // ein evtl. gesetztes „liegt bereit" zurücknehmen
    store.setDocs(docsState);
    renderChecklist();
    toast(docsState.noSchufa ? "Okay – die SCHUFA wird in Anschreiben nie erwähnt" : "SCHUFA ist wieder Teil der Checkliste", "info");
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
    if (!p.name) { flash("docHint", "Bitte zuerst im Profil mindestens den Namen ausfüllen."); showTab("profil"); return; }
    const flat = { desc: $("flatDesc").value.trim() }; const info = parse.extractFlatInfo(flat.desc);
    const w = window.open("", "_blank");
    if (!w) { flash("docHint", "Bitte Pop-ups für die Erweiterung erlauben und erneut klicken."); return; }
    w.document.open(); w.document.write(selbstauskunftHTML(p, flat, info)); w.document.close();
    setDoc("selbstauskunft", true); renderChecklist();
    flash("docHint", "✓ Selbstauskunft geöffnet – dort Strg/Cmd + P zum Speichern als PDF.");
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
      if (p.experimental) { const pill = document.createElement("span"); pill.className = "pill exp"; pill.textContent = "experimentell"; label.appendChild(pill); }
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
    if (!f.ort) { status.className = "form-status info"; status.textContent = "Bitte einen Ort eingeben."; $("fOrt").focus(); return; }
    const chosen = portals.PORTALS.filter((p) => selectedPortals[p.id] !== false);
    if (!chosen.length) { status.className = "form-status info"; status.textContent = "Bitte mindestens ein Portal auswählen."; return; }
    saveFilters();
    setTone(f.ton || "standard");
    if (typeof chrome === "undefined" || !chrome.tabs) { status.className = "form-status info"; status.textContent = "Suche öffnen ist nur in der installierten Erweiterung möglich. (URLs: " + chosen.map((p) => p.buildSearchUrl(f)).join(" | ") + ")"; return; }
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
        status.textContent = "Die Trefferlisten konnten nicht geöffnet werden – bitte erneut versuchen.";
        return;
      }
      status.className = "form-status ok";
      status.textContent = "✓ " + opened + " Trefferliste(n) geöffnet. Im ersten Tab startest du den Durchlauf – der Assistent bereitet jede Anzeige vor.";
      toast("Suche geöffnet auf " + opened + " Portal(en)", "ok");
    } finally { btn.disabled = false; }
  });

  /* ================= BEWERBUNGEN (Tracker) ================= */
  const STATUSES = ["vorbereitet", "beworben", "antwort", "besichtigung", "übersprungen"];
  function statusLabel(s) { return { vorbereitet: "Vorbereitet", beworben: "Beworben", antwort: "Antwort erhalten", besichtigung: "Besichtigung", übersprungen: "Übersprungen" }[s] || s; }

  // Besichtigungs-Termin als Kalender-Datei (.ics) – lokale „floating time",
  // damit der Termin in der Zeitzone des Kalenders gilt. Mechanik wie CSV-Export.
  function icsStamp(dd) {
    const p2 = (n) => String(n).padStart(2, "0");
    return dd.getFullYear() + p2(dd.getMonth() + 1) + p2(dd.getDate()) + "T" + p2(dd.getHours()) + p2(dd.getMinutes()) + "00";
  }
  function downloadIcs(e) {
    const start = new Date(e.besichtigung);
    if (isNaN(start)) { toast("Bitte zuerst einen gültigen Termin wählen", "info"); return; }
    const end = new Date(start.getTime() + 45 * 60000);
    const escIcs = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WohnungsBewerber//DE", "BEGIN:VEVENT",
      "UID:" + store.trackerKey(e.portal, e.listingId).replace(/[^A-Za-z0-9._-]/g, "-") + "@wohnungsbewerber",
      "DTSTAMP:" + icsStamp(new Date()),
      "DTSTART:" + icsStamp(start),
      "DTEND:" + icsStamp(end),
      "SUMMARY:" + escIcs("Besichtigung: " + (e.title || "Wohnung")),
      e.ort ? "LOCATION:" + escIcs(e.ort) : "",
      e.url ? "DESCRIPTION:" + escIcs(e.url) : "",
      "END:VEVENT", "END:VCALENDAR",
    ].filter(Boolean);
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "besichtigung.ics"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Kalender-Datei gespeichert", "ok");
  }

  // Nachfassen: höflichen Text kopieren, Zeitpunkt merken, Anzeige öffnen.
  // Gesendet wird – wie immer – nur vom Nutzer selbst auf der Portalseite.
  async function followUpFor(e) {
    const profile = await store.getProfile();
    const text = letter.followUp(e, profile);
    try { await navigator.clipboard.writeText(text); }
    catch (err) { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    await store.upsertTracker({ portal: e.portal, listingId: e.listingId, followupAt: Date.now() });
    toast("Nachfass-Text kopiert – auf der Anzeigenseite einfügen und senden", "ok");
    if (e.url) { if (typeof chrome !== "undefined" && chrome.tabs) chrome.tabs.create({ url: e.url }); else window.open(e.url, "_blank"); }
    renderTracker();
  }
  async function renderTracker() {
    const list = await store.getTracker();
    const filter = $("trackerFilter").value;
    const box = $("trackerList"); box.innerHTML = "";
    const nav = $("navTrackerCount");
    if (nav) { nav.hidden = !list.length; nav.textContent = list.length; }
    // Kompakte Erfolgs-Statistik (immer über der Gesamtliste, unabhängig vom Filter):
    // Antworten = „antwort" + „besichtigung" (eine Besichtigung setzt eine Antwort voraus).
    const nBeworben = list.filter((e) => store.APPLIED_STATUS.includes(e.status)).length;
    const nAntworten = list.filter((e) => e.status === "antwort" || e.status === "besichtigung").length;
    const nBesicht = list.filter((e) => e.status === "besichtigung").length;
    if (nBeworben) {
      const stats = document.createElement("div"); stats.className = "tracker-stats";
      const chip = (t) => { const s = document.createElement("span"); s.className = "chip"; s.textContent = t; stats.appendChild(s); };
      chip(nBeworben + " beworben");
      chip(nAntworten + (nAntworten === 1 ? " Antwort" : " Antworten") + " (" + Math.round((nAntworten / nBeworben) * 100) + " %)");
      if (nBesicht) chip(nBesicht + (nBesicht === 1 ? " Besichtigung" : " Besichtigungen"));
      box.appendChild(stats);
    }

    const shown = filter ? list.filter((e) => e.status === filter) : list;
    if (!shown.length) {
      // anhängen statt innerHTML setzen – die Statistik-Zeile darüber bleibt erhalten
      const empty = document.createElement("div"); empty.className = "empty";
      empty.innerHTML = '<span class="emoji">' + (WBA.icons ? WBA.icons.svg("inbox", 34) : "") + '</span><h3>Noch keine Bewerbungen' + (filter ? " mit diesem Status" : "") + '</h3><p>Starte eine Suche und gehe die Anzeigen durch – hier erscheint dann jede vorbereitete und gesendete Bewerbung.</p>';
      box.appendChild(empty);
      return;
    }
    shown.forEach((e) => {
      const item = document.createElement("div"); item.className = "tracker-item";
      const main = document.createElement("div"); main.className = "ti-main";
      const title = document.createElement("p"); title.className = "ti-title"; title.textContent = e.title || e.flatSummary || "Wohnung";
      const meta = document.createElement("div"); meta.className = "ti-meta";
      const portalName = (portals.byId(e.portal) || {}).name || e.portal || "";
      meta.textContent = [portalName, e.ort, e.qm ? e.qm + " m²" : "", e.preis, relTime(e.ts || Date.now())].filter(Boolean).join(" · ");
      main.appendChild(title); main.appendChild(meta);
      if (e.url) { title.style.cursor = "pointer"; title.addEventListener("click", () => { if (typeof chrome !== "undefined" && chrome.tabs) chrome.tabs.create({ url: e.url }); else window.open(e.url, "_blank"); }); }

      // Besichtigung: Termin-Feld (+ ICS-Export, sobald ein Termin gesetzt ist)
      if (e.status === "besichtigung") {
        const extra = document.createElement("div"); extra.className = "ti-extra";
        const lbl = document.createElement("span"); lbl.textContent = "Termin:";
        const dt = document.createElement("input"); dt.type = "datetime-local"; dt.value = e.besichtigung || "";
        dt.setAttribute("aria-label", "Besichtigungstermin");
        dt.addEventListener("change", async () => {
          await store.upsertTracker({ portal: e.portal, listingId: e.listingId, besichtigung: dt.value });
          renderTracker();
        });
        extra.appendChild(lbl); extra.appendChild(dt);
        if (e.besichtigung && !isNaN(new Date(e.besichtigung))) {
          const ics = document.createElement("button"); ics.type = "button"; ics.className = "btn";
          ics.textContent = "In Kalender (ICS)"; ics.title = "Termin als Kalender-Datei speichern";
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
          note.textContent = "Nachgefasst " + relTime(e.followupAt);
          extra.appendChild(note); main.appendChild(extra);
        } else if (days >= waitDays) {
          const extra = document.createElement("div"); extra.className = "ti-extra";
          const hint = document.createElement("span"); hint.className = "ti-followup";
          hint.textContent = "Seit " + days + " Tagen keine Antwort";
          const fu = document.createElement("button"); fu.type = "button"; fu.className = "btn";
          fu.textContent = "Nachfassen"; fu.title = "Höflichen Nachfass-Text kopieren und Anzeige öffnen";
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
      del.title = "Eintrag löschen"; del.setAttribute("aria-label", "Eintrag löschen");
      del.style.cssText = "width:auto;padding:4px 10px;flex:0 0 auto";
      del.addEventListener("click", async () => {
        await store.removeTracker(e.portal, e.listingId);
        toast("Eintrag gelöscht", "info");
        renderTracker();
      });

      item.appendChild(main); item.appendChild(badge); item.appendChild(sel); item.appendChild(del);
      box.appendChild(item);
    });
  }
  $("trackerFilter").addEventListener("change", renderTracker);
  $("exportTracker").addEventListener("click", async () => {
    const list = await store.getTracker();
    if (!list.length) { toast("Keine Bewerbungen zum Exportieren", "info"); return; }
    const head = ["Portal","Titel","Ort","m²","Preis","Ton","Status","Besichtigung","Datum","URL"];
    const rows = list.map((e) => [ (portals.byId(e.portal) || {}).name || e.portal, e.title || e.flatSummary || "", e.ort || "", e.qm || "", e.preis || "", e.ton || "", statusLabel(e.status || "vorbereitet"), e.besichtigung && !isNaN(new Date(e.besichtigung)) ? new Date(e.besichtigung).toLocaleString("de-DE") : "", e.ts ? new Date(e.ts).toLocaleString("de-DE") : "", e.url || "" ]);
    // CSV-Formel-Injection verhindern: Zellen, die mit = + - @ beginnen, entschärfen.
    const safe = (c) => { let s = String(c == null ? "" : c); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const csv = [head].concat(rows).map((r) => r.map(safe).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "bewerbungen.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("CSV exportiert", "ok");
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
    const st = $("aiStatus"); st.className = "form-status ok"; st.textContent = "✓ Gespeichert.";
    toast("KI-Einstellungen gespeichert ✓", "ok");
  });
  // Technische Fehler in eine Handlungsanweisung übersetzen – niemand kann mit
  // „Anthropic HTTP 401" oder „Failed to fetch" etwas anfangen.
  function aiErrorText(err) {
    err = String(err || "");
    if (err === "not_configured") return "Bitte Modus + API-Schlüssel ausfüllen.";
    if (/401|invalid.*key|authentication/i.test(err)) return "Der API-Schlüssel wurde abgelehnt (401) – bitte den Schlüssel prüfen.";
    if (/403/.test(err)) return "Zugriff verweigert (403) – Schlüssel bzw. Berechtigungen prüfen.";
    if (/404/.test(err)) return "Nicht gefunden (404) – bitte den Modellnamen prüfen.";
    if (/429/.test(err)) return "Zu viele Anfragen (429) – kurz warten und erneut testen.";
    if (/5\d\d/.test(err)) return "Der Server meldet einen Fehler (" + (err.match(/5\d\d/) || [""])[0] + ") – später erneut versuchen.";
    if (/abort/i.test(err)) return "Zeitüberschreitung nach 30 s – Server nicht erreichbar?";
    if (/failed to fetch|network/i.test(err)) return "Netzwerkfehler – bitte die Internetverbindung prüfen.";
    if (err === "empty") return "Die KI hat einen leeren Text geliefert – bitte erneut testen.";
    return "Keine Antwort (" + err.slice(0, 120) + "). Bitte den API-Schlüssel prüfen.";
  }
  if ($("aiTest")) $("aiTest").addEventListener("click", async () => {
    const s = readSettings();
    await store.setSettings(s);
    const st = $("aiStatus");
    const btn = $("aiTest");
    if (!WBA.ai.isConfigured(s)) { st.className = "form-status info"; st.textContent = "Bitte Modus + API-Schlüssel ausfüllen."; return; }
    st.className = "form-status info"; st.textContent = "Teste KI …";
    btn.disabled = true;
    try {
      const r = await WBA.ai.requestDetailed({
        profile: { name: "Max Mustermann", employment: "unbefristet", income: "3000 €", persons: "1" },
        flat: { desc: "3-Zimmer-Wohnung in Köln, 70 m², Kaltmiete 900 €", contactAnrede: "", contactName: "" },
        mode: "standard", info: parse.extractFlatInfo("3-Zimmer-Wohnung in Köln, 70 m², Kaltmiete 900 €"),
      });
      if (r.text) { st.className = "form-status ok"; st.textContent = "✓ KI antwortet – " + r.text.slice(0, 80) + "…"; }
      else { st.className = "form-status error"; st.textContent = aiErrorText(r.error); }
    } finally { btn.disabled = false; }
  });

  /* ================= INIT ================= */
  // „⭐ Bewerten"-Button nur einblenden, wenn oben eine Store-Adresse hinterlegt wurde.
  if (STORE_URL && $("rateBtn")) { $("rateBtn").href = STORE_URL.replace(/\/$/, "") + "/reviews"; $("rateBtn").hidden = false; }

  (async function init() {
    await store.migrate();
    await initTheme();
    await loadProfile();
    await loadSettings();
    docsState = await store.getDocs();
    if ($("noSchufa")) $("noSchufa").checked = !!docsState.noSchufa;
    historyList = await store.getHistory();
    await loadFilters();
    renderChecklist(); renderHistory(); updateProfileUI();
    const tab = (location.hash || "").replace("#", "");
    if (TABS.includes(tab)) showTab(tab);
    renderTracker();
  })();
})();
