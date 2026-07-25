/* QUA-09: Statische Analyse – REINES Entwicklungswerkzeug.
   Läuft ausschließlich in der CI über `npx --yes eslint@9 .` (siehe
   .github/workflows/tests.yml); lokal ist kein Node nötig, es gibt bewusst
   KEIN package.json, und der ausgelieferte Code bleibt abhängigkeitsfrei –
   dieses File ist Konfiguration, kein Code im Auslieferpfad (die
   Build-Whitelist in build-store-zip.sh kennt es nicht).
   Bewusst OHNE tsc --checkJs gestartet: ohne @types/chrome würde jede
   chrome.*-Zeile als Fehler rauschen; nachrüstbar, wenn gewünscht. */
"use strict";
const js = require("@eslint/js");

const browserGlobals = {
  window: "readonly", document: "readonly", location: "readonly",
  history: "readonly", navigator: "readonly", localStorage: "readonly",
  sessionStorage: "readonly", console: "readonly", fetch: "readonly",
  setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly",
  clearInterval: "readonly", URL: "readonly", URLSearchParams: "readonly",
  Blob: "readonly", MutationObserver: "readonly", AbortController: "readonly",
  Event: "readonly", KeyboardEvent: "readonly", CSS: "readonly",
  confirm: "readonly", alert: "readonly", prompt: "readonly",
  self: "readonly", globalThis: "readonly", crypto: "readonly",
  HTMLInputElement: "readonly", HTMLTextAreaElement: "readonly",
  HTMLSelectElement: "readonly", FileReader: "readonly",
  getComputedStyle: "readonly", requestAnimationFrame: "readonly",
  matchMedia: "readonly", importScripts: "readonly",
};

module.exports = [
  js.configs.recommended,
  {
    files: ["*.js", "lib/**/*.js"],
    ignores: [],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: Object.assign({ chrome: "readonly", WBA: "writable" }, browserGlobals),
    },
    rules: {
      // Defensive leere catches sind hier bewusst und kommentiert (Fremd-DOM).
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: Object.assign(
        {
          chrome: "readonly", WBA: "writable",
          // JXA-Runner (osascript) und Node-Weiche der Suiten:
          ObjC: "readonly", $: "readonly",
          require: "readonly", module: "writable", process: "readonly",
          __dirname: "readonly",
        },
        browserGlobals
      ),
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
    },
  },
  {
    ignores: ["landing/**", "AUDIT/**", "dist/**", "store-assets/**", "video-pipeline/**", "tiktok-ads/**", "tests/fixtures/**"],
  },
];
