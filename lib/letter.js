/* WBA.letter – kompositorischer Anschreiben-Generator (seit 1.9.0).
   Bausteine: Anrede → Einstieg → Bezug zur Wohnung → Selbstvorstellung →
   Vertrauenssignale (+ Unterlagen) → Zusatz → Abschluss/CTA → Grußformel.

   Grundsätze:
   - EHRLICH: keine erfundenen Fakten. Beruf/Einkommen/Haustiere/Unterlagen nur,
     wenn im Profil bzw. in der Unterlagen-Checkliste vorhanden. Details der
     Wohnung nur, wenn sie wirklich extrahiert wurden.
   - NATÜRLICH: aktive Verben, keine Schachtelsätze > 25 Wörter, Blacklist
     gegen Bot-Floskeln wird HART geprüft.
   - VARIANT: pro Baustein und Tonlage 8+ echt unterschiedliche Formulierungen;
     Constraints: keine zwei Bausteine mit gleicher Satzstruktur hintereinander,
     gemischte Satzlängen, max. EIN Ausrufezeichen pro Text.
   - ANTI-WIEDERHOLUNG: generate() prüft Trigramm-Überlappung (< 40 %) gegen die
     letzten 20 Texte (Fingerprints in chrome.storage via WBA.store).

   API: buildLetter(p, flat, mode, info, opts)  – synchron, ein Kandidat
        generate(p, flat, mode, info, opts)     – async, mit Anti-Wiederholung
        greeting(mode, flat), containsBlacklisted(text), trigrams(t), overlapRatio(a,b)
   Braucht WBA.parse (formatSize) und optional WBA.salutation/WBA.store. */
