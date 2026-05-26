#!/usr/bin/env bash
# Uso: ./bump-version.sh 5.2.3
set -e

NEW="$1"
if [ -z "$NEW" ]; then
  echo "Uso: $0 <nova-versão>  (ex: 5.2.3)"
  exit 1
fi

FILES=(
  app-version.js
  version.json
  sw.js
  pwa-ui.js
  app.js
  general-improvements.js
  report-enhancements.js
)

for f in "${FILES[@]}"; do
  # substitui qualquer v5.X.Y pelo novo valor
  sed -i "s/v5\.[0-9]\+\.[0-9]\+/v${NEW}/g; s/5\.[0-9]\+\.[0-9]\+/${NEW}/g" "$f"
done

echo "✓ versão atualizada para v${NEW}"
grep -h "APP_VERSION\|CACHE_NAME\|\"version\"" app-version.js sw.js version.json | head -5
