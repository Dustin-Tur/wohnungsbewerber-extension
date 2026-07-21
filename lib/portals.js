/* WBA.portals – ein Adapter je Portal (Adapter-Pattern).
   Neues Portal unterstützen = EIN neues PortalAdapter-Objekt in PORTALS ergänzen;
   kein anderer Codepfad muss angefasst werden. WBA.portals.dom.* nutzt die
   Adapter-Hinweise mit mehrstufigen generischen Fallbacks, damit der Ablauf
   auch dann funktioniert, wenn ein Portal sein HTML ändert.
   Läuft in Fenster- (window) wie Content-Script-Kontext.

   Adapter-Vertrag:
   @typedef {Object} PortalAdapter
   @property {string}   id                Stabiler Schlüssel (Tracker, Run-Queue, Filter).
   @property {string}   name              Anzeigename fürs UI.
   @property {RegExp}   host              Hostname-Erkennung (forUrl).
   @property {boolean}  [experimental]    Kennzeichnung im Portal-Grid.
   @property {boolean}  [driveSearch]     false = Suchmaske NICHT befüllen (buildSearchUrl
                                          filtert bereits zuverlässig über die URL).
   @property {string}   searchHome        Fallback-Such-URL ohne bekannten Ort.
   @property {function(Object): string} buildSearchUrl  Filter → Trefferlisten-URL (best effort).
   @property {RegExp}   listingUrlRe      Erkennt Einzelanzeigen-URLs.
   @property {RegExp}   resultsUrlRe      Erkennt Trefferlisten-URLs.
   @property {string}   scrapeSel         Selektor für Anzeigen-Links in der Trefferliste.
   @property {string}   [contentSel]      ANZEIGEN-EIGENE Bereiche der Detailseite (Titel,
                                          Preis, Eckdaten, Beschreibung, Ausstattung) für
                                          parse.pageExtractor – verhindert, dass Fremdinhalte
                                          („Ähnliche Anzeigen", Werbung) extrahiert werden.
                                          Fallback ohne Treffer: nur Titel/Meta/ld+json.
   @property {string}   msgSel            Selektor(en) fürs Nachrichten-Textfeld (Fallback:
                                          benannte Textarea → größte sichtbare Textarea).
   @property {string}   [openSel]         Präziser Öffner-Button fürs Kontaktformular.
   @property {RegExp}   [openText]        Text-Fallback für den Öffner-Button.
   @property {string}   [sendSel]         Selektor für den Senden-Button.
   @property {RegExp}   [sendText]        Text-Fallback für den Senden-Button.
   @property {string}   [sellerNameSel]   Anbietername für die Anrede (Gruppen-Reihenfolge
                                          = Priorität, z. B. Firma vor Kontaktname).
   @property {string}   [recipientTitleSel] Composer-Titel mit Empfängername (WG-Gesucht).
   @property {RegExp}   [recipientTitleRe]  Extraktion des Namens aus dem Titel.
   @property {boolean}  [informalGreeting]  true = nur Vorname sicher bekannt →
                                            „Hallo <Vorname>," statt förmlicher Anrede.
   @property {string}   [searchLocSel]    Ortsfeld der Suchmaske (driveSearchForm).
   @property {string}   [searchSubmitSel] Submit-Button der Suchmaske.
   @property {string}   [searchSuggestSel] Autocomplete-Vorschlag der Suchmaske. */