(function (root) {
  "use strict";
  const WBA = (root.WBA = root.WBA || {});
  const parse = WBA.parse;

  /* ================= Helfer ================= */
  function cap(t) { t = (t || "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  function words(t) { return String(t || "").trim().split(/\s+/).filter(Boolean); }
  function wc(t) { return words(t).length; }

  // Ziel-Längen je Tonlage (Wörter, gesamter Text)
  const RANGE = {
    kurz: [60, 90], standard: [100, 150], formal: [120, 180],
    herzlich: [100, 150], selbstbewusst: [100, 150],
  };

  /* ================= Anti-Bot-Blacklist (hart) ================= */
  // Normalisiert (klein, ohne Satzzeichen) – Prüfung läuft über dieselbe Normalisierung.
  const BLACKLIST = [
    "hiermit bewerbe ich mich",
    "bewerbe ich mich hiermit",
    "mein interesse geweckt",
    "von ihnen zu hören",
    "von ihnen zu hoeren",
    "entspricht genau meinen vorstellungen",
    "entspricht voll und ganz meinen vorstellungen",
    "genau meinen vorstellungen",
    "wie für mich gemacht",
    "ich bin sehr interessiert an ihrer wohnung",
    "über eine positive rückmeldung",
    "würde mich über eine rückmeldung freuen",
    "passt genau zu meiner suche",
    "genau das wonach ich suche",
  ];
  function normText(t) {
    return String(t || "").toLowerCase().replace(/[^a-zäöüß ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  const BLACKLIST_N = BLACKLIST.map(normText);
  /**
   * Prüft einen Text (auch KI-Ausgaben) gegen die Floskel-Blacklist.
   * @param {string} text - Zu prüfender Text.
   * @param {string} [excludeUserText] - Nutzertext (z. B. Profil-Beschreibung),
   *   der von der Prüfung ausgenommen wird – wir zensieren keine Nutzereingaben.
   * @returns {string|null} Gefundene Floskel oder null.
   */
  function containsBlacklisted(text, excludeUserText) {
    let t = " " + normText(text) + " ";
    if (excludeUserText) t = t.replace(normText(excludeUserText), " ");
    return BLACKLIST_N.find((ph) => t.indexOf(" " + ph + " ") >= 0 || t.indexOf(ph) >= 0) || null;
  }

  /* ================= Trigramm-Fingerprints (Anti-Wiederholung) ================= */
  function hash32(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h;
  }
  function trigrams(text) {
    const w = normText(text).split(" ").filter(Boolean);
    const out = new Set();
    for (let i = 0; i + 2 < w.length; i++) out.add(hash32(w[i] + " " + w[i + 1] + " " + w[i + 2]));
    return out;
  }
  // Anteil der Trigramme des NEUEN Textes, die auch im alten vorkommen (0..1).
  function overlapRatio(newSet, oldArr) {
    if (!newSet.size) return 0;
    const old = oldArr instanceof Set ? oldArr : new Set(oldArr);
    let hit = 0;
    newSet.forEach((h) => { if (old.has(h)) hit++; });
    return hit / newSet.size;
  }

  /* ================= Varianten-Auswahl mit Constraints ================= */
  // v(strukturTag, längenKlasse, textFn, need?) – need filtert nach verfügbaren Daten.
  function v(s, l, f, need) { return { s, l, f, need: need || null }; }
  const lastPick = {}; // je Baustein+Ton: zuletzt gewählter Index → nächstes Mal anders
  function pick(pool, salt, avoidTag) {
    if (!pool.length) return null;
    const all = pool.map((_, i) => i);
    let cands = all.filter((i) => i !== lastPick[salt]);
    if (!cands.length) cands = all;
    const tagged = cands.filter((i) => pool[i].s !== avoidTag);
    const from = tagged.length ? tagged : cands;
    const idx = from[Math.floor(Math.random() * from.length)];
    lastPick[salt] = idx;
    return pool[idx];
  }

  /* ================= Kontext ================= */
  /**
   * Wohnungs-Bezeichnung – die Detailtiefe wird pro Text zufällig gewählt
   * (voll / ohne Größe / nur Ort / nur Zimmer), damit nicht jede Bewerbung
   * denselben langen Wortlaut wiederholt. Es fließen nur extrahierte Daten ein.
   * @param {Object} info @returns {string}
   */
  function flatDescriptor(info) {
    const zi = info.zimmer ? info.zimmer + "-Zimmer-Wohnung" : "Wohnung";
    const size = info.groesse && parse ? parse.formatSize(info.groesse) : null;
    const forms = [zi + (info.ort ? " in " + info.ort : "") + (size ? " mit " + size + " m²" : "")];
    if (info.ort) forms.push(zi + " in " + info.ort);
    if (info.ort && info.zimmer) forms.push("Wohnung in " + info.ort);
    if (info.zimmer && (info.ort || size)) forms.push(zi);
    return forms[Math.floor(Math.random() * forms.length)];
  }
  function makeCtx(p, flat, mode, info, opts) {
    p = p || {}; info = info || {};
    // 1–2 echte Details, in wechselnder Auswahl/Reihenfolge (gegen Wiederholung).
    let det = (info.features || []).slice(0, 2);
    if (det.length > 1) {
      if (Math.random() < 0.5) det = [det[1], det[0]];
      if (Math.random() < 0.35) det = [det[0]];
    }
    return {
      p, mode, info, flat: flat || {},
      wo: (info.zimmer || info.groesse || info.ort) ? flatDescriptor(info) : "Wohnung",
      det, detS: det.join(" und "), plu: det.length > 1,
      frei: info.frei || "",
      docs: (opts && opts.docs) || null,
    };
  }
  // Verb-Kongruenz für Detail-Aufzählungen („der Balkon ist" / „… und … sind")
  function pl(c, plural, singular) { return c.plu ? plural : singular; }

  /* ================= Baustein-Pools =================
     Alle Einstiegs-Varianten beginnen klein (Fortsetzung nach der Anrede-Zeile);
     „Ihre/Ihr/Sie" bleiben als Höflichkeitsform groß. */

  const EINSTIEG = {
    standard: [
      v("ich", 2, (c) => `ich bin auf Ihre ${c.wo} gestoßen und melde mich direkt bei Ihnen.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} klingt für mich nach einem Zuhause, nicht nur nach einer Wohnung.`),
      v("adv", 2, () => `beim Lesen Ihrer Anzeige war mir schnell klar: Hier möchte ich mich melden.`),
      v("ich", 1, (c) => `ich interessiere mich sehr für Ihre ${c.wo}.`),
      v("adv", 3, (c) => `nach etlichen Anzeigen, die nicht gepasst haben, ist Ihre ${c.wo} die erste, bei der ich sofort schreiben wollte.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} ist mir beim Durchsehen der neuen Anzeigen sofort aufgefallen.`),
      v("ich", 2, (c) => `ich habe Ihre ${c.wo} gerade entdeckt und wollte nicht lange warten, sondern mich gleich vorstellen.`),
      v("adv", 1, (c) => `kurz und ehrlich: Ihre ${c.wo} hat mich direkt überzeugt.`),
      v("ich", 1, (c) => `ich schreibe Ihnen direkt wegen Ihrer ${c.wo}.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} ist genau die Art Wohnung, nach der ich seit Wochen Ausschau halte.`),
      v("adv", 2, () => `beim Durchsehen der neuen Angebote bin ich bei Ihrem hängengeblieben.`),
      v("ich", 2, (c) => `ich wollte bei Ihrer ${c.wo} nicht lange zögern und melde mich gleich.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} trifft ziemlich genau meinen Geschmack.`),
      v("adv", 2, (c) => `ehrlich gesagt hat mich Ihre ${c.wo} auf Anhieb angesprochen.`),
      v("ich", 2, (c) => `ich habe lange gesucht und bei Ihrer ${c.wo} sofort ein gutes Gefühl gehabt.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} ist der Grund, warum ich die Suche für heute nicht beende, sondern schreibe.`),
      v("ich", 2, (c) => `ich suche seit einiger Zeit – bei Ihrer ${c.wo} habe ich zum ersten Mal seit Langem sofort geschrieben.`),
      v("adv", 2, (c) => `zwischen vielen austauschbaren Angeboten ist mir Ihre ${c.wo} sofort aufgefallen.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} passt zu dem, was ich suche – deshalb melde ich mich.`),
      v("ich", 2, (c) => `ich mache es kurz: Ihre ${c.wo} gefällt mir, und ich würde sie mir gerne ansehen.`),
      v("adv", 2, () => `ich weiß, wie viele Nachrichten Sie gerade bekommen – deshalb komme ich gleich zur Sache.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} klingt nach genau dem Ort, an dem ich die nächsten Jahre verbringen möchte.`),
      v("ich", 1, (c) => `ich würde gerne in Ihre ${c.wo} einziehen.`),
    ],
    formal: [
      v("ich", 2, (c) => `ich habe Ihre Anzeige für die ${c.wo} aufmerksam gelesen und möchte mich Ihnen gerne vorstellen.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} spricht mich sehr an, daher erlaube ich mir, mich bei Ihnen vorzustellen.`),
      v("adv", 2, (c) => `auf der Suche nach einem neuen Zuhause bin ich auf Ihre ${c.wo} aufmerksam geworden.`),
      v("ich", 2, (c) => `ich möchte mich um Ihre ${c.wo} bewerben und stelle mich Ihnen nachfolgend kurz vor.`),
      v("adv", 3, (c) => `nachdem ich Ihre Anzeige mehrfach gelesen habe, bin ich überzeugt, dass Ihre ${c.wo} sehr gut zu meiner Lebenssituation passt.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} hat mich überzeugt.`),
      v("ich", 2, (c) => `ich bin auf Ihr Angebot gestoßen und möchte Ihnen gerne darlegen, warum ich als Mietinteressent gut passe.`),
      v("adv", 2, (c) => `im Rahmen meiner Wohnungssuche ist mir Ihre ${c.wo} besonders positiv aufgefallen.`),
      v("ich", 2, (c) => `ich bewerbe mich um Ihre ${c.wo} und stelle mich Ihnen kurz vor.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} passt aus meiner Sicht sehr gut zu meiner derzeitigen Lebenssituation.`),
      v("adv", 2, (c) => `mit großem Interesse habe ich Ihre Anzeige für die ${c.wo} gelesen.`),
      v("ich", 2, (c) => `ich möchte mein Interesse an Ihrer ${c.wo} bekunden und mich Ihnen kurz vorstellen.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} spricht mich in mehrfacher Hinsicht an.`),
      v("adv", 2, (c) => `im Zuge meiner Wohnungssuche bin ich auf Ihre ${c.wo} aufmerksam geworden.`),
      v("ich", 2, () => `ich erlaube mir, Ihnen mein Interesse an Ihrem Angebot mitzuteilen.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} entspricht in mehreren Punkten genau dem, was ich seit Längerem suche.`),
      v("ich", 2, (c) => `ich beziehe mich auf Ihre ${c.wo} und möchte mich Ihnen als Mietinteressent vorstellen.`),
      v("adv", 2, (c) => `mit Interesse habe ich Ihre ${c.wo} gelesen und möchte mich um sie bewerben.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} hat meine volle Aufmerksamkeit.`),
      v("ich", 2, (c) => `ich melde mich zu Ihrer ${c.wo} und stelle mich Ihnen kurz vor.`),
      v("adv", 2, () => `gestatten Sie mir, mich als Mietinteressent kurz vorzustellen.`),
    ],
    kurz: [
      v("ich", 1, (c) => `ich interessiere mich für Ihre ${c.wo}.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} gefällt mir richtig gut.`),
      v("adv", 1, (c) => `kurz gesagt: Ihre ${c.wo} passt für mich.`),
      v("ich", 1, (c) => `ich melde mich wegen Ihrer ${c.wo}.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} ist genau mein Fall.`),
      v("adv", 1, (c) => `gleich vorweg: Ihre ${c.wo} hat mich überzeugt.`),
      v("ich", 1, (c) => `ich habe Ihre ${c.wo} gesehen und möchte sie haben.`),
      v("nominal", 1, (c) => `Ihre Anzeige kam für mich zur richtigen Zeit.`),
      v("ich", 1, (c) => `ich schreibe wegen Ihrer ${c.wo}.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} spricht mich sofort an.`),
      v("adv", 1, (c) => `direkt gesagt: Ihre ${c.wo} passt.`),
      v("ich", 1, (c) => `ich hätte großes Interesse an Ihrer ${c.wo}.`),
      v("nominal", 1, (c) => `Ihre ${c.wo}? Sehr gerne.`),
      v("adv", 1, (c) => `sofort klar: Ihre ${c.wo} will ich sehen.`),
      v("ich", 1, (c) => `ich möchte mich um Ihre ${c.wo} bewerben.`),
      v("ich", 1, (c) => `ich würde gerne in Ihre ${c.wo} einziehen.`),
      v("nominal", 1, (c) => `Ihre ${c.wo}: genau das, was ich suche.`),
      v("adv", 1, () => `kurz und direkt: Die Wohnung passt zu mir.`),
      v("ich", 1, (c) => `ich melde mich zu Ihrer ${c.wo}.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} hat mich sofort überzeugt.`),
      v("adv", 1, () => `keine langen Worte: Ich hätte diese Wohnung gerne.`),
    ],
    herzlich: [
      v("ich", 2, (c) => `ich habe mich richtig gefreut, als ich Ihre ${c.wo} entdeckt habe.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} hat bei mir sofort ein Bild ausgelöst: abends ankommen und einfach zuhause sein.`),
      v("adv", 2, () => `beim Lesen Ihrer Anzeige hatte ich gleich ein warmes, gutes Gefühl.`),
      v("ich", 1, (c) => `ich habe mich in Ihre ${c.wo} ein bisschen verguckt.`),
      v("adv", 3, () => `man merkt Ihrer Anzeige an, dass die Wohnung gepflegt und geschätzt wird – genau so ein Zuhause wünsche ich mir.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} fühlt sich schon beim Lesen nach Zuhause an.`),
      v("ich", 2, (c) => `ich schreibe Ihnen voller Vorfreude – Ihre ${c.wo} hat meinen Tag verschönert.`),
      v("adv", 1, () => `selten hat mich eine Anzeige so angesprochen wie Ihre.`),
      v("ich", 2, (c) => `ich habe Ihre ${c.wo} entdeckt und sofort gedacht: Da will ich hin.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} strahlt schon in der Anzeige eine schöne Wärme aus.`),
      v("adv", 2, () => `Ihre Anzeige habe ich gleich zweimal gelesen, so gut hat sie mir gefallen.`),
      v("ich", 2, (c) => `ich gebe es offen zu: Ihre ${c.wo} hat mein Herz sofort erwärmt.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} fühlt sich einfach einladend an.`),
      v("adv", 2, () => `beim Lesen konnte ich mir sofort vorstellen, dort anzukommen.`),
      v("ich", 2, (c) => `ich freue mich, dass ich Ihre ${c.wo} gefunden habe, und melde mich gleich.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} hat mich beim Lesen sofort in eine gute Stimmung versetzt.`),
      v("ich", 2, (c) => `ich habe Ihre ${c.wo} gesehen und dachte nur: Das könnte es sein.`),
      v("adv", 2, () => `manche Anzeigen liest man und weiß gleich, dass man schreiben möchte – Ihre gehört dazu.`),
      v("ich", 2, (c) => `ich hoffe sehr, dass Ihre ${c.wo} noch frei ist – sie gefällt mir wirklich gut.`),
      v("nominal", 2, (c) => `Bei Ihrer ${c.wo} habe ich zum ersten Mal das Gefühl: Da könnte ich ankommen.`),
      v("adv", 2, () => `ich schreibe Ihnen mit ehrlicher Freude über Ihre Anzeige.`),
    ],
    selbstbewusst: [
      v("ich", 2, (c) => `ich glaube, Ihre ${c.wo} und ich – das passt. Gerne überzeuge ich Sie davon.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} sucht zuverlässige Mieter – genau das bringe ich mit.`),
      v("adv", 2, (c) => `ohne Umschweife: Ihre ${c.wo} passt zu mir, und ich passe zu ihr.`),
      v("ich", 2, (c) => `ich mache es kurz: Ihre ${c.wo} überzeugt mich, und ich möchte sie mir gerne ansehen.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} verdient Mieter, auf die Verlass ist – deshalb melde ich mich.`),
      v("adv", 2, (c) => `wer lange sucht, erkennt das Passende sofort – bei Ihrer ${c.wo} war das bei mir der Fall.`),
      v("ich", 2, (c) => `ich weiß, was ich an einer guten Wohnung habe – und Ihre ${c.wo} gehört eindeutig dazu.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} ist für mich die interessanteste Anzeige der Woche.`),
      v("ich", 2, (c) => `ich komme direkt zum Punkt: Ihre ${c.wo} und ich passen zusammen.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} braucht zuverlässige Mieter – hier bin ich.`),
      v("adv", 2, (c) => `kein langes Vorgeplänkel: Ihre ${c.wo} hat mich überzeugt.`),
      v("ich", 2, (c) => `ich weiß genau, was ich suche – und Ihre ${c.wo} ist es.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} ist für mich die klare Nummer eins.`),
      v("adv", 2, (c) => `ganz ehrlich: Ihre ${c.wo} ist genau mein Ziel.`),
      v("ich", 2, (c) => `ich melde mich, weil Ihre ${c.wo} zu 100 % zu meinen Plänen passt.`),
      v("nominal", 2, (c) => `Ihre ${c.wo} ist gut – deshalb schreibe ich, bevor es hundert andere tun.`),
      v("ich", 2, (c) => `ich halte mich kurz: Ihre ${c.wo} passt, und ich bin ein Mieter, der Ihnen keine Arbeit macht.`),
      v("adv", 2, () => `Sie bekommen viele Nachrichten – hier ist eine, die alles Wichtige gleich beantwortet.`),
      v("nominal", 1, (c) => `Ihre ${c.wo} und ich – das passt.`),
      v("ich", 2, (c) => `ich bewerbe mich um Ihre ${c.wo} und sage Ihnen direkt, warum das für Sie eine gute Wahl wäre.`),
      v("adv", 2, (c) => `kurz zu Ihrer ${c.wo} und zu mir, dann wissen Sie, mit wem Sie es zu tun haben.`),
    ],
  };

  // BEZUG: nur echte, extrahierte Details (Ausstattung im Nominativ, Ort, frei ab).
  const BEZUG = {
    standard: [
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "sind", "ist")} für mich ein echtes Plus.`, "det"),
      v("adv", 1, (c) => `besonders ${c.detS} ${pl(c, "haben", "hat")} es mir angetan.`, "det"),
      v("adv", 2, (c) => `gerade ${c.detS} ${pl(c, "machen", "macht")} die Wohnung für meinen Alltag ideal.`, "det"),
      v("adv", 2, (c) => `dass ${c.detS} dabei ${pl(c, "sind", "ist")}, macht die Anzeige für mich besonders attraktiv.`, "det"),
      v("nominal", 2, (c) => `${cap(c.detS)} ${pl(c, "sind", "ist")} genau das, worauf ich bei der Suche geachtet habe.`, "det"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "sprechen", "spricht")} mich sehr an.`, "det"),
      v("nominal", 2, (c) => (c.frei === "sofort" ? `Der sofort mögliche Einzug kommt mir sehr entgegen.` : `Der Einzugstermin zum ${c.frei} würde bei mir sehr gut passen.`), "frei"),
      v("ich", 1, (c) => (c.frei === "sofort" ? `ich bin zeitlich flexibel und könnte kurzfristig einziehen.` : `zum ${c.frei} könnte ich problemlos einziehen.`), "frei"),
      v("adv", 2, (c) => `nach vielen Anzeigen ohne Treffer ${pl(c, "fallen", "fällt")} mir ${c.detS} sofort auf.`, "det"),
      v("nominal", 2, (c) => `${cap(c.detS)} ${pl(c, "sind", "ist")} genau der Punkt, an dem andere Wohnungen scheitern.`, "det"),
      v("ich", 2, (c) => `ich habe lange nach etwas gesucht, wo ${c.detS} dabei ${pl(c, "sind", "ist")}.`, "det"),
      v("adv", 1, (c) => `${cap(c.detS)} ${pl(c, "geben", "gibt")} den Ausschlag.`, "det"),
      v("nominal", 2, (c) => (c.frei === "sofort" ? `Dass es sofort losgehen kann, passt mir ausgesprochen gut.` : `Der ${c.frei} als Einzugstermin passt genau in meine Planung.`), "frei"),
      v("adv", 2, (c) => (c.frei === "sofort" ? `kurzfristig einzuziehen wäre für mich kein Problem, sondern ein Glücksfall.` : `bis zum ${c.frei} habe ich alles geregelt und kann in Ruhe umziehen.`), "frei"),
      v("nominal", 2, (c) => `${cap(c.detS)} ${pl(c, "waren", "war")} auf meiner Liste ganz oben.`, "det"),
      v("ich", 2, (c) => `ich habe mir die Bilder mehrfach angesehen; ${c.detS} ${pl(c, "waren", "war")} der Grund.`, "det"),
    ],
    formal: [
      v("adv", 1, (c) => `besonders ${c.detS} ${pl(c, "sprechen", "spricht")} mich an.`, "det"),
      v("nominal", 2, (c) => `${cap(c.detS)} ${pl(c, "sind", "ist")} für mich ein wesentliches Auswahlkriterium gewesen.`, "det"),
      v("adv", 2, (c) => `dass ${c.detS} vorhanden ${pl(c, "sind", "ist")}, ist für mich ein großer Vorzug.`, "det"),
      v("nominal", 2, (c) => `${cap(c.detS)} ${pl(c, "runden", "rundet")} das Angebot aus meiner Sicht ideal ab.`, "det"),
      v("adv", 2, (c) => `positiv hervorzuheben ${pl(c, "sind", "ist")} aus meiner Sicht ${c.detS}.`, "det"),
      v("adv", 2, (c) => `auch ${c.detS} ${pl(c, "haben", "hat")} zu meinem Entschluss beigetragen, mich bei Ihnen zu melden.`, "det"),
      v("nominal", 2, (c) => (c.frei === "sofort" ? `Die sofortige Verfügbarkeit fügt sich sehr gut in meine Planung ein.` : `Der angegebene Bezugstermin zum ${c.frei} fügt sich sehr gut in meine Planung ein.`), "frei"),
      v("ich", 2, (c) => (c.frei === "sofort" ? `ich könnte das Mietverhältnis kurzfristig antreten.` : `zum ${c.frei} könnte ich das Mietverhältnis ohne Verzögerung antreten.`), "frei"),
      v("nominal", 2, (c) => `${cap(c.detS)} ${pl(c, "entsprechen", "entspricht")} genau dem, was ich seit Längerem suche.`, "det"),
      v("adv", 2, (c) => `insbesondere ${c.detS} ${pl(c, "haben", "hat")} meine Aufmerksamkeit auf sich gezogen.`, "det"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "sind", "ist")} für mich von besonderem Wert.`, "det"),
      v("ich", 2, (c) => `ich habe die Anzeige genauer gelesen, weil ${c.detS} mich ${pl(c, "überzeugen", "überzeugt")}.`, "det"),
      v("nominal", 2, (c) => (c.frei === "sofort" ? `Die sofortige Verfügbarkeit fügt sich gut in meine Planung.` : `Der vorgesehene Einzugstermin zum ${c.frei} ist mit meiner Planung vereinbar.`), "frei"),
      v("adv", 2, (c) => (c.frei === "sofort" ? `einem kurzfristigen Einzug steht meinerseits nichts entgegen.` : `zum ${c.frei} wäre ein Einzug meinerseits ohne Weiteres möglich.`), "frei"),
    ],
    kurz: [
      v("nominal", 1, (c) => `${cap(c.detS)}: genau mein Geschmack.`, "det"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "sind", "ist")} ein großes Plus.`, "det"),
      v("adv", 1, (c) => `dazu ${c.detS} – perfekt.`, "det"),
      v("adv", 1, (c) => `besonders ${c.detS} ${pl(c, "gefallen", "gefällt")} mir.`, "det"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "machen", "macht")} die Wohnung für mich rund.`, "det"),
      v("ich", 1, (c) => (c.frei === "sofort" ? `einziehen könnte ich sofort.` : `einziehen könnte ich zum ${c.frei}.`), "frei"),
      v("nominal", 1, (c) => (c.frei === "sofort" ? `Sofort frei – das passt bei mir.` : `Frei ab ${c.frei} – das passt bei mir.`), "frei"),
      v("adv", 1, (c) => `dass ${c.detS} dabei ${pl(c, "sind", "ist")}: top.`, "det"),
      v("nominal", 1, (c) => `${cap(c.detS)}: genau mein Fall.`, "det"),
      v("adv", 1, (c) => `vor allem ${c.detS}.`, "det"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "wären", "wäre")} genau richtig für mich.`, "det"),
      v("nominal", 1, (c) => (c.frei === "sofort" ? `Sofort einziehen? Ideal.` : `Einzug zum ${c.frei}: passt.`), "frei"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "überzeugen", "überzeugt")} mich.`, "det"),
    ],
    herzlich: [
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "machen", "macht")} das Ganze für mich perfekt.`, "det"),
      v("adv", 1, (c) => `allein ${c.detS} ${pl(c, "zaubern", "zaubert")} mir ein Lächeln ins Gesicht.`, "det"),
      v("adv", 1, (c) => `dass ${c.detS} dabei ${pl(c, "sind", "ist")} – wunderbar.`, "det"),
      v("nominal", 2, (c) => `${cap(c.detS)} ${pl(c, "klingen", "klingt")} nach genau dem Alltag, den ich mir wünsche.`, "det"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "sind", "ist")} das Tüpfelchen auf dem i.`, "det"),
      v("adv", 1, (c) => `und dann auch noch ${c.detS} – da schlägt mein Herz höher.`, "det"),
      v("adv", 2, (c) => (c.frei === "sofort" ? `dass die Wohnung sofort frei ist, macht es für mich noch schöner.` : `der Einzug zum ${c.frei} wäre für mich perfektes Timing.`), "frei"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "haben", "hat")} mich endgültig verzaubert.`, "det"),
      v("adv", 2, (c) => `sofort dachte ich an ein Zuhause statt an eine Wohnung – ${c.detS} ${pl(c, "machen", "macht")} den Unterschied.`, "det"),
      v("nominal", 2, (c) => `${cap(c.detS)} ${pl(c, "machen", "macht")} aus vier Wänden ein Zuhause.`, "det"),
      v("ich", 2, (c) => `ich gebe zu: ${c.detS} ${pl(c, "haben", "hat")} mich schon ein bisschen verzaubert.`, "det"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "sind", "ist")} genau das Fehlende.`, "det"),
      v("adv", 2, (c) => (c.frei === "sofort" ? `dass es sofort losgehen könnte, macht die Sache noch schöner.` : `der ${c.frei} wäre für mich ein wunderbarer Zeitpunkt.`), "frei"),
      v("ich", 2, (c) => `ich stelle mir jetzt schon vor, wie ${c.detS} im Alltag ${pl(c, "wirken", "wirkt")}.`, "det"),
    ],
    selbstbewusst: [
      v("nominal", 2, (c) => `${cap(c.detS)} ${pl(c, "sind", "ist")} genau das, worauf ich geachtet habe.`, "det"),
      v("adv", 2, (c) => `gerade ${c.detS} ${pl(c, "zeigen", "zeigt")} mir: Diese Wohnung ist durchdacht.`, "det"),
      v("adv", 1, (c) => `dass ${c.detS} dabei ${pl(c, "sind", "ist")}, bestätigt meine Wahl.`, "det"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "passen", "passt")} exakt zu meinem Alltag.`, "det"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "waren", "war")} für mich der ausschlaggebende Punkt.`, "det"),
      v("ich", 2, (c) => `auf Details wie ${c.detS} achte ich bei der Suche besonders.`, "det"),
      v("adv", 2, (c) => (c.frei === "sofort" ? `die sofortige Verfügbarkeit trifft sich gut – ich kann kurzfristig zusagen.` : `zum ${c.frei} bin ich startklar.`), "frei"),
      v("nominal", 1, (c) => `${cap(c.detS)} ${pl(c, "unterstreichen", "unterstreicht")} die Qualität der Wohnung.`, "det"),
      v("nominal", 2, (c) => `${cap(c.detS)} ${pl(c, "sind", "ist")} der Grund, warum ich nicht lange überlegt habe.`, "det"),
      v("adv", 2, (c) => `ausschlaggebend ${pl(c, "waren", "war")} für mich ${c.detS}.`, "det"),
      v("ich", 2, (c) => `ich weiß, was ich suche – und ${c.detS} ${pl(c, "gehören", "gehört")} dazu.`, "det"),
      v("nominal", 1, (c) => `${cap(c.detS)}: genau deshalb schreibe ich.`, "det"),
      v("adv", 2, (c) => (c.frei === "sofort" ? `sofort verfügbar heißt bei mir: sofort entschieden.` : `zum ${c.frei} bin ich bereit – ohne Wenn und Aber.`), "frei"),
      v("nominal", 2, (c) => `${cap(c.detS)} ${pl(c, "heben", "hebt")} die Wohnung deutlich von anderen ab.`, "det"),
    ],
  };

  /* ================= Zweite Person im Haushalt =================
     Paare, WGs und Familien bewerben sich gemeinsam – die Vermietung will
     wissen, wer der zweite Mensch ist und ob zwei Einkommen die Miete tragen.
     Der Kasus steht als TABELLE da und wird nicht aus einer Regel abgeleitet:
     „gemeinsam mit meine Partnerin" ist genau der Fehler, den sich eine
     Bewerbung nicht leisten kann. */
  const REL = {
    partnerin:     { nom: "meine Partnerin",     dat: "meiner Partnerin" },
    partner:       { nom: "mein Partner",        dat: "meinem Partner" },
    ehefrau:       { nom: "meine Frau",          dat: "meiner Frau" },
    ehemann:       { nom: "mein Mann",           dat: "meinem Mann" },
    mitbewohnerin: { nom: "meine Mitbewohnerin", dat: "meiner Mitbewohnerin" },
    mitbewohner:   { nom: "mein Mitbewohner",    dat: "meinem Mitbewohner" },
    tochter:       { nom: "meine Tochter",       dat: "meiner Tochter" },
    sohn:          { nom: "mein Sohn",           dat: "meinem Sohn" },
  };

  /* Liefert die zweite Person aufbereitet – oder null, wenn keine da ist.
     Ohne gewählte Beziehung wird KEIN Pronomen geraten (Geschlecht unbekannt);
     die Sätze arbeiten dann nur mit dem Namen. */
  function partnerInfo(p) {
    p = p || {};
    const name = (p.p2Name || "").trim();
    const rel = REL[p.p2Rel] || null;
    if (!name && !rel) return null;
    return {
      name,
      nom: rel ? rel.nom + (name ? " " + name : "") : name,
      dat: rel ? rel.dat + (name ? " " + name : "") : name,
      kurzNom: rel ? rel.nom : name,
      job: (p.p2Job || "").trim(),
      employment: p.p2Employment || "",
      income: (p.p2Income || "").trim(),
    };
  }

  // Einkommen sind Freitext („3200 €", „2.400", „1800,50"). Für die Summe wird
  // gerechnet, sonst bleibt der Text unangetastet stehen.
  function moneyValue(s) {
    const t = String(s == null ? "" : s).replace(/[^0-9.,]/g, "");
    if (!t) return null;
    const raw = t.indexOf(",") < 0 && /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(raw);
    return isFinite(n) && n > 0 ? n : null;
  }
  function moneyText(n) {
    return (Math.round(n * 100) / 100).toLocaleString("de-DE") + " €";
  }

  // Haushalt (Personen/Haustiere) – ehrlich, nur wenn Angaben da sind.
  // Mehrere Formulierungen je Fall, damit die Zeile nicht in jedem Text identisch ist.
  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function household(c) {
    const p = c.p;
    const petsLower = (p.pets || "").toLowerCase().trim();
    const petsNone = ["keine", "nein", "0", "-", "kein", "keins", "nö"].includes(petsLower);
    const hasPets = p.pets && !petsNone;
    const part = partnerInfo(p);
    let n = p.persons ? parseInt(p.persons, 10) : null;
    // Eine eingetragene zweite Person ist mindestens ein Zweipersonenhaushalt –
    // sonst stünde „Ich würde alleine einziehen" neben ihrem Namen.
    if (part && (!n || n < 2)) n = 2;
    let who = "";
    if (part && n === 2) {
      who = rnd([
        "Einziehen würden " + part.nom + " und ich",
        "Wir würden zu zweit einziehen: " + part.nom + " und ich",
        "Wir kämen zu zweit – " + part.nom + " und ich",
        "Zu zweit möchten wir einziehen, " + part.nom + " und ich",
      ]);
    } else if (part && n > 2) {
      who = rnd([
        "Einziehen würden wir mit " + n + " Personen, darunter " + part.nom,
        "Wir würden mit " + n + " Personen einziehen – dabei " + part.nom + " und ich",
      ]);
    }
    else if (n === 1) who = rnd(["Ich würde alleine einziehen", "Einziehen würde ich alleine", "Ich ziehe alleine ein", "Einziehen möchte ich allein", "Ich würde allein hier wohnen", "Ich suche die Wohnung für mich allein", "Einziehen würde ich als Einzelperson", "Ich bin allein und brauche nicht viel Platz", "Wohnen würde ich hier allein"]);
    else if (n === 2) who = rnd(["Wir würden zu zweit einziehen", "Einziehen würden wir zu zweit", "Wir ziehen zu zweit ein", "Zu zweit möchten wir einziehen", "Wir kämen zu zweit", "Einziehen würden wir als Zweierhaushalt", "Wir sind zu zweit", "Bewohnen würden die Wohnung zwei Personen"]);
    else if (n === 3) who = rnd(["Wir würden zu dritt einziehen", "Einziehen würden wir zu dritt", "Zu dritt möchten wir einziehen", "Wir kämen zu dritt", "Wir sind zu dritt", "Bewohnen würden die Wohnung drei Personen"]);
    else if (n === 4) who = rnd(["Wir würden zu viert einziehen", "Einziehen würden wir zu viert", "Zu viert möchten wir einziehen", "Wir kämen zu viert", "Wir sind zu viert", "Bewohnen würden die Wohnung vier Personen"]);
    else if (n && n > 4) who = rnd(["Einziehen würden wir mit " + n + " Personen", "Wir würden mit " + n + " Personen einziehen"]);
    if (hasPets) return who ? who + rnd([", gemeinsam mit " + p.pets + ".", " – mit dabei: " + p.pets + ".", ", zusammen mit " + p.pets + ".", ", begleitet von " + p.pets + ".", " – im Gepäck: " + p.pets + ".", ", und " + p.pets + " gehört mit dazu."]) : "Mit einziehen würde " + p.pets + ".";
    if (petsNone) return who ? who + rnd([" – ohne Haustiere.", ", ganz ohne Haustiere.", ", ohne Tiere.", "; Haustiere gibt es bei uns keine.".replace("uns", n === 1 ? "mir" : "uns"), " – Haustiere sind keine geplant.", ", tierfrei."]) : "Haustiere habe ich keine.";
    return who ? who + "." : "";
  }

  // SELBSTVORSTELLUNG: Skelette arrangieren nur vorhandene Fakten (Name Pflicht).
  function si(c, f) { // kleine Abkürzungen für die Skelette
    const p = c.p;
    return f({
      name: p.name || "…",
      alter: p.age ? String(p.age) : "",
      job: p.job || "",
      hh: household(c),
    });
  }
  const SELBST = {
    standard: [
      v("adv", 2, (c) => si(c, (x) => `zu mir: Ich heiße ${x.name}${x.alter ? `, bin ${x.alter}` : ""}${x.job ? ` und arbeite als ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `mein Name ist ${x.name}${x.alter ? ` (${x.alter})` : ""}${x.job ? `, ich bin als ${x.job} tätig` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? `, ${x.alter} Jahre alt` : ""}${x.job ? `, und verdiene mein Geld als ${x.job}` : ""}. ${x.hh}`)),
      v("adv", 1, (c) => si(c, (x) => `ein paar Worte zu mir: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 3, (c) => si(c, (x) => `ich heiße ${x.name}${x.job ? ` und stehe als ${x.job} mitten im Berufsleben` : ""}${x.alter ? ` – ${x.alter} Jahre alt` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `hinter dieser Nachricht steckt ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, im Beruf ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? ` und ${x.alter} Jahre alt` : ""}. ${x.job ? `Beruflich bin ich als ${x.job} unterwegs. ` : ""}${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `damit Sie wissen, wer schreibt: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? ` und arbeite als ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `mein Name ist ${x.name}. ${x.job ? `Ich arbeite als ${x.job}${x.alter ? ` und bin ${x.alter} Jahre alt` : ""}. ` : x.alter ? `Ich bin ${x.alter} Jahre alt. ` : ""}${x.hh}`)),
      v("adv", 1, (c) => si(c, (x) => `kurz zu mir: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich heiße ${x.name}${x.alter ? ` und bin ${x.alter}` : ""}. ${x.job ? `Als ${x.job} stehe ich fest im Berufsleben. ` : ""}${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `hinter der Nachricht steht ${x.name}${x.alter ? `, ${x.alter} Jahre alt` : ""}${x.job ? `, tätig als ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 1, (c) => si(c, (x) => `ich bin ${x.name}${x.job ? ` und arbeite als ${x.job}` : ""}${x.alter ? `, ${x.alter} Jahre alt` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.job ? `, von Beruf ${x.job}` : ""}${x.alter ? ` und ${x.alter} Jahre alt` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `Kurz zu mir: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `zu meiner Person: Ich heiße ${x.name}${x.job ? ` und arbeite als ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? `, ${x.alter} Jahre` : ""}${x.job ? `, im Beruf ${x.job}` : ""} – und suche kein Projekt, sondern ein Zuhause. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `Mein Name ist ${x.name}${x.job ? `, ich arbeite als ${x.job}` : ""}${x.alter ? ` und bin ${x.alter}` : ""}. ${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `wer schreibt Ihnen hier: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
    ],
    formal: [
      v("nominal", 2, (c) => si(c, (x) => `mein Name ist ${x.name}${x.alter ? `, ich bin ${x.alter} Jahre alt` : ""}${x.job ? ` und als ${x.job} beschäftigt` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich heiße ${x.name}${x.alter ? ` und bin ${x.alter} Jahre alt` : ""}. ${x.job ? `Beruflich bin ich als ${x.job} tätig. ` : ""}${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `zu meiner Person: ${x.name}${x.alter ? `, ${x.alter} Jahre` : ""}${x.job ? `, tätig als ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich darf mich kurz vorstellen: ${x.name}${x.alter ? `, ${x.alter} Jahre alt` : ""}${x.job ? `, von Beruf ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `mein Name ist ${x.name}${x.job ? `; ich arbeite als ${x.job}` : ""}${x.alter ? ` und bin ${x.alter} Jahre alt` : ""}. ${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `gestatten Sie mir eine kurze Vorstellung: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 3, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? `, ${x.alter} Jahre alt` : ""}${x.job ? `, und gehe einer geregelten Tätigkeit als ${x.job} nach` : ""}. ${x.hh}`)),
      v("nominal", 1, (c) => si(c, (x) => `kurz zu mir: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `mein Name ist ${x.name}. ${x.job ? `Beruflich bin ich als ${x.job} tätig${x.alter ? ` und ${x.alter} Jahre alt` : ""}. ` : x.alter ? `Ich bin ${x.alter} Jahre alt. ` : ""}${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich möchte mich Ihnen kurz vorstellen: ${x.name}${x.alter ? `, ${x.alter} Jahre alt` : ""}${x.job ? `, tätig als ${x.job}` : ""}. ${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `zu meiner Person: Ich heiße ${x.name}${x.alter ? ` und bin ${x.alter} Jahre alt` : ""}. ${x.job ? `Ich arbeite als ${x.job}. ` : ""}${x.hh}`)),
      v("nominal", 1, (c) => si(c, (x) => `kurz zu meiner Person: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.job ? ` und als ${x.job} beschäftigt` : ""}${x.alter ? `, ${x.alter} Jahre alt` : ""}. ${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `erlauben Sie mir eine kurze Vorstellung: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, von Beruf ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `Zu meiner Person: Mein Name ist ${x.name}${x.alter ? `, ich bin ${x.alter} Jahre alt` : ""}${x.job ? ` und als ${x.job} tätig` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich heiße ${x.name}${x.job ? ` und übe den Beruf ${x.job} aus` : ""}${x.alter ? `; mein Alter beträgt ${x.alter} Jahre` : ""}. ${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `zunächst kurz zu mir: ${x.name}${x.alter ? `, ${x.alter} Jahre` : ""}${x.job ? `, tätig als ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `Ich darf mich vorstellen: ${x.name}${x.job ? `, ${x.job}` : ""}${x.alter ? `, ${x.alter} Jahre alt` : ""}. ${x.hh}`)),
    ],
    kurz: [
      v("adv", 1, (c) => si(c, (x) => `zu mir: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 1, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? ` (${x.alter})` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 1, (c) => si(c, (x) => `mein Name: ${x.name}${x.job ? `, beruflich ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 1, (c) => si(c, (x) => `ich heiße ${x.name}${x.job ? ` und arbeite als ${x.job}` : ""}. ${x.hh}`)),
      v("adv", 1, (c) => si(c, (x) => `kurz vorgestellt: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 1, (c) => si(c, (x) => `${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""} – das bin ich. ${x.hh}`)),
      v("ich", 1, (c) => si(c, (x) => `ich bin ${x.name}${x.job ? ` und als ${x.job} tätig` : ""}. ${x.hh}`)),
      v("adv", 1, (c) => si(c, (x) => `dahinter steckt: ${x.name}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 1, (c) => si(c, (x) => `ich bin ${x.name}${x.job ? `, ${x.job}` : ""}${x.alter ? `, ${x.alter}` : ""}. ${x.hh}`)),
      v("nominal", 1, (c) => si(c, (x) => `kurz: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("adv", 1, (c) => si(c, (x) => `zu mir kurz: ${x.name}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 1, (c) => si(c, (x) => `ich heiße ${x.name}${x.alter ? ` (${x.alter})` : ""}. ${x.hh}`)),
      v("nominal", 1, (c) => si(c, (x) => `mein Name: ${x.name}${x.alter ? `, ${x.alter}` : ""}. ${x.hh}`)),
      v("adv", 1, (c) => si(c, (x) => `Steckbrief: ${x.name}${x.job ? `, ${x.job}` : ""}${x.alter ? `, ${x.alter}` : ""}. ${x.hh}`)),
      v("nominal", 1, (c) => si(c, (x) => `Ich: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 1, (c) => si(c, (x) => `ich bin ${x.name}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("adv", 1, (c) => si(c, (x) => `zu mir: ${x.name}${x.job ? `, ${x.job}` : ""}${x.alter ? `, ${x.alter}` : ""}. ${x.hh}`)),
      v("nominal", 1, (c) => si(c, (x) => `${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
    ],
    herzlich: [
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? `, ${x.alter} Jahre jung` : ""}${x.job ? `, und arbeite mit Freude als ${x.job}` : ""}. ${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `damit Sie ein Bild haben: Ich heiße ${x.name}${x.alter ? `, bin ${x.alter}` : ""}${x.job ? ` und ${x.job} von Herzen` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `mein Name ist ${x.name}${x.alter ? ` (${x.alter})` : ""}${x.job ? ` – tagsüber ${x.job}, abends gerne daheim` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich heiße ${x.name}${x.job ? ` und arbeite als ${x.job}` : ""}${x.alter ? `, bin ${x.alter} Jahre alt` : ""}. ${x.hh}`)),
      v("adv", 1, (c) => si(c, (x) => `wer da schreibt? ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `hinter diesen Zeilen steckt ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, beruflich als ${x.job} unterwegs` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? ` und ${x.alter} Jahre alt` : ""}. ${x.job ? `Mein Beruf: ${x.job}. ` : ""}${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `ganz kurz zu mir: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, mit Herzblut ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? `, ${x.alter} Jahre jung` : ""}. ${x.job ? `Mit Freude arbeite ich als ${x.job}. ` : ""}${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `mein Name ist ${x.name}${x.alter ? ` (${x.alter})` : ""}. ${x.job ? `Beruflich bin ich als ${x.job} unterwegs. ` : ""}${x.hh}`)),
      v("adv", 1, (c) => si(c, (x) => `ganz kurz, wer schreibt: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich heiße ${x.name} und freue mich, mich vorzustellen${x.alter ? ` – ${x.alter} Jahre alt` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `diese Nachricht kommt von ${x.name}${x.job ? `, ${x.job}` : ""}${x.alter ? `, ${x.alter} Jahre alt` : ""}. ${x.hh}`)),
      v("ich", 1, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? ` und arbeite als ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? ` und arbeite als ${x.job}` : ""} – und freue mich gerade sehr über Ihre Anzeige. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `Zu mir: ${x.name}${x.job ? `, ${x.job}` : ""}${x.alter ? `, ${x.alter} Jahre jung` : ""}. ${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `damit Sie ein Gesicht dazu haben: Ich bin ${x.name}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich heiße ${x.name}${x.alter ? `, bin ${x.alter}` : ""}${x.job ? ` und verdiene mein Geld als ${x.job}` : ""}. ${x.hh}`)),
    ],
    selbstbewusst: [
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, arbeite als ${x.job}` : ""} – und ich weiß, was ich will. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `mein Name ist ${x.name}${x.job ? `, beruflich stehe ich als ${x.job} fest im Leben` : ""}${x.alter ? ` (${x.alter})` : ""}. ${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `zur Person: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""} – strukturiert und verlässlich. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich heiße ${x.name}${x.job ? ` und arbeite als ${x.job}` : ""}. Was mich auszeichnet: Ich halte Zusagen ein. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""} – so lässt sich mein Steckbrief zusammenfassen. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? `, ${x.alter} Jahre alt` : ""}${x.job ? `, und in meinem Beruf als ${x.job} gut angekommen` : ""}. ${x.hh}`)),
      v("adv", 1, (c) => si(c, (x) => `klare Fakten zu mir: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `hinter dieser Bewerbung steht ${x.name}${x.job ? ` – im Alltag ${x.job}` : ""}${x.alter ? `, ${x.alter} Jahre alt` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""} – zuverlässig und klar in dem, was ich will. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `mein Name ist ${x.name}. ${x.job ? `Als ${x.job} stehe ich fest im Leben${x.alter ? ` (${x.alter})` : ""}. ` : x.alter ? `Ich bin ${x.alter} Jahre alt. ` : ""}${x.hh}`)),
      v("adv", 1, (c) => si(c, (x) => `klar zu mir: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.job ? ` und arbeite als ${x.job}` : ""}. Auf mich ist Verlass. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `kurz und klar: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich heiße ${x.name}${x.alter ? ` und bin ${x.alter} Jahre alt` : ""}${x.job ? `, im Beruf ${x.job}` : ""}. ${x.hh}`)),
      v("nominal", 2, (c) => si(c, (x) => `Zu mir in einem Satz: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.job ? `, ${x.job}` : ""} – jemand, der weiß, was er will. ${x.hh}`)),
      v("adv", 2, (c) => si(c, (x) => `damit Sie mich einordnen können: ${x.name}${x.alter ? `, ${x.alter}` : ""}${x.job ? `, ${x.job}` : ""}. ${x.hh}`)),
      v("ich", 2, (c) => si(c, (x) => `ich bin ${x.name}${x.job ? ` und arbeite als ${x.job}` : ""}${x.alter ? `, ${x.alter} Jahre alt` : ""}. ${x.hh}`)),
    ],
  };

  /* Zweite Person: Beruf und gemeinsames Einkommen.
     BEWUSST additiv als eigener Satz, statt die 50 Vertrauens-Varianten
     umzuschreiben: „ich verdiene 4.700 €" wäre bei zwei Einkommen schlicht
     gelogen, und ein Umbau aller Tonlagen hätte den Klang verändert.
     Der Satz hängt hinten am Vertrauens-Absatz, wie der Unterlagen-Satz auch. */
  function partnerSentence(c) {
    const p = c.p;
    const part = partnerInfo(p);
    if (!part) return "";
    const kurz = c.mode === "kurz";

    const EMP = {
      unbefristet: "ist unbefristet angestellt",
      befristet: "ist fest angestellt",
      selbststaendig: "ist selbstständig",
      azubi: "ist in Ausbildung",
      rente: "bezieht Rente",
      buergergeld: "",   // Sozialleistungsbezug gehört nicht ungefragt in den Brief
    };
    // Beruf schlägt Beschäftigungsart: „arbeitet als Krankenpflegerin" sagt mehr
    // als „ist unbefristet angestellt".
    // Kurzform beim zweiten Erwähnen: Die Vorstellung nennt bereits „mein Mann
    // Jonas Brandt" (alle 70 Selbstvorstellungs-Varianten enthalten den
    // Haushalts-Satz), hier reicht der Name. Ohne Namen bleibt die Beziehung –
    // dann im richtigen Kasus, deshalb zwei Formen.
    // Beim zweiten Nennen reicht der Vorname: Bei gleichem Nachnamen stand
    // „Jonas Brandt" sonst dreimal im Brief (Haushalt, hier, Unterschrift).
    const rufname = part.name ? part.name.split(/\s+/)[0] : "";
    const wer = rufname || part.nom || "Die zweite Person";
    const vonWem = rufname || part.dat || "der zweiten Person";
    let beruf = "";
    if (part.job) beruf = wer + " arbeitet als " + part.job;
    else if (EMP[part.employment]) beruf = wer + " " + EMP[part.employment];

    const eigen = moneyValue(p.income);
    const ihres = moneyValue(part.income);
    let geld = "";
    if (eigen && ihres) {
      const summe = moneyText(eigen + ihres);
      geld = kurz
        ? "Gemeinsam: " + summe + " netto im Monat"
        : rnd([
            "Zusammen kommen wir auf " + summe + " netto im Monat",
            "Gemeinsam haben wir " + summe + " netto im Monat zur Verfügung",
            "Unser gemeinsames Nettoeinkommen liegt bei " + summe + " im Monat",
            "Als Haushalt kommen wir auf " + summe + " netto im Monat",
            "Zu zweit stehen uns " + summe + " netto monatlich zur Verfügung",
            "Die Miete tragen wir gemeinsam aus " + summe + " netto im Monat",
            "Unser Haushaltseinkommen beträgt " + summe + " netto im Monat",
          ]);
    } else if (ihres) {
      geld = kurz
        ? wer + ": " + part.income + " netto"
        : rnd([
            wer + " verdient " + part.income + " netto im Monat",
            "Dazu kommt das Einkommen von " + vonWem + " mit " + part.income + " netto",
          ]);
    }

    if (beruf && geld) return beruf + "; " + geld.charAt(0).toLowerCase() + geld.slice(1) + ".";
    if (geld) return geld + ".";
    if (beruf) return beruf + ".";
    return "";
  }

  /* VERTRAUEN: ehrliche Miet-Sicherheit aus dem Profil.
     Spezielle Beschäftigungen haben eigene, sachlich passende Varianten;
     der Standardweg (Einkommen/Anstellung) hat 8 Varianten je Tonlage. */
  function vertrauenPool(c) {
    const p = c.p, mode = c.mode;
    const emp = p.employment, inc = p.income;

    if (emp === "buergergeld") return [
      v("nominal", 3, () => `Die Mietzahlung ist verlässlich geregelt: Die Kosten der Unterkunft übernimmt vollständig das Jobcenter, auf Wunsch als Direktüberweisung an Sie.`),
      v("adv", 2, () => `zur Sicherheit für Sie: Die Miete trägt das Jobcenter (Kosten der Unterkunft) und kann direkt an Sie überwiesen werden.`),
      v("nominal", 2, () => `Der Mieteingang ist Monat für Monat gesichert – das Jobcenter übernimmt die Kosten der Unterkunft vollständig.`),
      v("ich", 3, () => `ich lege Wert auf klare Verhältnisse: Die Miete läuft über das Jobcenter (Kosten der Unterkunft) und geht auf Wunsch direkt an Sie – pünktlich, jeden Monat.`),
      v("adv", 2, () => `finanziell gibt es keine offenen Fragen: Die Kosten der Unterkunft sind durch das Jobcenter vollständig gedeckt.`),
      v("nominal", 2, () => `Für Sie bedeutet das: ein Zahlungseingang, der nicht von einem Arbeitgeber abhängt, sondern von einer Behörde.`),
      v("ich", 2, () => `ich kann Ihnen die Kostenübernahme schriftlich bestätigen lassen, bevor wir etwas unterschreiben.`),
      v("adv", 2, () => `gerne kläre ich die Direktzahlung vorab mit dem Jobcenter, damit für Sie kein Aufwand entsteht.`),
      v("nominal", 2, () => `Die Miete ist damit unabhängig von Krankheit, Auftragslage oder Kündigungsfristen.`),
      v("ich", 2, () => `ich gehe damit offen um, weil Sie wissen sollen, woran Sie sind – die Miete steht.`),
    ];
    if (emp === "rente") {
      const b = inc ? ` von ${inc}` : "";
      return [
        v("nominal", 2, () => `Meine regelmäßige Rente${b} deckt die Miete zuverlässig und pünktlich.`),
        v("ich", 2, () => `ich beziehe eine feste Rente${b} – die Miete ist damit jeden Monat gesichert.`),
        v("adv", 2, () => `finanziell ist alles geregelt: Meine Rente${b} kommt pünktlich, die Miete ebenso.`),
        v("nominal", 1, () => `Die Miete ist über meine Rente${b} sicher gedeckt.`),
        v("ich", 2, () => `ich kann mich auf meine Rente${b} verlassen – und Sie sich auf den Mieteingang.`),
      ];
    }
    if (emp === "selbststaendig") {
      const b = inc ? ` von durchschnittlich ${inc} netto im Monat` : "";
      return [
        v("ich", 2, () => `ich bin selbstständig und erziele ein regelmäßiges Einkommen${b} – die Miete zahle ich zuverlässig.`),
        v("nominal", 2, () => `Mein selbstständiges Einkommen${b} ist stabil, die Mietzahlung damit gesichert.`),
        v("adv", 2, () => `aus meiner Selbstständigkeit erziele ich regelmäßige Einnahmen${b}; die Miete geht bei mir pünktlich raus.`),
        v("ich", 2, () => `ich arbeite selbstständig, mit verlässlichen Einnahmen${b} – Mietrückstände gibt es bei mir nicht.`),
        v("nominal", 2, () => `Die Miete ist über meine Einnahmen aus der Selbstständigkeit${b} solide gedeckt.`),
      ];
    }
    if (emp === "azubi") return [
      v("nominal", 2, () => `Mein Einkommen deckt die Miete; bei Bedarf kann ich zusätzlich eine Bürgschaft vorlegen.`),
      v("ich", 2, () => `ich bin in Ausbildung/Studium, die Miete ist über mein Einkommen gedeckt – eine Bürgschaft ist bei Bedarf möglich.`),
      v("adv", 2, () => `für zusätzliche Sicherheit kann ich gerne eine Bürgschaft (z. B. der Eltern) beibringen.`),
      v("nominal", 1, () => `Die Miete ist gedeckt, eine Bürgschaft auf Wunsch möglich.`),
      v("nominal", 2, () => `Eine Rente kennt keine Probezeit und keine Kündigung – der Mieteingang bleibt, wie er ist.`),
      v("ich", 2, () => `ich bin über die Jahre ruhiger geworden; laute Nächte gibt es bei mir keine.`),
      v("adv", 2, () => `den Rentenbescheid lege ich Ihnen selbstverständlich vor.`),
      v("nominal", 2, () => `Wenn im Haus etwas nicht stimmt, bekomme ich das mit und melde es Ihnen, statt es liegen zu lassen.`),
      v("ich", 2, () => `ich suche kein Zwischenquartier, sondern ein Zuhause für die nächsten Jahre.`),
      v("nominal", 2, () => `Meine Einnahmen belege ich Ihnen gerne mit Steuerbescheid und Kontoauszügen – Sie müssen mir nichts glauben.`),
      v("ich", 2, () => `ich arbeite selbstständig und lege bewusst Rücklagen an, gerade weil Einnahmen schwanken können.`),
      v("adv", 2, () => `auf Wunsch zahle ich die erste Miete im Voraus, wenn Ihnen das zusätzliche Sicherheit gibt.`),
      v("nominal", 2, () => `Selbstständig heißt bei mir nicht unsicher: Ich kalkuliere die Miete als Fixkosten, nicht als Restbetrag.`),
      v("ich", 2, () => `ich weiß, dass Selbstständigkeit erklärungsbedürftig ist – fragen Sie mich gerne alles, was Sie wissen möchten.`),
      v("nominal", 2, () => `Eine Bürgschaft der Eltern lege ich Ihnen gerne unaufgefordert vor.`),
      v("ich", 2, () => `ich stehe am Anfang, weiß aber genau, was eine eigene Wohnung wert ist – entsprechend gehe ich damit um.`),
      v("adv", 2, () => `meinen Ausbildungs- oder Studienplatz kann ich Ihnen jederzeit nachweisen.`),
      v("nominal", 2, () => `Feiern findet bei mir woanders statt – ich brauche die Wohnung zum Lernen und Schlafen.`),
      v("ich", 2, () => `ich bleibe voraussichtlich die gesamte Ausbildungszeit – Sie hätten also lange Ruhe.`),
    ];

    // Standardweg: Einkommen und/oder (un)befristete Anstellung – ehrlich, nichts erfinden.
    const unb = emp === "unbefristet";
    const fest = emp === "unbefristet" || emp === "befristet";
    const POOLS = {
      standard: [
        v("adv", 2, () => inc ? `finanziell ist alles stabil: Mit ${inc} netto im Monat${unb ? " aus unbefristeter Anstellung" : ""} ist die Miete sicher gedeckt.` : null, "inc"),
        v("nominal", 2, () => inc ? `Die Miete ist bei mir kein Risiko – ich verdiene ${inc} netto${unb ? " und bin unbefristet angestellt" : ""}.` : null, "inc"),
        v("ich", 2, () => inc ? `ich verdiene ${inc} netto im Monat${unb ? ", unbefristet angestellt" : ""} – die Miete zahle ich pünktlich und ohne Wenn und Aber.` : null, "inc"),
        v("nominal", 2, () => inc ? `Mein Einkommen von ${inc} netto${fest ? " aus fester Anstellung" : ""} macht die Mietzahlung planbar – für Sie und für mich.` : null, "inc"),
        v("ich", 2, () => fest ? `ich stehe in einem festen${unb ? ", unbefristeten" : ""} Arbeitsverhältnis – die Miete geht bei mir pünktlich raus.` : null, "emp"),
        v("nominal", 2, () => fest ? `Ein festes${unb ? ", unbefristetes" : ""} Arbeitsverhältnis sorgt dafür, dass Sie sich um den Mieteingang nie kümmern müssen.` : null, "emp"),
        v("adv", 1, () => `auf pünktliche Mietzahlungen können Sie sich bei mir verlassen.`),
        v("ich", 2, () => `ich gehe sorgsam mit der Wohnung um und zahle die Miete zuverlässig – dafür stehe ich mit meinem Namen.`),
        v("adv", 2, () => `mit der Wohnung gehe ich pfleglich um, die Miete kommt bei mir zuverlässig.`),
        v("nominal", 1, () => `Auf einen ordentlichen, verlässlichen Mieter können Sie bauen.`),
        v("nominal", 2, () => inc ? `Bei ${inc} netto im Monat ist die Miete gut tragbar – ohne Rechnerei am Monatsende.` : null, "inc"),
        v("adv", 2, () => inc ? `zur Einordnung: ${inc} netto im Monat${fest ? ", festes Arbeitsverhältnis" : ""} – daran scheitert die Miete nicht.` : null, "inc"),
        v("ich", 2, () => inc ? `ich verdiene ${inc} netto im Monat; die Miete ist bei mir fest eingeplant und nicht auf Kante genäht.` : null, "inc"),
        v("nominal", 2, () => fest ? `Ein${unb ? " unbefristetes" : " festes"} Arbeitsverhältnis heißt für Sie: gleicher Betrag, gleicher Termin, jeden Monat.` : null, "emp"),
        v("ich", 2, () => fest ? `ich bin fest${unb ? " und unbefristet" : ""} angestellt – für Sie heißt das ein planbarer Mieteingang.` : null, "emp"),
        v("adv", 2, () => `zu meinem Verständnis von Mieten gehört: pünktlich zahlen, Schäden sofort melden, Ruhezeiten einhalten.`),
        v("nominal", 2, () => `Was Sie von mir erwarten dürfen: pünktliche Miete, sorgsamer Umgang und Erreichbarkeit, wenn etwas ist.`),
        v("ich", 2, () => `ich melde mich, wenn etwas kaputt ist, statt es auszusitzen – das erspart uns beiden Ärger.`),
        v("adv", 1, () => `Rückstände oder Ausreden wird es bei mir nicht geben.`),
      ],
      formal: [
        v("nominal", 2, () => inc ? `Meine finanzielle Situation ist stabil: Ich verfüge über ${inc} netto im Monat${unb ? " aus einem unbefristeten Arbeitsverhältnis" : ""}.` : null, "inc"),
        v("ich", 2, () => inc ? `ich erziele ein monatliches Nettoeinkommen von ${inc}${fest ? " aus fester Anstellung" : ""}; die Mietzahlung ist damit jederzeit gesichert.` : null, "inc"),
        v("adv", 2, () => inc ? `zur finanziellen Einordnung: Mein Nettoeinkommen beträgt ${inc} im Monat${unb ? ", das Arbeitsverhältnis ist unbefristet" : ""}.` : null, "inc"),
        v("nominal", 2, () => inc ? `Die Mietzahlung ist durch mein Einkommen von ${inc} netto${unb ? " (unbefristet)" : ""} dauerhaft gewährleistet.` : null, "inc"),
        v("ich", 2, () => fest ? `ich stehe in einem festen${unb ? ", unbefristeten" : ""} Arbeitsverhältnis und komme meinen Zahlungsverpflichtungen stets pünktlich nach.` : null, "emp"),
        v("nominal", 2, () => fest ? `Mein${unb ? " unbefristetes" : " festes"} Arbeitsverhältnis gewährleistet einen verlässlichen Mieteingang.` : null, "emp"),
        v("adv", 1, () => `auf die pünktliche Zahlung der Miete können Sie sich uneingeschränkt verlassen.`),
        v("ich", 2, () => `ich lege großen Wert auf ein korrektes Mietverhältnis – von der pünktlichen Zahlung bis zum sorgsamen Umgang mit der Wohnung.`),
        v("nominal", 2, () => `Ein korrektes Mietverhältnis und pünktliche Zahlungen sind für mich selbstverständlich.`),
        v("adv", 1, () => `mit dem Mietobjekt gehe ich verantwortungsvoll um.`),
        v("nominal", 2, () => inc ? `Bei einem monatlichen Nettoeinkommen von ${inc} ist die Miete dauerhaft und ohne Einschränkung tragbar.` : null, "inc"),
        v("ich", 2, () => inc ? `ich verfüge über ${inc} netto monatlich${unb ? " aus unbefristeter Anstellung" : ""}; Zahlungsverzug ist ausgeschlossen.` : null, "inc"),
        v("adv", 2, () => inc ? `zur Einordnung meiner Bonität: ${inc} netto im Monat${fest ? " bei fester Anstellung" : ""}.` : null, "inc"),
        v("nominal", 2, () => fest ? `Das${unb ? " unbefristete" : " bestehende"} Arbeitsverhältnis sichert einen gleichbleibenden Mieteingang.` : null, "emp"),
        v("ich", 2, () => fest ? `ich befinde mich in einem${unb ? " unbefristeten" : " festen"} Anstellungsverhältnis und erfülle meine Verpflichtungen fristgerecht.` : null, "emp"),
        v("nominal", 2, () => `Ein pfleglicher Umgang mit der Mietsache und die Einhaltung der Hausordnung sind für mich Grundlage, nicht Zugeständnis.`),
        v("adv", 2, () => `Schäden würde ich Ihnen unverzüglich anzeigen, statt sie zu verschweigen.`),
        v("ich", 2, () => `ich suche ein Mietverhältnis, das über Jahre trägt – für beide Seiten ohne Überraschungen.`),
      ],
      kurz: [
        v("nominal", 1, () => inc ? `Einkommen: ${inc} netto${unb ? ", unbefristet" : ""} – die Miete ist gesichert.` : null, "inc"),
        v("ich", 1, () => inc ? `ich verdiene ${inc} netto${unb ? " (unbefristet)" : ""}; Miete ist kein Thema.` : null, "inc"),
        v("adv", 1, () => inc ? `zur Sicherheit: ${inc} netto im Monat${fest ? ", feste Anstellung" : ""}.` : null, "inc"),
        v("nominal", 1, () => fest ? `Feste${unb ? ", unbefristete" : ""} Anstellung – Miete kommt pünktlich.` : null, "emp"),
        v("ich", 1, () => fest ? `ich bin fest angestellt${unb ? " (unbefristet)" : ""}, die Miete ist gedeckt.` : null, "emp"),
        v("adv", 1, () => `pünktliche Miete ist bei mir selbstverständlich.`),
        v("nominal", 1, () => `Zuverlässige Mietzahlung: versprochen.`),
        v("ich", 1, () => `auf mich ist Verlass – auch beim Mieteingang.`),
        v("nominal", 1, () => `Zuverlässiger Mieter, pünktliche Miete.`),
        v("ich", 1, () => `ich bin ordentlich und verlässlich.`),
        v("nominal", 1, () => inc ? `${inc} netto${fest ? ", fest angestellt" : ""}. Miete gesichert.` : null, "inc"),
        v("ich", 1, () => inc ? `ich verdiene ${inc} netto – Miete kein Problem.` : null, "inc"),
        v("adv", 1, () => inc ? `finanziell: ${inc} netto, planbar.` : null, "inc"),
        v("nominal", 1, () => fest ? `Fest angestellt${unb ? ", unbefristet" : ""} – planbarer Mieteingang.` : null, "emp"),
        v("adv", 1, () => `Schäden melde ich sofort.`),
        v("nominal", 1, () => `Pünktlich, ordentlich, erreichbar.`),
        v("ich", 1, () => `ich zahle pünktlich, ohne Erinnerung.`),
        v("adv", 1, () => `keine Rückstände, keine Ausreden.`),
      ],
      herzlich: [
        v("adv", 2, () => inc ? `damit Sie beruhigt sind: Mit ${inc} netto im Monat${unb ? " und unbefristeter Stelle" : ""} ist die Miete bei mir in sicheren Händen.` : null, "inc"),
        v("nominal", 2, () => inc ? `Die Miete soll Ihnen keine Sorgen machen – mein Einkommen von ${inc} netto${fest ? " aus fester Anstellung" : ""} deckt sie verlässlich.` : null, "inc"),
        v("ich", 2, () => inc ? `ich verdiene ${inc} netto${unb ? " in unbefristeter Anstellung" : ""} – Sie können sich auf den Mieteingang genauso verlassen wie auf mich als Nachbarn.` : null, "inc"),
        v("ich", 2, () => fest ? `ich habe eine feste${unb ? ", unbefristete" : ""} Stelle – die Miete kommt bei mir so verlässlich wie der Monatsanfang.` : null, "emp"),
        v("nominal", 2, () => fest ? `Ein festes${unb ? ", unbefristetes" : ""} Arbeitsverhältnis gibt Ihnen und mir Planungssicherheit.` : null, "emp"),
        v("adv", 1, () => `um die Miete müssen Sie sich bei mir nie Gedanken machen.`),
        v("ich", 2, () => `ich verspreche Ihnen ein unkompliziertes Miteinander – angefangen bei der pünktlichen Miete.`),
        v("nominal", 1, () => `Verlässlichkeit ist mir wichtig, bei der Miete zuerst.`),
        v("ich", 2, () => `Sie bekommen einen rücksichtsvollen Mieter, auf den Sie sich verlassen können.`),
        v("nominal", 1, () => `Verlässlichkeit ist mir eine Herzensangelegenheit.`),
        v("nominal", 2, () => inc ? `Mit ${inc} netto im Monat ist die Miete gut zu stemmen – da müssen Sie sich keine Sorgen machen.` : null, "inc"),
        v("ich", 2, () => inc ? `ich verdiene ${inc} netto${unb ? " in unbefristeter Anstellung" : ""}; die Miete ist das Erste, was vom Konto geht.` : null, "inc"),
        v("adv", 2, () => inc ? `damit Sie es einordnen können: ${inc} netto im Monat${fest ? ", feste Stelle" : ""}.` : null, "inc"),
        v("ich", 2, () => fest ? `ich habe eine feste${unb ? ", unbefristete" : ""} Stelle – und ein ruhiges Leben, das gut in ein Haus passt.` : null, "emp"),
        v("nominal", 2, () => `Ich wünsche mir Nachbarn, die man grüßt, und eine Vermietung, die sich auf mich verlassen kann.`),
        v("adv", 2, () => `wenn etwas ist, melde ich mich – lieber einmal zu früh als zu spät.`),
        v("ich", 2, () => `ich möchte ankommen und bleiben, nicht in zwei Jahren wieder Kartons packen.`),
        v("nominal", 1, () => `Auf mich ist Verlass, im Kleinen wie beim Mieteingang.`),
      ],
      selbstbewusst: [
        v("nominal", 2, () => inc ? `Zahlen überzeugen: ${inc} netto im Monat${unb ? ", unbefristet angestellt" : ""} – der Mieteingang ist bei mir garantiert pünktlich.` : null, "inc"),
        v("ich", 2, () => inc ? `ich verdiene ${inc} netto${unb ? " aus unbefristeter Anstellung" : ""} und behandle die Miete wie einen Fixtermin: unverhandelbar pünktlich.` : null, "inc"),
        v("adv", 2, () => inc ? `zur Einordnung: ${inc} netto monatlich${fest ? ", feste Anstellung" : ""} – finanzielle Stabilität ist bei mir keine Behauptung, sondern Fakt.` : null, "inc"),
        v("nominal", 2, () => fest ? `Ein festes${unb ? ", unbefristetes" : ""} Arbeitsverhältnis spricht für sich – Ihr Mieteingang ist planbar.` : null, "emp"),
        v("ich", 2, () => fest ? `ich bin fest${unb ? " und unbefristet" : ""} angestellt – Zuverlässigkeit können Sie bei mir voraussetzen.` : null, "emp"),
        v("adv", 1, () => `pünktliche Miete ist für mich eine Selbstverständlichkeit, keine Zusage.`),
        v("ich", 1, () => `ich halte, was ich zusage – bei der Miete zuerst.`),
        v("nominal", 1, () => `Verlässlichkeit ist mein Standard, nicht mein Versprechen.`),
        v("nominal", 1, () => `Zuverlässigkeit bekommen Sie bei mir ohne Nachfragen.`),
        v("ich", 1, () => `ich bin der Mieter, den Sie sich wünschen.`),
        v("nominal", 2, () => inc ? `${inc} netto im Monat${unb ? ", unbefristet" : ""}: Die Miete ist gedeckt, ohne dass es eng wird.` : null, "inc"),
        v("ich", 2, () => inc ? `ich verdiene ${inc} netto und weiß genau, was ich mir leisten kann – diese Wohnung gehört dazu.` : null, "inc"),
        v("adv", 2, () => inc ? `Klartext: ${inc} netto im Monat${fest ? ", feste Anstellung" : ""}. Die Miete ist kein Thema.` : null, "inc"),
        v("nominal", 2, () => fest ? `Feste${unb ? ", unbefristete" : ""} Anstellung, geregelte Verhältnisse – Sie bekommen einen Mieter ohne Fragezeichen.` : null, "emp"),
        v("ich", 2, () => `ich sage zu, was ich halte – und halte, was ich zusage.`),
        v("nominal", 2, () => `Pünktliche Miete, gepflegte Wohnung, klare Kommunikation. Mehr braucht ein gutes Mietverhältnis nicht.`),
        v("adv", 2, () => `bei mir gibt es keine Mahnungen, keine Ausreden und keine überraschten Anrufe.`),
        v("ich", 1, () => `ich bin der Mieter, an den Sie sich nicht erinnern müssen.`),
      ],
    };
    // Nur Varianten, deren Daten vorhanden sind (need "inc"/"emp"), plus generische.
    return (POOLS[mode] || POOLS.standard).filter((x) => {
      if (x.need === "inc") return !!inc;
      if (x.need === "emp") return fest;
      return true;
    });
  }

  // UNTERLAGEN: nur erwähnen, was in der Extension wirklich vorbereitet wurde.
  const DOC_LABEL = {
    schufa: "eine aktuelle SCHUFA-Auskunft", selbstauskunft: "meine ausgefüllte Selbstauskunft",
    gehalt: "aktuelle Gehaltsnachweise", bwa: "aktuelle Einkommensnachweise",
    rente: "meinen Rentenbescheid", jobcenter: "den aktuellen Jobcenter-Bescheid",
    kdu: "die Bestätigung der Mietkostenübernahme", mietschulden: "eine Mietschuldenfreiheitsbescheinigung",
    buergschaft: "eine Bürgschaft", ausbildung: "meinen Ausbildungsnachweis",
  };
  // FUN-07: „Gehaltsnachweise"/„Einkommensnachweise" sind grammatisch Plural –
  // bei genau EINER Unterlage entscheidet also das Label, nicht die Anzahl,
  // ob das Verb im Singular steht („… liegt bereit" statt „… liegen bereit").
  const DOC_PLURAL = { gehalt: true, bwa: true };
  function docsKeys(c) {
    const d = c.docs || {};
    // noSchufa (negative/fehlende SCHUFA): SCHUFA darf NIE erwähnt werden – auch
    // dann nicht, wenn d.schufa aus früherem Abhaken noch true sein sollte.
    return Object.keys(DOC_LABEL)
      .filter((k) => d[k] && !(k === "schufa" && d.noSchufa))
      .slice(0, 3);
  }
  function docsSentence(c) {
    const keys = docsKeys(c);
    const list = keys.map((k) => DOC_LABEL[k]);
    if (!list.length) return "";
    const liste = list.length > 1 ? list.slice(0, -1).join(", ") + " und " + list[list.length - 1] : list[0];
    // Verbkongruenz wie beim pl()-Muster im BEZUG-Baustein (FUN-07).
    const liegen = (keys.length === 1 && !DOC_PLURAL[keys[0]]) ? "liegt" : "liegen";
    const byMode = {
      formal: [
        `${cap(liste)} ${liegen} bereit und reiche ich Ihnen gerne vorab ein.`,
        `Gerne stelle ich Ihnen ${liste} zur Verfügung.`,
        `${cap(liste)} bringe ich zur Besichtigung mit.`,
        `Meine Unterlagen sind vollständig – ${liste} inklusive.`,
        `Auf Wunsch erhalten Sie ${liste} bereits vor dem Termin.`,
        `${cap(liste)} ${liegen} vollständig vor; Sie müssen nichts nachfordern.`,
        `Sie müssen mir nichts glauben: ${liste} ${liegen} zur Einsicht bereit.`,
        `Zur Prüfung reiche ich Ihnen ${liste} gerne unaufgefordert ein.`,
      ],
      kurz: [
        `Unterlagen (${liste}) liegen bereit.`,
        `${cap(liste)}: alles vorbereitet.`,
        `Meine Unterlagen sind komplett, ${liste} inklusive.`,
        `${cap(liste)} – auf Zuruf da.`,
        `Unterlagen komplett: ${liste}.`,
        `${cap(liste)} bringe ich mit.`,
      ],
    };
    const generic = [
      `Damit Sie schnell entscheiden können, ${liegen} ${liste} schon bereit.`,
      `${cap(liste)} habe ich bereits vorbereitet und bringe alles zur Besichtigung mit.`,
      `Meine Unterlagen sind startklar – ${liste} inklusive.`,
      `${cap(liste)} kann ich Ihnen sofort zusenden oder mitbringen.`,
      `Sie müssen nichts hinterherlaufen: ${liste} ${liegen} vorbereitet.`,
      `${cap(liste)} schicke ich Ihnen gerne noch heute.`,
      `Was Sie zur Prüfung brauchen, ist da – ${liste}.`,
      `${cap(liste)} ${liegen} bereit, damit Sie ohne Wartezeit entscheiden können.`,
      `Ich halte ${liste} bereit; sagen Sie einfach, was Sie sehen möchten.`,
    ];
    const pool = byMode[c.mode] || generic;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ZUSATZ: Zuverlässigkeits-/Langfristigkeits-Signal (Absicht, keine erfundenen Fakten);
  // nutzt die persönliche Beschreibung aus dem Profil, wenn vorhanden.
  const ZUSATZ = {
    standard: [
      v("ich", 2, () => `ich suche kein Übergangsquartier, sondern ein Zuhause für lange Zeit.`),
      v("nominal", 2, () => `Ein langfristiges, unkompliziertes Mietverhältnis ist genau das, was ich mir wünsche.`),
      v("adv", 2, () => `mit der Wohnung und der Nachbarschaft gehe ich sorgsam um – das ist für mich selbstverständlich.`),
      v("ich", 1, () => `ich bleibe gerne lange.`),
      v("nominal", 2, () => `Ruhe im Haus und ein gutes Miteinander sind mir genauso wichtig wie die Wohnung selbst.`),
      v("adv", 2, () => `auf ein faires, verlässliches Miteinander lege ich großen Wert.`),
      v("ich", 2, () => `ich plane langfristig – häufige Umzüge sind nicht mein Stil.`),
      v("nominal", 1, () => `Ein ruhiges, dauerhaftes Mietverhältnis ist mein Ziel.`),
      v("ich", 2, () => `ich wünsche mir einen Ort, an dem ich wirklich ankommen und bleiben kann.`),
      v("nominal", 2, () => `Ein verlässliches, langfristiges Mietverhältnis ist mir wichtiger als der schnelle Wechsel.`),
      v("adv", 2, () => `mit den Nachbarn gehe ich rücksichtsvoll um und halte die Wohnung in Ordnung.`),
      v("ich", 1, () => `ich bin unkompliziert und zuverlässig.`),
      v("nominal", 1, () => `Rücksicht und Ordnung sind für mich selbstverständlich.`),
      v("adv", 2, () => `am liebsten bleibe ich viele Jahre und pflege die Wohnung entsprechend.`),
      v("nominal", 2, () => `Nachbarn merken bei mir vor allem eines: dass es leise ist.`),
      v("ich", 2, () => `ich lüfte regelmäßig, halte Ordnung und weiß, wie man eine Wohnung in Schuss hält.`),
      v("adv", 2, () => `kleine Reparaturen erledige ich selbst, größere melde ich Ihnen sofort.`),
      v("nominal", 2, () => `Treppenhaus, Mülltrennung, Hausordnung – für mich Selbstverständlichkeiten, keine Diskussionsthemen.`),
      v("ich", 2, () => `ich bin niemand, der bei jeder Kleinigkeit anruft – aber erreichbar, wenn es darauf ankommt.`),
      v("adv", 1, () => `unkompliziert im Umgang, verlässlich im Alltag.`),
    ],
    formal: [
      v("ich", 2, () => `ich strebe ein langfristiges und unkompliziertes Mietverhältnis an.`),
      v("nominal", 2, () => `Ein sorgsamer Umgang mit der Wohnung und ein gutes Verhältnis zur Nachbarschaft sind für mich selbstverständlich.`),
      v("adv", 2, () => `an einem dauerhaften Mietverhältnis ist mir ausdrücklich gelegen.`),
      v("ich", 2, () => `ich lege Wert auf ein ruhiges, verbindliches Mietverhältnis über viele Jahre.`),
      v("nominal", 1, () => `Langfristigkeit und Verlässlichkeit sind mir wichtig.`),
      v("adv", 2, () => `mit Ihrem Eigentum werde ich sorgsam und verantwortungsvoll umgehen.`),
      v("ich", 1, () => `ich plane, lange zu bleiben.`),
      v("nominal", 2, () => `Ein stabiles Mietverhältnis liegt in unserem beiderseitigen Interesse – dafür stehe ich ein.`),
      v("ich", 2, () => `ich beabsichtige, langfristig zu mieten und ein verbindliches Verhältnis zu Ihnen zu pflegen.`),
      v("nominal", 2, () => `Ein pfleglicher Umgang mit der Wohnung ist für mich eine Selbstverständlichkeit.`),
      v("adv", 2, () => `an einem ruhigen, dauerhaften Mietverhältnis ist mir sehr gelegen.`),
      v("ich", 1, () => `ich lege Wert auf Verbindlichkeit und Zuverlässigkeit.`),
      v("nominal", 1, () => `Ein respektvolles Miteinander im Haus ist mir wichtig.`),
      v("adv", 2, () => `selbstverständlich halte ich mich an die Hausordnung und gehe sorgsam mit dem Objekt um.`),
      v("nominal", 2, () => `Die Einhaltung der Hausordnung und ein rücksichtsvoller Umgang mit der Nachbarschaft sind für mich selbstverständlich.`),
      v("ich", 2, () => `ich lege Wert auf ein sachliches, unkompliziertes Verhältnis zwischen Mieter und Vermietung.`),
      v("adv", 2, () => `notwendige Anzeigen und Absprachen erledige ich zeitnah und schriftlich.`),
      v("nominal", 2, () => `Eine langfristige Mietdauer läge ausdrücklich in meinem Interesse.`),
      v("ich", 2, () => `ich beabsichtige, die Wohnung über viele Jahre zu nutzen und entsprechend zu pflegen.`),
    ],
    kurz: [
      v("ich", 1, () => `ich suche ein Zuhause auf Dauer.`),
      v("nominal", 1, () => `Langfristig, ruhig, unkompliziert – so miete ich.`),
      v("adv", 1, () => `geplant ist ein langer Aufenthalt.`),
      v("ich", 1, () => `ich bleibe gerne lange.`),
      v("nominal", 1, () => `Sorgsamer Umgang ist für mich Ehrensache.`),
      v("adv", 1, () => `auf gute Nachbarschaft lege ich Wert.`),
      v("ich", 1, () => `ich mag es ruhig und verbindlich.`),
      v("nominal", 1, () => `Kein Zwischenstopp – ein Zuhause.`),
      v("ich", 1, () => `ich bleibe gern und pflege die Wohnung.`),
      v("nominal", 1, () => `Zuverlässig, ruhig, langfristig.`),
      v("adv", 1, () => `gern für viele Jahre.`),
      v("ich", 1, () => `ich bin unkompliziert.`),
      v("nominal", 1, () => `Ordnung ist mir wichtig.`),
      v("adv", 1, () => `rücksichtsvoll und leise.`),
      v("nominal", 1, () => `Leise, ordentlich, langfristig.`),
      v("ich", 1, () => `ich halte die Wohnung in Schuss.`),
      v("adv", 1, () => `keine Partys, keine Probleme.`),
      v("nominal", 1, () => `Hausordnung? Selbstverständlich.`),
      v("ich", 1, () => `ich bin gern lange am selben Ort.`),
    ],
    herzlich: [
      v("ich", 2, () => `ich würde mich von Herzen freuen, bei Ihnen für lange Zeit ein Zuhause zu finden.`),
      v("nominal", 2, () => `Ein Ort zum Bleiben, mit guter Nachbarschaft – mehr wünsche ich mir gar nicht.`),
      v("adv", 2, () => `am liebsten würde ich viele Jahre bleiben und die Wohnung pflegen wie mein Eigenes.`),
      v("ich", 1, () => `ich suche ein Zuhause zum Wohlfühlen, kein Provisorium.`),
      v("nominal", 2, () => `Gute Nachbarschaft und ein gepflegtes Haus liegen mir wirklich am Herzen.`),
      v("adv", 1, () => `bei mir zieht Ruhe ein, kein Trubel.`),
      v("ich", 2, () => `ich verspreche Ihnen: Diese Wohnung wäre bei mir in liebevollen Händen.`),
      v("nominal", 1, () => `Bleiben, ankommen, pflegen – das ist mein Plan.`),
      v("ich", 2, () => `ich möchte mich hier zuhause fühlen und die Wohnung mit Liebe in Schuss halten.`),
      v("nominal", 2, () => `Ein warmes Zuhause mit netten Nachbarn – davon träume ich schon lange.`),
      v("adv", 2, () => `ich wünsche mir einen Ort, an dem ich viele glückliche Jahre verbringen kann.`),
      v("ich", 1, () => `ich bringe Ruhe und gute Laune mit.`),
      v("nominal", 1, () => `Ein liebevoll gepflegtes Zuhause ist mein Wunsch.`),
      v("adv", 1, () => `mit offenem Herzen und Rücksicht ziehe ich ein.`),
      v("nominal", 2, () => `Ich wünsche mir ein Haus, in dem man sich im Treppenhaus grüßt.`),
      v("ich", 2, () => `ich mag es, wenn eine Wohnung gepflegt wird – Pflanzen, Ordnung, offene Fenster am Morgen.`),
      v("adv", 2, () => `mit Nachbarn komme ich gut aus, ohne ihnen auf die Nerven zu gehen.`),
      v("nominal", 2, () => `Ein Zuhause auf Jahre wäre mir viel lieber als der nächste Umzugskarton.`),
      v("ich", 2, () => `ich würde mich freuen, hier wirklich anzukommen.`),
    ],
    selbstbewusst: [
      v("ich", 2, () => `ich suche ein langfristiges Mietverhältnis – darauf können Sie zählen.`),
      v("nominal", 2, () => `Ein Mieter, der lange bleibt und die Wohnung in Schuss hält: genau das biete ich Ihnen.`),
      v("adv", 2, () => `kurzfristige Wechsel sind nicht mein Stil – ich plane in Jahren, nicht in Monaten.`),
      v("ich", 1, () => `ich bleibe, wenn es passt – und hier passt es.`),
      v("nominal", 1, () => `Langfristigkeit ist bei mir Programm.`),
      v("adv", 2, () => `mit der Wohnung gehe ich um wie mit Eigentum – sorgsam und vorausschauend.`),
      v("ich", 2, () => `ich weiß, was Vermieter sich wünschen: Ruhe, Pflege, Pünktlichkeit. Genau das bekommen Sie.`),
      v("nominal", 1, () => `Verlässlichkeit über Jahre – das ist mein Angebot.`),
      v("ich", 2, () => `ich biete Ihnen einen Mieter, der bleibt, zahlt und die Wohnung pflegt – Punkt.`),
      v("nominal", 2, () => `Ruhe, Pflege und Pünktlichkeit bekommen Sie bei mir ohne Diskussion.`),
      v("adv", 2, () => `langfristig, zuverlässig, unkompliziert – so führe ich ein Mietverhältnis.`),
      v("ich", 1, () => `ich halte, was ich verspreche.`),
      v("nominal", 1, () => `Ein Mieter ohne Überraschungen – das bin ich.`),
      v("adv", 2, () => `mit mir gibt es keine bösen Überraschungen, sondern verlässliche Nachbarschaft.`),
      v("nominal", 2, () => `Ich weiß, wie viele Bewerbungen Sie bekommen – deshalb halte ich es kurz und verbindlich.`),
      v("ich", 2, () => `ich mache Ihnen wenig Arbeit: klare Absprachen, pünktliche Zahlung, keine Diskussionen.`),
      v("adv", 2, () => `was ich zusage, steht – auch in zwei Jahren noch.`),
      v("nominal", 2, () => `Ein Mieter, der bleibt, spart Ihnen Leerstand, Inserate und Besichtigungen.`),
      v("ich", 2, () => `ich suche keine Zwischenlösung, sondern die nächsten Jahre.`),
    ],
  };

  // ABSCHLUSS / Call-to-Action: klarer Besichtigungswunsch, ohne Floskeln.
  const CTA = {
    standard: [
      v("ich", 2, () => `ich würde die Wohnung sehr gerne besichtigen – schlagen Sie einfach einen Termin vor, ich richte mich nach Ihnen.`),
      v("frage", 2, () => `wie sieht es mit einem Besichtigungstermin aus? Zeitlich bin ich flexibel.`),
      v("adv", 2, () => `über eine Einladung zur Besichtigung freue ich mich – erreichbar bin ich jederzeit.`),
      v("nominal", 1, () => `Eine Besichtigung würde mich sehr freuen.`),
      v("ich", 1, () => `ich komme gerne zur Besichtigung vorbei – auch kurzfristig.`),
      v("adv", 2, () => `wann immer es Ihnen passt: Für eine Besichtigung nehme ich mir gerne Zeit.`),
      v("ich", 2, () => `ich freue mich auf Ihre Rückmeldung und gerne auf einen Termin vor Ort.`),
      v("nominal", 2, () => `Mein Wunsch: einmal vor Ort einen Eindruck gewinnen. Sagen Sie einfach, wann es passt.`),
      v("ich", 2, () => `ich würde mir die Wohnung gerne ansehen – nennen Sie mir einfach einen passenden Termin.`),
      v("frage", 1, () => `hätten Sie diese Woche Zeit für eine Besichtigung?`),
      v("adv", 2, () => `für einen Besichtigungstermin mache ich mich gerne frei – kurzfristig oder am Wochenende.`),
      v("nominal", 1, () => `Über einen Termin vor Ort würde ich mich freuen.`),
      v("ich", 2, () => `ich freue mich, wenn wir einen Besichtigungstermin finden – ich bin zeitlich flexibel.`),
      v("adv", 1, () => `melden Sie sich gern, dann vereinbaren wir einen Termin.`),
      v("ich", 2, () => `ich richte mich ganz nach Ihrem Kalender – abends und am Wochenende genauso wie tagsüber.`),
      v("frage", 2, () => `passt Ihnen ein Termin eher unter der Woche oder am Wochenende? Beides geht bei mir.`),
      v("nominal", 2, () => `Ein kurzer Termin vor Ort sagt mehr als jede Nachricht – ich freue mich darauf.`),
      v("adv", 1, () => `ein Anruf oder eine kurze Nachricht genügt, dann bin ich da.`),
      v("ich", 2, () => `ich stelle mich Ihnen gerne persönlich vor, dann können Sie sich selbst ein Bild machen.`),
      v("nominal", 1, () => `Für einen Besichtigungstermin nehme ich mir gerne Zeit.`),
      v("frage", 1, () => `wann würde Ihnen eine Besichtigung passen?`),
      // Respektvoll und ehrlich – das kommt bei Vermietungen erfahrungsgemäß gut an.
      v("adv", 2, () => `sollte die Wohnung schon vergeben sein, sagen Sie mir gern kurz Bescheid – dann suche ich weiter.`),
      v("ich", 2, () => `ich bringe Zeit mit und stelle meine Fragen lieber vor Ort als per Nachricht.`),
      v("nominal", 2, () => `Eine Besichtigung wäre der nächste Schritt – ich richte mich nach Ihnen.`),
    ],
    formal: [
      v("ich", 2, () => `ich würde mich über die Gelegenheit zu einem Besichtigungstermin sehr freuen und richte mich zeitlich gerne nach Ihnen.`),
      v("nominal", 2, () => `Über eine Einladung zur Besichtigung würde ich mich sehr freuen; für Rückfragen stehe ich Ihnen jederzeit zur Verfügung.`),
      v("adv", 2, () => `für ein persönliches Kennenlernen im Rahmen einer Besichtigung stehe ich kurzfristig zur Verfügung.`),
      v("ich", 2, () => `ich freue mich darauf, die Wohnung persönlich in Augenschein nehmen zu dürfen.`),
      v("frage", 2, () => `dürfte ich die Wohnung bei einem Termin Ihrer Wahl besichtigen? Ich richte mich vollständig nach Ihrem Kalender.`),
      v("nominal", 1, () => `Ein Besichtigungstermin würde mich sehr freuen.`),
      v("adv", 2, () => `gerne beantworte ich vorab weitere Fragen; noch lieber überzeuge ich Sie bei einer Besichtigung persönlich.`),
      v("ich", 2, () => `ich würde die Wohnung gerne besichtigen und stehe für einen Termin flexibel bereit.`),
      v("nominal", 2, () => `Über die Möglichkeit einer Besichtigung würde ich mich sehr freuen; einen Termin richte ich gerne nach Ihnen aus.`),
      v("ich", 2, () => `ich stehe für eine Besichtigung gerne zur Verfügung und passe mich Ihrem Terminplan an.`),
      v("frage", 2, () => `wäre eine Besichtigung in den kommenden Tagen möglich? Ich richte mich nach Ihnen.`),
      v("adv", 2, () => `für ein persönliches Kennenlernen stehe ich Ihnen jederzeit gerne zur Verfügung.`),
      v("nominal", 1, () => `Eine Besichtigung würde ich sehr begrüßen.`),
      v("ich", 2, () => `ich freue mich über die Gelegenheit, die Wohnung persönlich zu besichtigen.`),
      v("nominal", 2, () => `Einen Besichtigungstermin richte ich selbstverständlich nach Ihren Möglichkeiten aus.`),
      v("ich", 2, () => `ich würde die Wohnung gerne besichtigen und bin auch kurzfristig abkömmlich.`),
      v("adv", 2, () => `selbstverständlich stehe ich Ihnen vorab für Rückfragen zur Verfügung.`),
      v("frage", 2, () => `wäre Ihnen ein Termin in der kommenden Woche recht? Ich richte mich nach Ihrer Verfügbarkeit.`),
      v("nominal", 1, () => `Für eine Terminvereinbarung erreichen Sie mich zuverlässig.`),
      v("ich", 2, () => `ich danke Ihnen für Ihre Zeit und würde mich über eine Rückmeldung sehr freuen.`),
      v("adv", 2, () => `weitere Angaben reiche ich Ihnen selbstverständlich unaufgefordert nach.`),
      v("nominal", 2, () => `Ein persönlicher Eindruck vor Ort wäre mir wichtig – gerne zu einem Termin Ihrer Wahl.`),
      v("ich", 2, () => `ich stehe für eine Besichtigung an Werktagen wie am Wochenende bereit.`),
      v("frage", 1, () => `dürfte ich einen Besichtigungstermin mit Ihnen abstimmen?`),
    ],
    kurz: [
      v("ich", 1, () => `ich komme gerne zur Besichtigung – jederzeit.`),
      v("frage", 1, () => `wann darf ich vorbeikommen?`),
      v("nominal", 1, () => `Eine Besichtigung würde mich riesig freuen!`),
      v("adv", 1, () => `für einen Termin bin ich flexibel.`),
      v("ich", 1, () => `ich würde die Wohnung gerne ansehen.`),
      v("nominal", 1, () => `Besichtigung? Sehr gerne, auch kurzfristig.`),
      v("adv", 1, () => `sagen Sie einfach, wann es passt.`),
      v("ich", 1, () => `ich freue mich auf Ihre Rückmeldung.`),
      v("frage", 1, () => `wann passt Ihnen eine Besichtigung?`),
      v("ich", 1, () => `ich schaue sie mir gern an.`),
      v("nominal", 1, () => `Termin? Jederzeit gern.`),
      v("adv", 1, () => `melden Sie sich einfach.`),
      v("ich", 1, () => `ich bin flexibel und schnell.`),
      v("frage", 1, () => `passt es diese Woche?`),
      v("ich", 1, () => `ich bin schnell erreichbar.`),
      v("nominal", 1, () => `Kurzfristig? Kein Problem.`),
      v("frage", 1, () => `wann passt es Ihnen?`),
      v("adv", 1, () => `ein Anruf genügt.`),
      v("ich", 1, () => `ich richte mich nach Ihnen.`),
      v("nominal", 1, () => `Ein Termin vor Ort wäre großartig.`),
      v("ich", 1, () => `ich bringe Zeit mit.`),
      v("frage", 1, () => `abends oder am Wochenende?`),
      v("adv", 1, () => `gerne auch spontan.`),
      v("nominal", 1, () => `Auf Ihre Nachricht freue ich mich.`),
    ],
    herzlich: [
      v("ich", 2, () => `ich würde mich riesig freuen, die Wohnung und Sie persönlich kennenzulernen!`),
      v("adv", 2, () => `am schönsten wäre es, wenn wir uns bei einer Besichtigung persönlich kennenlernen.`),
      v("nominal", 2, () => `Eine Einladung zur Besichtigung wäre für mich ein kleines Highlight – melden Sie sich, wann immer es passt.`),
      v("ich", 2, () => `ich freue mich schon jetzt darauf, die Wohnung mit eigenen Augen zu sehen.`),
      v("frage", 1, () => `wann darf ich mir Ihr schönes Angebot ansehen?`),
      v("adv", 2, () => `für eine Besichtigung nehme ich mir jederzeit gerne Zeit – auch spontan.`),
      v("nominal", 1, () => `Ein Termin vor Ort würde mich sehr glücklich machen.`),
      v("ich", 2, () => `ich melde mich gerne, wann immer es Ihnen passt – oder Sie sagen einfach kurz Bescheid.`),
      v("frage", 1, () => `wann dürfte ich vorbeischauen und mir alles ansehen?`),
      v("ich", 2, () => `ich würde die Wohnung zu gerne mit eigenen Augen sehen – ich freue mich riesig auf Ihre Nachricht.`),
      v("adv", 2, () => `für eine Besichtigung nehme ich mir mit Freude Zeit, wann immer es Ihnen passt.`),
      v("nominal", 1, () => `Ein Kennenlernen vor Ort wäre wunderbar.`),
      v("ich", 1, () => `ich freue mich auf ein Wiederlesen von Ihnen.`),
      v("adv", 1, () => `sagen Sie einfach Bescheid – ich komme gern.`),
      v("ich", 2, () => `ich würde mich freuen, wenn wir uns kennenlernen – und die Wohnung gleich mit.`),
      v("adv", 2, () => `sagen Sie einfach, wann es Ihnen passt; ich mache es möglich.`),
      v("nominal", 2, () => `Ein Termin vor Ort – und Sie sehen selbst, wer da einziehen möchte.`),
      v("frage", 1, () => `hätten Sie Lust, mir die Wohnung zu zeigen?`),
      v("ich", 2, () => `ich freue mich auf ein kurzes Gespräch, ob am Telefon oder direkt vor Ort.`),
      v("nominal", 1, () => `Über eine Nachricht von Ihnen würde ich mich sehr freuen.`),
      v("adv", 2, () => `falls die Wohnung schon weg ist: kein Problem, sagen Sie gern kurz Bescheid.`),
      v("ich", 2, () => `ich komme gerne vorbei – pünktlich, mit Zeit und guter Laune.`),
      v("frage", 2, () => `wann dürfte ich vorbeikommen? Ich richte mich ganz nach Ihnen.`),
      v("nominal", 2, () => `Ein persönliches Kennenlernen wäre mir das Liebste.`),
    ],
    selbstbewusst: [
      v("ich", 2, () => `ich bin sicher: Ein Besichtigungstermin lohnt sich für uns beide. Wann passt es Ihnen?`),
      v("nominal", 2, () => `Der nächste Schritt wäre eine Besichtigung – ich richte mich gerne nach Ihrem Terminplan.`),
      v("adv", 2, () => `gerne überzeuge ich Sie persönlich – laden Sie mich einfach zur Besichtigung ein.`),
      v("ich", 1, () => `ich bin bereit, wann immer es Ihnen passt.`),
      v("frage", 1, () => `wann können wir uns die Wohnung gemeinsam ansehen?`),
      v("nominal", 2, () => `Ein kurzer Termin vor Ort genügt – dann wissen wir beide, ob es passt.`),
      v("adv", 1, () => `lassen Sie uns einen Besichtigungstermin finden.`),
      v("ich", 2, () => `ich würde die Wohnung gerne zeitnah besichtigen und kann kurzfristig zusagen.`),
      v("frage", 1, () => `wann schauen wir uns die Wohnung gemeinsam an?`),
      v("ich", 2, () => `ich schlage vor, wir machen einen Besichtigungstermin – dann überzeugen Sie sich selbst.`),
      v("nominal", 2, () => `Der nächste logische Schritt: eine Besichtigung. Nennen Sie mir einfach Ihren Wunschtermin.`),
      v("adv", 2, () => `laden Sie mich zur Besichtigung ein – Sie werden es nicht bereuen.`),
      v("ich", 1, () => `ich bin startklar für eine Besichtigung.`),
      v("adv", 1, () => `machen wir einen Termin – zügig und unkompliziert.`),
      v("nominal", 2, () => `Ein Termin, ein Eindruck, eine Entscheidung – ich mache es Ihnen so einfach wie möglich.`),
      v("ich", 2, () => `ich bin vorbereitet, gut erreichbar und kann sofort zusagen.`),
      v("adv", 2, () => `nennen Sie mir einen Termin – ich bin pünktlich da und habe alle Antworten dabei.`),
      v("frage", 1, () => `wann darf ich mich persönlich vorstellen?`),
      v("nominal", 1, () => `Eine Besichtigung genügt, um sich ein Bild zu machen.`),
      v("ich", 2, () => `ich entscheide schnell und halte mich an das, was ich zusage.`),
      v("adv", 2, () => `das Wesentliche klären wir in zehn Minuten vor Ort.`),
      v("nominal", 2, () => `Kurzer Termin, klare Verhältnisse – so arbeite ich am liebsten.`),
      v("ich", 2, () => `ich melde mich gerne telefonisch, wenn Ihnen das schneller geht.`),
      v("frage", 2, () => `sollen wir gleich einen Termin festmachen?`),
    ],
  };

  // GRUSSFORMEL (city-Varianten nur, wenn ein Wohnort im Profil steht).
  const GRUSS = {
    standard: [
      v("g", 1, () => `Viele Grüße`), v("g", 1, () => `Beste Grüße`), v("g", 1, () => `Freundliche Grüße`),
      v("g", 1, () => `Herzliche Grüße`), v("g", 1, () => `Schöne Grüße`), v("g", 1, () => `Mit freundlichen Grüßen`),
      v("g", 1, () => `Mit besten Grüßen`), v("g", 1, () => `Viele Grüße vorab`), v("g", 1, () => `Beste Grüße und einen schönen Tag`), v("g", 1, () => `Freundliche Grüße und danke fürs Lesen`),
      v("g", 1, (c) => `Viele Grüße aus ${c.p.city}`, "city"), v("g", 1, (c) => `Beste Grüße aus ${c.p.city}`, "city"),
      v("g", 1, () => `Viele Grüße und danke für Ihre Zeit`), v("g", 1, () => `Herzlichen Dank und beste Grüße`),
      v("g", 1, () => `Schöne Grüße und danke fürs Lesen`), v("g", 1, () => `Freundliche Grüße und danke für Ihre Mühe`),
      v("g", 1, () => `Beste Grüße und schon jetzt vielen Dank`), v("g", 1, (c) => `Freundliche Grüße aus ${c.p.city}`, "city"),
      v("g", 1, (c) => `Schöne Grüße aus ${c.p.city}`, "city"),
    ],
    formal: [
      v("g", 1, () => `Mit freundlichen Grüßen`), v("g", 1, () => `Mit besten Grüßen`), v("g", 1, () => `Mit freundlichem Gruß`),
      v("g", 1, () => `Freundliche Grüße`), v("g", 1, () => `Beste Grüße`), v("g", 1, () => `Mit verbindlichen Grüßen`),
      v("g", 1, () => `Mit vielen Grüßen`), v("g", 1, () => `Mit freundlichen Grüßen und Dank`), v("g", 1, () => `Freundliche Grüße vorab`), v("g", 1, () => `Mit besten Empfehlungen`),
      v("g", 1, (c) => `Mit freundlichen Grüßen aus ${c.p.city}`, "city"), v("g", 1, () => `Mit freundlichen Grüßen und bestem Dank vorab`),
      v("g", 1, () => `Mit freundlichen Grüßen und Dank für Ihre Zeit`), v("g", 1, () => `Mit besten Grüßen und Dank vorab`),
      v("g", 1, () => `Mit freundlichen Empfehlungen`), v("g", 1, () => `Freundliche Grüße und vielen Dank für Ihre Mühe`),
      v("g", 1, () => `Mit verbindlichem Dank und freundlichen Grüßen`), v("g", 1, (c) => `Mit besten Grüßen aus ${c.p.city}`, "city"),
    ],
    kurz: [
      v("g", 1, () => `Viele Grüße`), v("g", 1, () => `Beste Grüße`), v("g", 1, () => `Schöne Grüße`),
      v("g", 1, () => `Freundliche Grüße`), v("g", 1, () => `Grüße & Dank`), v("g", 1, () => `Danke und Gruß`),
      v("g", 1, () => `Beste Grüße & Dank`), v("g", 1, () => `Liebe Grüße`), v("g", 1, () => `Viele Grüße vorab`), v("g", 1, () => `Danke im Voraus`),
      v("g", 1, (c) => `Grüße aus ${c.p.city}`, "city"), v("g", 1, () => `Bis hoffentlich bald`),
      v("g", 1, () => `Viele Grüße und Dank`), v("g", 1, () => `Herzlichen Dank`), v("g", 1, () => `Gruß und Dank`),
      v("g", 1, () => `Danke vorab`), v("g", 1, () => `Schöne Grüße & Dank`), v("g", 1, (c) => `Kurze Grüße aus ${c.p.city}`, "city"),
    ],
    herzlich: [
      v("g", 1, () => `Herzliche Grüße`), v("g", 1, () => `Liebe Grüße`), v("g", 1, () => `Warme Grüße`),
      v("g", 1, () => `Viele liebe Grüße`), v("g", 1, () => `Herzlichst`), v("g", 1, () => `Mit herzlichen Grüßen`),
      v("g", 1, () => `Von Herzen`), v("g", 1, () => `Ganz liebe Grüße`), v("g", 1, () => `Alles Liebe`), v("g", 1, () => `Herzliche Grüße und einen schönen Tag`),
      v("g", 1, (c) => `Liebe Grüße aus ${c.p.city}`, "city"), v("g", 1, () => `Sonnige Grüße`),
      v("g", 1, () => `Herzliche Grüße und danke fürs Lesen`), v("g", 1, () => `Ganz herzliche Grüße`),
      v("g", 1, () => `Liebe Grüße und einen schönen Tag`), v("g", 1, () => `Herzlichen Dank und liebe Grüße`),
      v("g", 1, () => `Herzliche Grüße und alles Gute`), v("g", 1, (c) => `Herzliche Grüße aus ${c.p.city}`, "city"),
    ],
    selbstbewusst: [
      v("g", 1, () => `Mit freundlichen Grüßen`), v("g", 1, () => `Beste Grüße`), v("g", 1, () => `Viele Grüße`),
      v("g", 1, () => `Freundliche Grüße`), v("g", 1, () => `Mit besten Grüßen`), v("g", 1, () => `Mit klarem Gruß nach vorn`),
      v("g", 1, () => `Beste Grüße und bis bald`), v("g", 1, () => `Auf ein Kennenlernen`), v("g", 1, () => `Beste Grüße vorab`), v("g", 1, () => `Mit einem klaren Gruß`),
      v("g", 1, (c) => `Viele Grüße aus ${c.p.city}`, "city"), v("g", 1, () => `Bis bald vor Ort`),
      v("g", 1, () => `Beste Grüße und danke für Ihre Zeit`), v("g", 1, () => `Freundliche Grüße und auf bald`),
      v("g", 1, () => `Mit besten Grüßen und Dank vorab`), v("g", 1, () => `Beste Grüße, ich freue mich auf Ihre Antwort`),
      v("g", 1, (c) => `Beste Grüße aus ${c.p.city}`, "city"), v("g", 1, () => `Viele Grüße und bis dahin`),
    ],
  };

  /* ================= Anrede ================= */
  function greeting(mode, flat) {
    if (flat && flat.salutation && WBA.salutation) return WBA.salutation.greeting(flat.salutation, mode);
    const hallo = (flat && flat.contactHallo || "").trim();
    if (hallo) return "Hallo " + hallo + ",";
    const anrede = (flat && flat.contactAnrede || "").trim();
    const cname = (flat && flat.contactName || "").trim();
    if (anrede && cname) return (anrede === "Frau" ? "Sehr geehrte Frau" : "Sehr geehrter Herr") + " " + cname + ",";
    return "Sehr geehrte Damen und Herren,";
  }
  function isInformal(flat) {
    return !!(flat && (flat.contactHallo || (flat.salutation && flat.salutation.category === "vorname")));
  }

  /* ================= Komposition ================= */
  function filterByNeed(pool, c) {
    return pool.filter((x) => {
      if (x.need === "det") return c.det.length > 0;
      if (x.need === "frei") return !!c.frei;
      if (x.need === "city") return !!(c.p && c.p.city);
      return true;
    });
  }

  function composeOnce(p, flat, mode, info, opts) {
    const c = makeCtx(p, flat, mode, info, opts);
    const M = RANGE[mode] ? mode : "standard";
    let prevTag = null;
    const lens = [];
    const take = (pool, salt) => {
      const filtered = filterByNeed(pool, c);
      if (!filtered.length) return "";
      const chosen = pick(filtered, salt + ":" + M, prevTag);
      prevTag = chosen.s;
      lens.push(chosen.l);
      let t = "";
      try { t = (chosen.f(c) || "").trim(); } catch (e) { t = ""; }
      return t;
    };

    const parts = {
      einstieg: take(EINSTIEG[M], "einstieg"),
      bezug: take(BEZUG[M], "bezug"),
      selbst: take(SELBST[M], "selbst"),
      vertrauen: take(vertrauenPool(c), "vertrauen"),
      partner: partnerSentence(c),
      docs: docsSentence(c),
      zusatz: take(ZUSATZ[M], "zusatz"),
      zusatz2: take(ZUSATZ[M], "zusatz2"), // Reserve fürs Längen-Fitting (nur bei Unterlänge aktiv)
      cta: take(CTA[M], "cta"),
      gruss: take(GRUSS[M], "gruss"),
    };
    if (parts.zusatz2 === parts.zusatz) parts.zusatz2 = ""; // nie denselben Satz doppelt

    /* Zwei Absätze hintereinander mit demselben Auftakt lesen sich wie ein
       Formular („ich bin auf Ihre Wohnung gestoßen …" / „Ich bin Max Müller …").
       Einzelne Sätze umzuschreiben hilft dagegen nicht – es ist eine Frage der
       Kombination, also wird der zweite Baustein neu gezogen. */
    const auftakt = (s) => (s || "").trim().toLowerCase().replace(/^[^a-zäöüß]+/, "").split(/\s+/).slice(0, 2).join(" ");
    const NACHZIEHEN = [
      ["einstieg", "selbst", () => SELBST[M]],
      ["selbst", "vertrauen", () => vertrauenPool(c)],
      ["vertrauen", "zusatz", () => ZUSATZ[M]],
      ["zusatz", "cta", () => CTA[M]],
    ];
    NACHZIEHEN.forEach(([vorne, hinten, poolFn]) => {
      let versuch = 0;
      while (parts[vorne] && parts[hinten] && auftakt(parts[vorne]) === auftakt(parts[hinten]) && versuch < 4) {
        parts[hinten] = take(poolFn(), hinten + ":neu" + versuch);
        versuch++;
      }
    });

    // Satzlängen mischen: wenn alle Bausteine derselben Längenklasse angehören,
    // den CTA gegen eine andere Längenklasse tauschen.
    if (lens.length > 2 && lens.every((l) => l === lens[0])) {
      const alt = filterByNeed(CTA[M], c).filter((x) => x.l !== lens[0]);
      if (alt.length) parts.cta = alt[Math.floor(Math.random() * alt.length)].f(c).trim();
    }

    // partner ist bewusst NICHT in dropOrder von fitLength: Wer mit einzieht und
    // wovon die Miete bezahlt wird, ist wichtiger als jeder Zusatzsatz.
    const include = { bezug: true, docs: !!parts.docs, zusatz: true, zusatz2: false, partner: !!parts.partner };
    return { c, M, parts, include };
  }

  function assemble(draft, p, flat, mode) {
    const { parts, include } = draft;
    const paras = [greeting(mode, flat)];
    paras.push(parts.einstieg + (include.bezug && parts.bezug ? " " + cap(parts.bezug) : ""));
    paras.push(cap(parts.selbst).replace(/\s+/g, " ").trim());
    paras.push(cap(parts.vertrauen)
      + (include.partner && parts.partner ? " " + cap(parts.partner) : "")
      + (include.docs && parts.docs ? " " + cap(parts.docs) : ""));
    if (include.zusatz && parts.zusatz) {
      paras.push(cap(parts.zusatz) + (include.zusatz2 && parts.zusatz2 ? " " + cap(parts.zusatz2) : ""));
    }
    paras.push(cap(parts.cta));
    const contact = [p.email, p.phone].filter(Boolean).join(" · ");
    // Bei gemeinsamer Bewerbung unterschreiben beide – so erwartet es die
    // Vermietung, wenn beide in den Mietvertrag sollen.
    const mit = partnerInfo(p);
    const unterschrift = [p.name, mit && mit.name].filter(Boolean).join(" und ");
    paras.push(parts.gruss + "\n" + unterschrift + (contact ? "\n" + contact : ""));

    // Groß-/Kleinschreibung des Fließtext-Anfangs: nach förmlicher Anrede klein
    // (Varianten sind so geschrieben), nach „Hallo <Name>," groß.
    if (isInformal(flat)) paras[1] = cap(paras[1]);
    let text = paras.filter(Boolean).join("\n\n");

    // Constraint: maximal EIN Ausrufezeichen pro Text.
    let bang = false;
    text = text.replace(/!/g, () => (bang ? "." : ((bang = true), "!")));
    return text;
  }

  // Länge in den Zielkorridor bringen: optionale Bausteine entfernen/ergänzen.
  function fitLength(draft, p, flat, mode) {
    const [min, max] = RANGE[draft.M];
    let text = assemble(draft, p, flat, mode);
    const dropOrder = ["zusatz2", "zusatz", "docs", "bezug"];
    for (const k of dropOrder) {
      if (wc(text) <= max) break;
      if (draft.include[k]) { draft.include[k] = false; text = assemble(draft, p, flat, mode); }
    }
    if (wc(text) < min) {
      for (const k of ["zusatz", "docs", "bezug", "zusatz2"]) {
        if (wc(text) >= min) break;
        if (!draft.include[k] && draft.parts[k]) { draft.include[k] = true; text = assemble(draft, p, flat, mode); }
      }
    }
    return text;
  }

  /**
   * Erzeugt EINEN Anschreiben-Kandidaten (synchron): Bausteine mit Struktur-/
   * Längen-Constraints komponieren, Länge in den Tonlagen-Korridor fitten,
   * Floskel-Blacklist HART prüfen (bei Treffer: Neukomposition).
   * Für Anti-Wiederholung über mehrere Bewerbungen hinweg generate() nutzen.
   * @param {Object} p - Nutzerprofil (nur vorhandene Fakten werden verwendet).
   * @param {{salutation?: Object, contactAnrede?: string, contactName?: string}} flat
   * @param {string} mode - Tonlage (standard|formal|kurz|herzlich|selbstbewusst).
   * @param {Object} [info] - Extrahierte Anzeigen-Daten; nur echte Details landen im Text.
   * @param {{docs?: Object}} [opts] - Unterlagen-Checkliste (nur Abgehaktes wird erwähnt).
   * @returns {string} Fertiges Anschreiben.
   */
  function buildLetter(p, flat, mode, info, opts) {
    p = p || {}; flat = flat || {};
    const M = RANGE[mode] ? mode : "standard";
    const min = RANGE[M][0];
    let text = "", best = "", tries = 0;
    do {
      const draft = composeOnce(p, flat, M, info, opts);
      text = fitLength(draft, p, flat, M);
      tries++;
      // Nutzertext (persönliche Beschreibung) von der Prüfung ausnehmen –
      // wir zensieren nur unsere eigenen Formulierungen.
      if (containsBlacklisted(text, p.about)) continue;
      // Unterlänge lässt sich nicht immer wegfitten: Sind alle Bausteine schon
      // drin und der Text bleibt unter dem Korridor, hilft nur ein neuer Wurf.
      // Deshalb bis zu sechs Versuche und am Ende der längste saubere Kandidat.
      if (!best || wc(text) > wc(best)) best = text;
      if (wc(text) >= min) return text;
    } while (tries < 6);
    return best || text;
  }

  /* ================= Anti-Wiederholung über Bewerbungen hinweg ================= */
  /**
   * Wie buildLetter, aber mit Anti-Wiederholung über Bewerbungen hinweg:
   * Der neue Text muss unter TEXT_OVERLAP_LIMIT (40 %) Trigramm-Überlappung mit
   * JEDEM der letzten TEXT_HISTORY_SIZE (20) Texte bleiben; sonst wird neu
   * gewürfelt (max. TEXT_MAX_ATTEMPTS Versuche, dann der beste Kandidat).
   * Der Fingerprint des Ergebnisses wird via WBA.store persistiert – dadurch
   * liefert auch „Neu generieren" garantiert eine spürbar andere Variante.
   * @param {Object} p - Nutzerprofil (name ist Pflicht, Rest optional).
   * @param {{salutation?: Object}} flat - Wohnungs-Kontext inkl. Anrede-Klassifikation.
   * @param {string} mode - Tonlage (standard|formal|kurz|herzlich|selbstbewusst).
   * @param {Object} info - Extrahierte Anzeigen-Daten (WBA.parse.extractFlatInfo).
   * @param {{docs?: Object}} [opts] - Unterlagen-Checkliste u. a.
   * @returns {Promise<string>} Fertiges Anschreiben.
   */
  async function generate(p, flat, mode, info, opts) {
    const C = WBA.CONFIG || {};
    const limit = C.TEXT_OVERLAP_LIMIT || 0.4;
    const attempts = C.TEXT_MAX_ATTEMPTS || 5;
    const store = WBA.store;
    let history = [];
    try { if (store && store.getTextFPs) history = await store.getTextFPs(); } catch (e) {}
    let best = null;
    for (let i = 0; i < attempts; i++) {
      const text = buildLetter(p, flat, mode, info, opts);
      const tri = trigrams(text);
      let worst = 0;
      for (const fp of history) worst = Math.max(worst, overlapRatio(tri, fp.h || []));
      if (!best || worst < best.worst) best = { text, tri, worst };
      if (worst < limit) break;
    }
    try {
      if (store && store.pushTextFP) await store.pushTextFP({ ts: Date.now(), h: Array.from(best.tri) });
    } catch (e) { if (WBA.log) WBA.log.debug("Fingerprint nicht gespeichert:", e); }
    return best.text;
  }

  /* ================= Nachfass-Text (Bewerbungs-Cockpit) ================= */
  // Kurzer, höflicher Nachfass zu einer bestehenden Bewerbung (Tracker-Eintrag).
  // Gleiche Grundsätze wie der Brief-Generator: nur vorhandene Daten (Ort,
  // Bewerbungsdatum, Name), Blacklist-frei, tonlagen-bewusst über entry.ton.
  const FOLLOWUP_BODY = {
    standard: [
      (w, d) => `ich habe mich${d} um ${w} beworben und wollte freundlich nachfragen, ob die Wohnung noch zu vergeben ist. Mein Interesse besteht unverändert – zur Besichtigung komme ich gerne auch kurzfristig.`,
      (w, d) => `zu meiner Bewerbung${d} um ${w} wollte ich kurz nachhaken: Gibt es schon Neuigkeiten? Ich bin weiterhin sehr interessiert und zeitlich flexibel.`,
      (w, d) => `ich möchte mich kurz in Erinnerung bringen – meine Bewerbung um ${w} habe ich Ihnen${d} geschickt. Falls Ihnen noch Unterlagen fehlen, reiche ich sie sofort nach.`,
    ],
    formal: [
      (w, d) => `ich habe mich${d} um ${w} beworben und erlaube mir die höfliche Nachfrage, ob die Wohnung noch verfügbar ist. Mein Interesse besteht unverändert; für eine Besichtigung stehe ich weiterhin kurzfristig zur Verfügung.`,
      (w, d) => `zu meiner Bewerbung${d} um ${w} möchte ich mich freundlich nach dem Stand der Vergabe erkundigen. Gerne reiche ich fehlende Unterlagen umgehend nach.`,
      (w, d) => `gestatten Sie mir eine kurze Nachfrage zu meiner Bewerbung${d} um ${w}: Ist bereits eine Entscheidung gefallen? Ich bin weiterhin ernsthaft interessiert.`,
    ],
    kurz: [
      (w, d) => `kurze Nachfrage zu meiner Bewerbung${d} um ${w}: Ist die Wohnung noch frei? Ich bin weiterhin sehr interessiert – Besichtigung gerne jederzeit.`,
      (w, d) => `ich wollte kurz nachhaken: Gibt es zu meiner Bewerbung${d} um ${w} schon einen Stand? Mein Interesse besteht unverändert.`,
      (w, d) => `nur ein kurzes Signal: ${w} interessiert mich nach wie vor sehr. Eine Besichtigung passt bei mir jederzeit.`,
    ],
    herzlich: [
      (w, d) => `ich denke immer noch an ${w} – deshalb wollte ich freundlich nachfragen, ob sie noch zu haben ist. Über ein kurzes Lebenszeichen von Ihnen freue ich mich sehr.`,
      (w, d) => `meine Bewerbung${d} um ${w} liegt Ihnen ja bereits vor – ich wollte mich nur kurz in Erinnerung bringen. Die Wohnung wäre für mich nach wie vor ein Volltreffer.`,
      (w, d) => `ich wollte lieb nachfragen, ob es zu meiner Bewerbung${d} um ${w} schon Neuigkeiten gibt – die Vorfreude ist jedenfalls ungebrochen.`,
    ],
    selbstbewusst: [
      (w, d) => `ich habe mich${d} um ${w} beworben – und mein Interesse ist seither eher gewachsen. Falls die Entscheidung noch offen ist: Ich stehe bereit, auch kurzfristig.`,
      (w, d) => `ein kurzes Update von meiner Seite: ${w} steht bei mir weiterhin ganz oben auf der Liste. Ein Besichtigungstermin lässt sich bei mir jederzeit einrichten.`,
      (w, d) => `zu meiner Bewerbung${d} um ${w}: Falls noch nicht vergeben, würde ich gerne den nächsten Schritt gehen – sagen Sie einfach, wann es passt.`,
    ],
  };
  /**
   * Höflicher Nachfass-Text zu einem Tracker-Eintrag (Status „beworben").
   * @param {{ort?: string, ton?: string, appliedAt?: number}} entry - Tracker-Eintrag.
   * @param {{name?: string}} p - Nutzerprofil (Name für die Grußzeile).
   * @returns {string} Fertiger Nachfass-Text.
   */
  function followUp(entry, p) {
    entry = entry || {}; p = p || {};
    const mode = FOLLOWUP_BODY[entry.ton] ? entry.ton : "standard";
    const w = "Ihre Wohnung" + (entry.ort ? " in " + entry.ort : "");
    const d = entry.appliedAt ? " am " + new Date(entry.appliedAt).toLocaleDateString("de-DE") : "";
    const anrede = (mode === "formal" || mode === "selbstbewusst") ? "Sehr geehrte Damen und Herren," : "Guten Tag,";
    const gruss = mode === "formal" ? "Mit freundlichen Grüßen" : mode === "herzlich" ? "Herzliche Grüße" : "Viele Grüße";
    const pool = FOLLOWUP_BODY[mode];
    const body = pool[Math.floor(Math.random() * pool.length)](w, d);
    return anrede + "\n\n" + body + "\n\n" + gruss + "\n" + (p.name || "");
  }

  WBA.letter = {
    buildLetter,   // synchron: ein Kandidat (Constraints + Blacklist)
    generate,      // async: zusätzlich Anti-Wiederholung über die letzten 20 Texte
    followUp,      // Nachfass-Text zu einer bestehenden Bewerbung
    greeting,
    containsBlacklisted,
    trigrams,
    overlapRatio,
    BLACKLIST,
    RANGE,
    cap,
    partnerInfo,   // zweite Person aufbereitet (Kasus-Tabelle) – für Tests und UI
    REL,           // Beziehungs-Varianten inkl. Dativ
  };
})(typeof self !== "undefined" ? self : this);
