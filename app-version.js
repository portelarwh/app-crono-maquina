'use strict';

/* ============================================================
   ⚠ FONTE ÚNICA DE VERSÃO DO APP — carregado ANTES dos demais scripts.
   REGRA PERMANENTE — a cada mudança publicada:
     1. Incremente APP_VERSION abaixo;
     2. Atualize APP_RELEASE_DATE (data da publicação);
     3. Atualize o CACHE_NAME no sw.js e version.json.
   Prefira rodar ./bump-version.sh X.Y.Z — ele faz os 3 passos
   e ainda atualiza as queries ?v= do index.html.
   ============================================================ */
var APP_VERSION = 'v5.2.6';           // fonte única
var APP_RELEASE_DATE = '2026-08-09';  // data em que esta versão foi publicada

window.APP_VERSION = APP_VERSION;
window.APP_RELEASE_DATE = APP_RELEASE_DATE;
