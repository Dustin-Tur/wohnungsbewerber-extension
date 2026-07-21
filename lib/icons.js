/* WBA.icons – schlichte Inline-SVG-Icons (Lucide-artig, selbst gezeichnet).
   Ersetzt die Emojis in Dashboard und Overlay (Design 2.1.0 „Ruhig &
   professionell"): einheitliche Optik auf jedem System, färbbar über
   currentColor. Alle Strings sind STATISCH (kein Nutzer-Input) → gefahrlos
   per innerHTML einsetzbar, auch im Shadow DOM des Overlays.
   Nutzung: WBA.icons.svg("search")  bzw.  WBA.icons.svg("search", 16). */
(function (root) {
  "use strict";
  const WBA = (root.WBA = root.WBA || {});

  // Nur die Pfad-Inhalte; Rahmen (svg-Tag) kommt aus svg().
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V21h14V9.8"/><path d="M10 21v-6h4v6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.4 5h13.2L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="m4 12.5 5 5L20 6.5"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>',
    refresh: '<path d="M21 4v6h-6"/><path d="M20.5 10a8.5 8.5 0 1 0 .3 3.5"/>',
    skipForward: '<path d="m5 5 8 7-8 7Z"/><path d="M19 5v14"/>',
    square: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    clipboard: '<path d="M9 4h6v3H9z"/><path d="M15 4h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14.5 0 18"/><path d="M12 3c-3 3.5-3 14.5 0 18"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M11 12 21 2"/><path d="m16 7 3 3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z"/>',
    x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
    minus: '<path d="M5 12h14"/>',
    arrowRight: '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>',
    play: '<path d="m7 5 12 7-12 7Z"/>',
    star: '<path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7Z"/>',
    alert: '<path d="M12 3 2.5 20h19Z"/><path d="M12 9v5"/><path d="M12 17.2v.6"/>',
    message: '<path d="M21 12a8 8 0 0 1-8 8H4l2.2-3.3A8 8 0 1 1 21 12Z"/>',
  };

  /**
   * SVG-String für ein Icon.
   * @param {string} name - Schlüssel aus dem Icon-Set (unbekannt → leerer String).
   * @param {number} [size] - Kantenlänge in px; ohne Angabe 1em (skaliert mit font-size).
   * @returns {string}
   */
  function svg(name, size) {
    const body = P[name];
    if (!body) return "";
    const s = size ? size + "px" : "1em";
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>";
  }

  WBA.icons = { svg, names: Object.keys(P) };
})(typeof self !== "undefined" ? self : this);
