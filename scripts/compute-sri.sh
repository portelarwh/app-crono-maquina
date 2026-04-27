#!/usr/bin/env bash
# Calcula hashes SRI (sha384) das libs externas e injeta `integrity=` no index.html.
# Uso: bash scripts/compute-sri.sh
# Requisitos: curl, openssl, sed, perl. Precisa de acesso à internet.

set -euo pipefail

cd "$(dirname "$0")/.."

declare -A LIBS=(
  ["html2canvas/1.4.1/html2canvas.min.js"]="html2canvas"
  ["jspdf/2.5.1/jspdf.umd.min.js"]="jspdf"
)

for path in "${!LIBS[@]}"; do
  url="https://cdnjs.cloudflare.com/ajax/libs/${path}"
  name="${LIBS[$path]}"
  echo "→ baixando ${name}…"
  hash=$(curl -fsSL --max-time 30 "$url" | openssl dgst -sha384 -binary | openssl base64 -A)
  if [ -z "$hash" ]; then
    echo "✗ falhou ao computar SRI para ${name}" >&2
    exit 1
  fi
  echo "   sha384-${hash}"

  # Injeta integrity= antes de crossorigin= na linha que contém a URL,
  # removendo o marcador data-sri-pending. Idempotente.
  perl -0777 -i -pe "
    s|(<script src=\"\\Q${url}\\E\")(\\s+data-sri-pending)?(\\s+integrity=\"sha384-[^\"]+\")?|\$1 integrity=\"sha384-${hash}\"|g
  " index.html
done

echo "✓ index.html atualizado. Diff:"
git --no-pager diff -- index.html || true
