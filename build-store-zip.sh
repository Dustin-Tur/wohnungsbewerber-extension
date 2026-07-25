#!/bin/sh
# Baut das Store-ZIP reproduzierbar aus dem Repo-Stand (QUA-11).
#
# WARUM: Bisher wurde das ZIP von Hand gepackt – so landete datenschutz.html
# im ausgelieferten Paket, obwohl ihr eigener Pflege-Kommentar das verbietet.
# Dieses Skript packt eine feste WHITELIST; alles andere (tests/, *.md,
# datenschutz.html, AUDIT/, landing/, Marketing) kann gar nicht erst hinein.
#
# AUFRUF:  sh build-store-zip.sh        → dist/wohnungsbewerber-<version>.zip
# Reproduzierbar: Dateiliste sortiert, Zeitstempel normalisiert, zip -X –
# derselbe Repo-Stand ergibt byte-identische ZIPs. Nur macOS/Linux-Bordmittel
# (sh, python3, zip); kein Paketmanager, kein Build-Schritt im Code selbst.
set -eu
cd "$(dirname "$0")"

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

# WHITELIST – exakt das, was die Erweiterung zum Laufen braucht:
FILES="manifest.json background.js content.js dashboard.html dashboard.js popup.html popup.js shared.css"
DIRS="_locales icons lib"

for f in $FILES; do
  [ -f "$f" ] || { echo "FEHLER: $f fehlt" >&2; exit 1; }
  cp "$f" "$STAGE/"
done
for d in $DIRS; do
  [ -d "$d" ] || { echo "FEHLER: $d/ fehlt" >&2; exit 1; }
  cp -R "$d" "$STAGE/"
done

# .DS_Store-Reste raus, Zeitstempel normalisieren (Reproduzierbarkeit)
find "$STAGE" -name ".DS_Store" -delete
find "$STAGE" -exec touch -t 202601010000 {} +

mkdir -p dist
OUT="dist/wohnungsbewerber-$VERSION.zip"
rm -f "$OUT"
( cd "$STAGE" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | zip -q -X "$OLDPWD/$OUT" -@ )

echo "OK: $OUT"
unzip -l "$OUT" | tail -1