(function (root) {
  "use strict";
  const WBA = (root.WBA = root.WBA || {});

  function slug(ort) {
    return (ort || "").trim().toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function n(v) { const x = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(x) ? x : null; }
  // ImmoScout erwartet Filterwerte mit einer Nachkommastelle (live verifiziert:
  // price=-900.0, livingspace=40.0-, numberofrooms=2.0-). toFixed(1) trägt auch halbe
  // Zimmerzahlen korrekt (2.5-), ohne bei Ganzzahlen ".0.0" zu erzeugen.
  function dec1(x) { const v = n(x); return v == null ? null : v.toFixed(1); }

  // Stadt → ImmoScout-Suchpfad "{bundesland}/{stadt}". Das Live-verifizierte URL-Schema ist
  // /Suche/de/{bundesland}/{stadt}/wohnung-mieten; ein reiner Stadt-Slug (/Suche/de/koeln/…)
  // liefert 404. ImmoScouts Stadt-Slug entspricht slug(amtlicher Name) (verifiziert für
  // „am Main", „im Breisgau", „am Rhein", „(Saale)"). Schlüssel = slug(Ort). Unbekannte Orte
  // fallen auf die bundesweite Suche zurück (der Nutzer grenzt dann oben selbst ein).
  const IS24_GEO = (function () {
    const byLand = {
      "baden-wuerttemberg": "stuttgart karlsruhe mannheim freiburg-im-breisgau heidelberg heilbronn ulm pforzheim reutlingen esslingen-am-neckar ludwigsburg tuebingen konstanz sindelfingen",
      "bayern": "muenchen nuernberg augsburg regensburg ingolstadt wuerzburg fuerth erlangen bamberg bayreuth landshut aschaffenburg rosenheim",
      "berlin": "berlin",
      "brandenburg": "potsdam cottbus brandenburg-an-der-havel",
      "bremen": "bremen bremerhaven",
      "hamburg": "hamburg",
      "hessen": "frankfurt-am-main wiesbaden kassel darmstadt offenbach-am-main hanau giessen marburg fulda",
      "mecklenburg-vorpommern": "rostock schwerin neubrandenburg stralsund greifswald",
      "niedersachsen": "hannover braunschweig oldenburg osnabrueck wolfsburg goettingen salzgitter hildesheim delmenhorst wilhelmshaven lueneburg celle",
      "nordrhein-westfalen": "koeln duesseldorf dortmund essen duisburg bochum wuppertal bielefeld bonn muenster gelsenkirchen moenchengladbach aachen krefeld oberhausen hagen hamm muelheim-an-der-ruhr leverkusen solingen herne neuss paderborn bottrop recklinghausen bergisch-gladbach remscheid siegen witten guetersloh iserlohn dueren",
      "rheinland-pfalz": "mainz ludwigshafen-am-rhein koblenz trier kaiserslautern worms neuwied speyer",
      "saarland": "saarbruecken neunkirchen homburg",
      "sachsen": "leipzig dresden chemnitz zwickau plauen goerlitz",
      "sachsen-anhalt": "halle-saale magdeburg dessau-rosslau",
      "schleswig-holstein": "kiel luebeck flensburg neumuenster norderstedt",
      "thueringen": "erfurt jena gera weimar gotha nordhausen",
    };
    const map = {};
    Object.keys(byLand).forEach((bl) => byLand[bl].split(" ").forEach((c) => { map[c] = bl + "/" + c; }));
    // Kurzformen, die Nutzer häufig statt des amtlichen Namens eingeben.
    Object.assign(map, {
      "frankfurt": "hessen/frankfurt-am-main",
      "freiburg": "baden-wuerttemberg/freiburg-im-breisgau",
      "halle": "sachsen-anhalt/halle-saale",
      "offenbach": "hessen/offenbach-am-main",
      "ludwigshafen": "rheinland-pfalz/ludwigshafen-am-rhein",
      "muelheim": "nordrhein-westfalen/muelheim-an-der-ruhr",
    });
    return map;
  })();

  // WG-Gesucht braucht eine numerische City-ID im Pfad: /wohnungen-in-{Stadt}.{cityId}.2.1.0.html
  // (2 = Wohnung, 1 = Angebote, 0 = Seite). Ein reiner Stadtname (…-in-Berlin.html) liefert 404.
  // IDs stammen aus WG-Gesuchts eigener City-API (/api/location/cities/names/…) und wurden live
  // gegen die Trefferseiten geprüft. Schlüssel = slug(Ort), inkl. Kurz-/Langform-Aliasse.
  const WGG_CITY = {
    berlin: "8", hamburg: "55", muenchen: "90", koeln: "73", frankfurt: "41", "frankfurt-am-main": "41",
    stuttgart: "124", duesseldorf: "30", leipzig: "77", dortmund: "26", essen: "35", bremen: "17",
    dresden: "27", hannover: "57", nuernberg: "96", duisburg: "28", bochum: "12", wuppertal: "142",
    bielefeld: "10", bonn: "13", muenster: "91", karlsruhe: "68", mannheim: "85", augsburg: "2",
    wiesbaden: "135", gelsenkirchen: "46", moenchengladbach: "88", braunschweig: "16", kiel: "71",
    aachen: "1", chemnitz: "19", halle: "2094", magdeburg: "83", freiburg: "43", "freiburg-im-breisgau": "43",
    krefeld: "75", mainz: "84", luebeck: "81", erfurt: "33", oberhausen: "97", rostock: "115",
    kassel: "69", hagen: "52", potsdam: "107", saarbruecken: "116", hamm: "56", ludwigshafen: "80",
    "ludwigshafen-am-rhein": "80", oldenburg: "2522", osnabrueck: "102", leverkusen: "78",
    heidelberg: "59", darmstadt: "23", solingen: "121", herne: "61", regensburg: "111", neuss: "224",
    paderborn: "103", ingolstadt: "65", offenbach: "99", "offenbach-am-main": "99", fuerth: "277",
    ulm: "128", heilbronn: "60", pforzheim: "105", wuerzburg: "141", wolfsburg: "168", goettingen: "49",
    bottrop: "14", reutlingen: "114", koblenz: "72", bremerhaven: "18", "bergisch-gladbach": "7",
    jena: "66", remscheid: "113", erlangen: "34", trier: "126", moers: "275", siegen: "120",
    hildesheim: "62", salzgitter: "219", cottbus: "22", guetersloh: "51", kaiserslautern: "67",
    schwerin: "119", gera: "281", witten: "3094", tuebingen: "127", konstanz: "74", giessen: "47",
    flensburg: "39", marburg: "86", bamberg: "5", bayreuth: "6", landshut: "76", celle: "229",
    aschaffenburg: "231", lueneburg: "82", weimar: "132", wilhelmshaven: "137", delmenhorst: "374",
  };

  const PORTALS = [
    {
      id: "wg-gesucht",
      name: "WG-Gesucht",
      host: /(^|\.)wg-gesucht\.de$/i,
      experimental: false,
      // buildSearchUrl (City-ID-Pfad + Query) filtert live zuverlässig → NICHT per Formular neu
      // absenden (sonst würde #autocompinp die Stadt erneut setzen), wie ImmoScout/Immowelt.
      driveSearch: false,
      searchHome: "https://www.wg-gesucht.de/mietwohnungen",
      buildSearchUrl(f) {
        // Pflicht: numerische City-ID im Pfad (…-in-{Stadt}.{id}.2.1.0.html); reiner Name → 404.
        const id = WGG_CITY[slug(f.ort)];
        if (!id) return this.searchHome; // unbekannte Stadt → bundesweite Suche, Nutzer grenzt selbst ein
        const base = "https://www.wg-gesucht.de/wohnungen-in-" + capFirst(slug(f.ort)) + "." + id + ".2.1.0.html";
        const q = [];
        const rMax = n(f.preisMax); if (rMax) q.push("rMax=" + rMax);
        const rMin = n(f.preisMin); if (rMin) q.push("rMin=" + rMin);
        const sMin = n(f.qmMin); if (sMin) q.push("sMin=" + sMin);
        const sMax = n(f.qmMax); if (sMax) q.push("sMax=" + sMax);
        return q.length ? base + "?" + q.join("&") : base;
      },
      // Detailseite hat eine lange Angebots-ID vor .html; eingeloggt leitet WG-Gesucht direkt auf
      // /nachricht-senden/…-{id}.html weiter (Message-Composer) – matcht ebenfalls listingUrlRe.
      listingUrlRe: /wg-gesucht\.de\/.+\.\d{6,}\.html/i,
      resultsUrlRe: /wg-gesucht\.de\/(wohnungen|wg-zimmer|1-zimmer-wohnungen|haeuser)-in-.+\.html/i,
      scrapeSel: 'a[href*=".html"]',
      // Anzeigen-eigene Bereiche (Composer-Seiten haben keine → Titel/Meta-Fallback).
      contentSel: '#ad_description_text, [id*="ad_description"], .headline-detailed-view-title, .section_panel_detail, .basic_facts_top_part, .basic_facts_bottom_part',
      // Kontaktformular (live verifiziert, eingeloggt): Nachrichtenfeld #message_input (name="content"),
      // Absenden-Button „Senden". WG-Gesucht füllt Absenderdaten aus dem Konto (keine Namensfelder).
      msgSel: 'textarea#message_input, textarea[name="content"], textarea[name="message"]',
      openText: /nachricht schreiben|kontaktieren|anfrage|nachricht senden/i,
      sendSel: 'button[type="submit"], input[type="submit"]',
      sendText: /nachricht senden|senden|absenden/i,
      // Empfänger steht im Composer-Titel „Nachricht senden an <Name>" (H1 sr-only). WG-Gesucht
      // kürzt den Nachnamen (Privatsphäre, z. B. „Serhat Ciya…", „Ina M.") → informelle
      // Vornamen-Anrede „Hallo <Vorname>," statt einer falschen förmlichen Nachnamen-Anrede.
      recipientTitleSel: 'h1.sr-only',
      recipientTitleRe: /nachricht senden an\s+(.+)$/i,
      informalGreeting: true,
    },
    {
      id: "kleinanzeigen",
      name: "Kleinanzeigen",
      host: /(^|\.)kleinanzeigen\.de$/i,
      experimental: false,
      searchHome: "https://www.kleinanzeigen.de/s-wohnung-mieten/c203",
      buildSearchUrl(f) {
        const s = slug(f.ort); const parts = ["https://www.kleinanzeigen.de/s-wohnung-mieten"];
        const min = n(f.preisMin), max = n(f.preisMax);
        if (min || max) parts.push("preis:" + (min || "") + ":" + (max || ""));
        parts.push(s || ""); return parts.filter(Boolean).join("/") + "/k0c203";
      },
      listingUrlRe: /kleinanzeigen\.de\/s-anzeige\//i,
      resultsUrlRe: /kleinanzeigen\.de\/s-wohnung-mieten/i,
      scrapeSel: 'a[href*="/s-anzeige/"]',
      // Anzeigen-eigene Bereiche – NICHT „Ähnliche Anzeigen"/Nutzer-Anzeigen/Werbung
      // (Quelle des „Terrasse"-Fehlextrakts vor 2.0.2).
      contentSel: '#viewad-title, #viewad-price, #viewad-locality, #viewad-details, #viewad-configuration, #viewad-description-text, #viewad-extras',
      msgSel: 'textarea#viewad-contact-message, textarea[name="message"], textarea#ContactBoxMessageArea',
      openText: /nachricht schreiben|kontakt|nachricht senden/i,
      sendSel: '#viewad-contact-button, button[type="submit"], input[type="submit"]',
      sendText: /nachricht senden|senden|absenden/i,
      // Anbieter-/Verkäufername (für die persönliche Anrede im Anschreiben).
      sellerNameSel: '#viewad-contact .iconlist-text a, .userprofile-vip a, .userprofile-vip .text-body-regular, .userprofile-vip',
      // Bekannte Such-Feld-Hinweise (Fallback greift, falls Kleinanzeigen sie umbenennt).
      searchLocSel: '#site-search-area, input[name="locationStr"]',
      searchSubmitSel: '#site-search-submit',
    },
    {
      id: "immoscout",
      name: "ImmoScout24",
      host: /(^|\.)immobilienscout24\.de$/i,
      experimental: false,
      // buildSearchUrl (Bundesland/Stadt-Pfad + Query) filtert live zuverlässig → NICHT per
      // Formular neu absenden (sonst ginge der URL-Filter verloren), wie bei Immowelt.
      driveSearch: false,
      searchHome: "https://www.immobilienscout24.de/Suche/de/wohnung-mieten",
      buildSearchUrl(f) {
        // Pflicht: /Suche/de/{bundesland}/{stadt}/… – ein reiner Stadt-Slug liefert 404.
        const seg = IS24_GEO[slug(f.ort)];
        const base = seg ? "https://www.immobilienscout24.de/Suche/de/" + seg + "/wohnung-mieten" : this.searchHome;
        if (!seg) return base; // ohne bekanntes Suchgebiet: bundesweite Suche, Nutzer grenzt selbst ein
        const q = []; const preis = dec1(f.preisMax); if (preis) q.push("price=-" + preis);
        const qm = dec1(f.qmMin); if (qm) q.push("livingspace=" + qm + "-");
        const zi = dec1(f.zimmerMin); if (zi) q.push("numberofrooms=" + zi + "-");
        return q.length ? base + "?" + q.join("&") : base;
      },
      listingUrlRe: /immobilienscout24\.de\/expose\/\d+/i,
      resultsUrlRe: /immobilienscout24\.de\/Suche\//i,
      scrapeSel: 'a[href*="/expose/"]',
      // ImmoScout präfixt alle Anzeigen-Datenfelder mit "is24qa-" (Titel, Eckdaten,
      // Beschreibung, Ausstattung) – Empfehlungs-/Werbemodule nicht.
      contentSel: 'h1#expose-title, [class*="is24qa-"]',
      // Kontaktformular (live verifiziert): Textarea #message; Öffner-Button trägt nur den Text
      // „Nachricht" (data-qa="sendButton"); Absenden-Button heißt „Abschicken".
      msgSel: 'textarea#message, textarea[name="message"]',
      // Öffner-Button für das Kontaktformular (stabil, eindeutig – vor dem Text-Fallback).
      openSel: '[data-qa="sendButton"]',
      openText: /nachricht|anbieter kontaktieren|kontaktieren|anfrage senden/i,
      sendSel: 'button[type="submit"], input[type="submit"]',
      sendText: /abschicken|nachricht senden|anfrage senden|senden/i,
      // Anbieter-/Kontaktname für die Anrede: Firmenname zuerst (→ „Sehr geehrte Damen und
      // Herren"), sonst der Kontaktname (Privatperson → namentliche Anrede).
      sellerNameSel: '[data-qa="company-name"], [data-qa="contactName"]',
    },
    {
      id: "immowelt",
      name: "Immowelt / Immonet",
      host: /(^|\.)(immowelt|immonet)\.de$/i,
      experimental: false,
      // Basis-Suche /suche/{stadt}/wohnungen/mieten wird per Redirect auf die (JS-gerenderte)
      // Trefferseite aufgelöst (live verifiziert: Köln, München). KEINE URL-Filter: moderne
      // Immowelt-Filter sind Pfad-Segmente, die bei DIREKTER Navigation „410 Gone" liefern (nur
      // client-seitiges SPA-Routing) → wir öffnen die Stadt-Suche ohne Filter (kein 410-Risiko);
      // der Nutzer verfeinert bei Bedarf mit Immowelts eigenem Filter. `driveSearch:false`.
      driveSearch: false,
      searchHome: "https://www.immowelt.de/suche/wohnungen/mieten",
      buildSearchUrl(f) {
        const s = slug(f.ort);
        return s ? "https://www.immowelt.de/suche/" + s + "/wohnungen/mieten" : this.searchHome;
      },
      listingUrlRe: /(immowelt|immonet)\.de\/expose\//i,
      resultsUrlRe: /(immowelt|immonet)\.de\/(liste|suche)\//i,
      scrapeSel: 'a[href*="/expose/"]',
      // Aviv-CDP-Testids der anzeigen-eigenen Sektionen (Beschreibung, Ausstattung,
      // Eckdaten, Preis) + H1-Titel; „Ähnliche Angebote"-Karussells bleiben außen vor.
      contentSel: 'h1, [data-testid*="Description"], [data-testid*="description"], [data-testid*="Features"], [data-testid*="feature"], [data-testid*="HardFacts"], [data-testid*="hardfacts"], [data-testid*="Price"], [data-testid*="price"]',
      // Kontaktformular (live verifiziert): Textarea name="message" ist direkt sichtbar (kein
      // Öffner nötig); Absenden-Button „Nachricht senden" (data-testid cdp-contact-form-submit.email);
      // Felder firstName/lastName/email/Telefon greift fillProfileFields React-sicher.
      msgSel: 'textarea[name="message"], textarea#message',
      openText: /nachricht schreiben|kontaktieren|nachricht senden/i,
      sendSel: '[data-testid="cdp-contact-form-submit.email"], button[type="submit"], input[type="submit"]',
      sendText: /nachricht senden|anfrage senden|senden/i,
      // Anbieter: Ansprechpartner (Person, oft „Herr/Frau <Name>") zuerst → namentliche Anrede,
      // sonst Firma (IntermediaryCard) → „Sehr geehrte Damen und Herren,".
      sellerNameSel: '[data-testid="aviv.CDP.Contacting.ProviderSection.ContactCard.Title"], [data-testid="aviv.CDP.Contacting.ProviderSection.IntermediaryCard.Title.Link"]',
    },
  ];

  /** @param {string} id @returns {PortalAdapter|null} */
  function byId(id) { return PORTALS.find((p) => p.id === id) || null; }
  /** Adapter zur URL finden (Hostname-Match). @param {string} url @returns {PortalAdapter|null} */
  function forUrl(url) {
    let host = ""; try { host = new URL(url).hostname; } catch (e) { return null; }
    return PORTALS.find((p) => p.host.test(host)) || null;
  }

  /* ===================== DOM-Helfer (nur im Content-Script) ===================== */
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = el.ownerDocument.defaultView.getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }
  function textOf(el) { return (el.innerText || el.value || el.getAttribute("aria-label") || el.title || "").trim(); }

  // Wert React-sicher setzen: React überwacht sein eigenes value-Property und würde einen
  // direkt gesetzten .value bei einem Re-Render verwerfen. Über den NATIVEN Setter des
  // Prototyps umgehen wir Reacts Descriptor, danach 'input'/'change' feuern, damit Reacts
  // onChange den neuen Wert übernimmt. Fällt auf direktes Zuweisen zurück, falls nötig.
  function setNativeValue(el, val) {
    try {
      const proto = (el.tagName === "TEXTAREA") ? window.HTMLTextAreaElement.prototype
        : (el.tagName === "SELECT") ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, val); else el.value = val;
    } catch (e) { el.value = val; }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const dom = {
    listingId(portal, url) {
      // Query/Hash abschneiden (Tracking-Parameter würden die ID instabil machen).
      const s = String(url).split(/[?#]/)[0];
      // Expose-Pfad bevorzugen: deckt ImmoScout (numerisch, ergibt dieselbe ID wie
      // zuvor) und Immowelt/Immonet (ALPHANUMERISCHE IDs, die der Ziffern-Fallback
      // nicht traf → früher instabiler URL-Rest als ID, Dedupe versagte).
      let m = s.match(/\/expose\/([A-Za-z0-9-]+)/i);
      if (!m) m = s.match(/(\d{5,})/); // WG-Gesucht/Kleinanzeigen: erste lange Zahlengruppe
      return (portal ? portal.id + ":" : "") + (m ? m[1] : s.slice(-40));
    },
    isListing(portal, url, doc) {
      if (portal && portal.listingUrlRe && portal.listingUrlRe.test(url)) return true;
      // Fallback nur bei EINDEUTIGEM Kontaktformular: ein sichtbares, als "Nachricht"
      // benanntes Feld UND ein Senden-Button. Verhindert Overlay auf Start-/Suchseiten.
      const box = this.findMessageBox(portal, doc, { strict: true });
      return !!(box && this.findSendButton(portal, doc));
    },
    isResults(portal, url, doc) {
      if (this.isListing(portal, url, doc)) return false; // Anzeige hat Vorrang
      if (portal && portal.resultsUrlRe && portal.resultsUrlRe.test(url)) return true;
      return this.scrapeResults(portal, doc).length >= 5;
    },
    scrapeResults(portal, doc) {
      const sel = (portal && portal.scrapeSel) || "a[href]";
      const seen = new Set(); const out = [];
      doc.querySelectorAll(sel).forEach((a) => {
        let href = a.href; if (!href) return;
        if (portal && portal.listingUrlRe && !portal.listingUrlRe.test(href)) return;
        href = href.split("#")[0];
        if (seen.has(href)) return; seen.add(href);
        const title = (a.getAttribute("title") || a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120);
        out.push({ id: this.listingId(portal, href), url: href, title });
      });
      return out;
    },
    // Klickt einen „Kontakt/Nachricht"-Öffner, falls noch kein Nachrichtenfeld sichtbar ist.
    revealContactForm(portal, doc) {
      if (this.findMessageBox(portal, doc)) return true;
      // Bevorzugt ein präziser per-Portal-Selektor (z. B. ImmoScout [data-qa="sendButton"]),
      // damit bei eingeloggten Nutzern nicht versehentlich ein gleichnamiger Kopf-/Postfach-
      // Link („Nachrichten") statt des Kontakt-Öffners geklickt wird.
      if (portal && portal.openSel) {
        const btn = [...doc.querySelectorAll(portal.openSel)].find(isVisible);
        if (btn) { try { btn.click(); return "clicked"; } catch (e) {} }
      }
      const re = (portal && portal.openText) || /nachricht|kontakt|anfrage|anbieter kontaktieren/i;
      const cand = [...doc.querySelectorAll('button, a, [role="button"], input[type="button"]')]
        .filter((b) => isVisible(b) && re.test(textOf(b)));
      if (cand.length) { try { cand[0].click(); return "clicked"; } catch (e) {} }
      return false;
    },
    // opts: { quiet } sichtbar egal, { strict } nur eindeutig benannte Felder (kein „größte Textarea"-Fallback).
    findMessageBox(portal, doc, opts) {
      opts = (typeof opts === "object" && opts) || (opts ? { quiet: true } : {});
      const okVis = (t) => opts.quiet || isVisible(t);
      // 1) Portal-Hinweis
      if (portal && portal.msgSel) {
        const el = [...doc.querySelectorAll(portal.msgSel)].find(okVis);
        if (el) return el;
      }
      // 2) Textarea mit eindeutigem Namen/Placeholder/Label
      const named = [...doc.querySelectorAll("textarea")].filter((t) => {
        const s = (t.name + " " + t.id + " " + (t.placeholder || "") + " " + (t.getAttribute("aria-label") || "")).toLowerCase();
        return /nachricht|message|anschreiben|mitteilung|anfrage|kontakt/.test(s);
      }).find(okVis);
      if (named) return named;
      // 3) Größte sichtbare Textarea – nur wenn nicht strict
      if (opts.strict) return null;
      const areas = [...doc.querySelectorAll("textarea")].filter(okVis);
      areas.sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight));
      return areas[0] || null;
    },
    findForm(portal, doc) {
      const box = this.findMessageBox(portal, doc);
      return box ? box.closest("form") : null;
    },
    /**
     * Liest ALLE Anbieter-/Verkäufernamen-Kandidaten aus der Kontakt-/Profilbox
     * (ein Kandidat je Selektor-Gruppe von sellerNameSel, bereinigt, dedupliziert).
     * Die Anrede-Auswahl übernimmt WBA.salutation.pickBest – so gewinnt der
     * vollständigste Name statt der zufällig ersten Quelle.
     * @param {PortalAdapter} portal @param {Document} doc @returns {string[]}
     */
    sellerNames(portal, doc) {
      const sel = portal && portal.sellerNameSel;
      if (!sel) return [];
      const NOISE = /^(nutzer|aktiv|anzeigen|folgen|folge|anrufen|gewerblich|gewerblicher|gewerbliche|privat|privater|online|mitglied|seit|profil|bewertung|bewertungen|melden|nachricht|kontakt|identität|identitaet|verifiziert|zufriedenheit|freundlich|premium|plus|impressum)$/i;
      const nameFrom = (el) => {
        const raw = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!raw) return null;
        const src = raw.split(" ").filter(Boolean);
        // Führende Avatar-Initialen wie "WK" verwerfen.
        while (src.length && /^[A-ZÄÖÜ]{1,3}$/.test(src[0]) && src[0] === src[0].toUpperCase()) src.shift();
        // Namenswörter bis zum ersten Stör-/Zahlwort sammeln (max. 6).
        const words = [];
        for (const w of src) {
          const clean = w.replace(/[.,;:]+$/, "");
          if (!clean || /\d/.test(clean) || NOISE.test(clean)) break;
          if (!/^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]*$/.test(clean)) break;
          words.push(clean);
          if (words.length >= 6) break;
        }
        return words.length ? words.join(" ") : null;
      };
      const out = [];
      for (const group of sel.split(",").map((s) => s.trim()).filter(Boolean)) {
        for (const el of doc.querySelectorAll(group)) {
          const name = nameFrom(el);
          if (name) { if (out.indexOf(name) < 0) out.push(name); break; } // erster Treffer je Gruppe
        }
      }
      return out;
    },
    /** Erster Anbietername (Kompatibilität) – bevorzugt sellerNames() + pickBest nutzen. */
    sellerName(portal, doc) { return this.sellerNames(portal, doc)[0] || null; },
    // Empfängername aus einem Titel-Element ziehen (z. B. WG-Gesucht-Composer
    // „Nachricht senden an <Name>"). Nur aktiv, wenn das Portal recipientTitleSel/Re setzt.
    recipientName(portal, doc) {
      if (!portal || !portal.recipientTitleSel || !portal.recipientTitleRe) return null;
      const el = doc.querySelector(portal.recipientTitleSel);
      if (!el) return null;
      const m = (el.textContent || "").replace(/\s+/g, " ").trim().match(portal.recipientTitleRe);
      return m && m[1] ? m[1].trim() : null;
    },
    findSendButton(portal, doc) {
      const form = this.findForm(portal, doc);
      const scope = form || doc;
      const re = (portal && portal.sendText) || /senden|absenden|anfrage|nachricht senden/i;
      // Bevorzugt Buttons mit passendem Text
      const byText = [...scope.querySelectorAll('button, input[type="submit"], [role="button"]')]
        .filter((b) => isVisible(b) && re.test(textOf(b)));
      if (byText.length) return byText[0];
      // sonst Submit im Formular
      const sub = scope.querySelector((portal && portal.sendSel) || 'button[type="submit"], input[type="submit"]');
      return (sub && isVisible(sub)) ? sub : null;
    },
    // Füllt Name/E-Mail/Telefon im Kontaktformular (nur innerhalb der Form, nichts überschreiben, was schon steht).
    // Füllt Kontaktdaten (Name/Adresse/E-Mail/Telefon) im Kontaktformular.
    // Erkennt Felder über name/id/placeholder UND sichtbaren Label-Text (wichtig, weil
    // viele Portale generische Feldnamen, aber klare Labels haben).
    fillProfileFields(portal, doc, p) {
      const form = this.findForm(portal, doc);
      const scope = form || doc;
      const msgBox = this.findMessageBox(portal, doc);
      const setVal = (el, val) => {
        if (!el || !val || el.value) return false;
        el.focus();
        setNativeValue(el, val);
        el.dispatchEvent(new Event("blur", { bubbles: true }));
        return true;
      };
      // Reine Text-Labels ohne for/id-Verknüpfung (sehr verbreitet bei dynamisch gebauten
      // Formularen): läuft die Elternkette hoch und nimmt den Text des nächsten Wrappers,
      // solange der nicht mehrere Formularfelder enthält (sonst würde man das Label eines
      // Nachbarfelds erwischen, z. B. bei PLZ+Ort in derselben Zeile).
      const nearbyLabelText = (el) => {
        let node = el;
        for (let hops = 0; hops < 5 && node && node.parentElement; hops++) {
          node = node.parentElement;
          // Bis zu 2 Felder im selben Wrapper tolerieren (z. B. eine PLZ+Ort-Zeile mit
          // gemeinsamem Label) – bei 3+ Feldern ist der Wrapper zu groß/unspezifisch.
          if (node.querySelectorAll("input, select, textarea").length > 2) break;
          const txt = (node.innerText || "").trim();
          if (txt && txt.length > 0 && txt.length < 60) return txt;
        }
        return "";
      };
      const labelText = (el) => {
        let t = "";
        try { if (el.id) { const l = doc.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]'); if (l) t += " " + (l.innerText || ""); } } catch (e) {}
        const w = el.closest && el.closest("label"); if (w) t += " " + (w.innerText || "");
        t += " " + nearbyLabelText(el);
        return t;
      };
      const candidates = [...scope.querySelectorAll('input, textarea, select')].filter((e) => {
        if (e === msgBox) return false;
        const ty = (e.type || "").toLowerCase();
        return !["hidden", "submit", "button", "checkbox", "radio", "file", "password", "search"].includes(ty);
      });
      const find = (re, veto) => candidates.find((e) => {
        const s = (e.name + " " + e.id + " " + (e.placeholder || "") + " " + (e.getAttribute("aria-label") || "") + " " + labelText(e)).toLowerCase();
        if (veto && veto.test(s)) return false;
        return re.test(s);
      });

      // Name ggf. in Vor-/Nachname aufteilen
      const nameParts = (p.name || "").trim().split(/\s+/).filter(Boolean);
      const vorname = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : (nameParts[0] || "");
      const nachname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
      const vorEl = find(/vorname|first[\s_-]?name|given/);
      const nachEl = find(/nachname|familienname|last[\s_-]?name|surname/);
      // Veto gegen die Portal-Kopfzeilen-Suche (z. B. Kleinanzeigen: #site-search-area,
      // name="locationStr", aria-label "PLZ oder Ort"). Sonst würden PLZ/Ort dieses Feld
      // greifen, falls der Scope mangels <form> auf das ganze Dokument zurückfällt.
      const SEARCH = /such|keyword|site-search|locationstr|umkreis|radius|autocomplete/;
      if (vorEl || nachEl) {
        setVal(vorEl, nameParts.length > 1 ? vorname : (p.name || ""));
        setVal(nachEl, nachname);
      } else if (p.name) {
        setVal(find(/\bname\b|ihr name|dein name|vollst/, /user|nutzer|benutzer|stra|ort|stadt|firma|such|keyword/), p.name);
      }
      if (p.email) setVal(find(/e-?mail/, SEARCH), p.email);
      if (p.phone) setVal(find(/telefon|phone|mobil|handy|rufnummer|tel\b/, SEARCH), p.phone);
      // „address"/„adresse" schließt E-Mail-Felder mit ein („emailAddress", Label „E-Mail-Adresse")
      // → E-Mail per Veto ausschließen, sonst greift Straße fälschlich das schon gefüllte Mail-Feld.
      if (p.street) setVal(find(/stra[ßs]e|hausnummer|street|anschrift|adresse|address/, new RegExp(SEARCH.source + "|e-?mail")), p.street);
      if (p.plz) setVal(find(/plz|postleitzahl|postcode|\bzip\b|postal/, SEARCH), p.plz);
      if (p.city) setVal(find(/\bort\b|\bstadt\b|\bcity\b|wohnort/, new RegExp(SEARCH.source + "|suchort")), p.city);
    },
    setMessage(box, text) {
      if (!box) return false;
      box.focus();
      setNativeValue(box, text);
      return true;
    },
    // Füllt die ECHTE Suchmaske des Portals mit den Filtern und sendet ab.
    // Handelt nur, wenn ein Ortsfeld gefunden wird → sonst false (normaler Ablauf greift).
    // Gibt true zurück, wenn abgesendet wurde (Seite navigiert dann).
    async driveSearchForm(portal, doc, filters) {
      filters = filters || {};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const nn = (v) => { const x = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(x) ? x : null; };
      const setVal = (el, val) => {
        if (!el || val == null || val === "") return false;
        el.focus(); setNativeValue(el, val);
        return true;
      };
      const fieldMatch = (el, labelRe, boundRe) => {
        const s = (el.name + " " + el.id + " " + (el.placeholder || "") + " " + (el.getAttribute("aria-label") || "")).toLowerCase();
        return labelRe.test(s) && (!boundRe || boundRe.test(s));
      };
      // 1) Ortsfeld
      const inputs = [...doc.querySelectorAll('input[type="search"], input[type="text"], input:not([type])')].filter(isVisible);
      const ortEl = (portal && portal.searchLocSel && doc.querySelector(portal.searchLocSel))
        || inputs.find((e) => fieldMatch(e, /ort|plz|stadt|standort|location|suchort|city|umkreis|postleitzahl|adresse/));
      if (!ortEl || !filters.ort) return false; // ohne echtes Ortsfeld nichts anfassen
      setVal(ortEl, filters.ort);

      // 2) optionale Filter (nur wenn Felder existieren)
      const numInputs = [...doc.querySelectorAll("input")].filter(isVisible);
      const pick = (labelRe, boundRe) => numInputs.find((e) => fieldMatch(e, labelRe, boundRe));
      if (nn(filters.preisMax)) setVal(pick(/preis|price|miete|rent/, /max|bis|to|end|obere/), nn(filters.preisMax));
      if (nn(filters.qmMin)) setVal(pick(/wohnfl|fl[äa]che|gr[öo][ßs]e|size|qm|m²/, /min|ab|von|from|start|untere/), nn(filters.qmMin));
      if (nn(filters.zimmerMin)) setVal(pick(/zimmer|room/, /min|ab|von|from|start|untere/), nn(filters.zimmerMin));

      // 3) Autocomplete abwarten + ersten Vorschlag wählen (für korrekten Orts-Code)
      await wait(600);
      const sugg = doc.querySelector((portal && portal.searchSuggestSel) || '[role="option"], .autocomplete-suggestion, [data-suggestion], ul[role="listbox"] li, .suggestions li');
      if (sugg && isVisible(sugg)) { try { sugg.click(); } catch (e) {} await wait(400); }

      // 4) Absenden
      const submit = (portal && portal.searchSubmitSel && doc.querySelector(portal.searchSubmitSel))
        || [...doc.querySelectorAll('button, input[type="submit"]')].find((b) => isVisible(b) && /suchen|finden|anzeigen|ergebnisse|\blos\b|search|filter anwenden/i.test(textOf(b)));
      if (submit) { try { submit.click(); } catch (e) {} return true; }
      if (ortEl.form) { try { ortEl.form.requestSubmit ? ortEl.form.requestSubmit() : ortEl.form.submit(); return true; } catch (e) {} }
      // Fallback: Enter im Ortsfeld
      try {
        ortEl.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
        ortEl.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13 }));
        return true;
      } catch (e) {}
      return false;
    },
  };

  WBA.portals = { PORTALS, byId, forUrl, slug, dom };
})(typeof self !== "undefined" ? self : this);
