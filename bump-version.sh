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

# index.html: atualiza SOMENTE as queries ?v=X.Y.Z (o sed genérico corromperia
# números soltos como coordenadas de path SVG). Mantém index alinhado com o
# pré-cache do sw.js — sem isso o cache do SW nunca é usado e o offline quebra.
sed -i "s/?v=[0-9]\+\.[0-9]\+\.[0-9]\+/?v=${NEW}/g" index.html

# data de publicação: APP_RELEASE_DATE (app-version.js) e "released" (version.json)
TODAY="$(date +%Y-%m-%d)"
sed -i "s/APP_RELEASE_DATE = '[0-9-]\+'/APP_RELEASE_DATE = '${TODAY}'/" app-version.js
sed -i "s/\"released\": \"[0-9-]\+\"/\"released\": \"${TODAY}\"/" version.json

echo "✓ versão atualizada para v${NEW} (${TODAY})"
grep -h "APP_VERSION\|CACHE_NAME\|\"version\"" app-version.js sw.js version.json | head -5
