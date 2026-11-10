# Cronoanálise Pro — Crono Máquina

Aplicação web (Vanilla JS, PWA) para cronoanálise industrial: medição de ciclos, capacidade, takt time, eficiência e estabilidade de processos.

## Estrutura

```
├── index.html
├── styles.css
├── theme-init.js          # alternância de tema (carregado no <head>)
├── time-units.js          # unidade de exibição do tempo (s / cmin / min)
├── app.js                 # estado, timer, render, persistência
├── energy.js              # potência (W/kW) → kWh/peça, kWh/turno, custo
├── pwa-ui.js              # splash, registro do SW, carregamento do engine A4
├── report-enhancements.js # geração de PNG/PDF em layout A4
├── sw.js                  # service worker (offline + precache)
├── manifest.json
└── assets/
```

## Funcionalidades

- Cronômetro com **iniciar / pausar / zerar / lap**, persistido em `localStorage`.
- Dois modos de análise: **Tempo por ciclo** e **Produção por intervalo** (com janela de quantidade `Durante` ou `Depois`).
- Cálculos automáticos: capacidade, ciclo médio, mín/máx, desvio padrão, **índice de estabilidade**, **eficiência vs. meta**.
- **Takt Time** e **Meta** sincronizados automaticamente — ao mudar a unidade (un/h ↔ un/min) os valores são convertidos.
- Curva de controle com LSC/LIC e linha de takt; histograma de distribuição em 5 bins.
- Edição inline da quantidade por amostra; observação opcional por lap; remoção individual.
- **Atalho:** `Enter` em "Equipamento" ou "Analista" inicia o timer (precisa do equipamento preenchido).
- **Cronômetro decimal**: exibição em segundos, **minutos centesimais (cmin)** ou **minutos decimais** — só muda a exibição/exportação; dados gravados em ms.
- **Energia**: potência operando/parada (W ou kW) + tarifa → Wh/peça, Wh/ciclo, % de energia em paradas, kWh e R$ por turno.
- **Energia × OEE**: energia perdida por Disponibilidade, Performance e Qualidade, eficiência energética, Wh/peça boa vs. ideal e custo da perda por turno.
- Suporte a **separador decimal vírgula** (PT-BR) em todos os campos numéricos.
- Exportações: **CSV** (UTF-8 com BOM, vírgula decimal), **PNG**, **PDF A4** (com paginação automática para >20 amostras), compartilhamento direto via **WhatsApp** / `navigator.share` quando disponível.
- Alternância de tema **claro / escuro** com `prefers-color-scheme` como padrão e persistência em `localStorage`.
- **PWA instalável** (manifest, ícones, splash) com **suporte offline** via service worker.

## Como usar

Abrir `index.html` em qualquer navegador moderno, ou servir via GitHub Pages / qualquer host estático.

```bash
# servidor local rápido
python3 -m http.server 8000
# depois abra http://localhost:8000
```

## Segurança

- Conteúdo dinâmico do histórico passa por escape de atributos para prevenir XSS via `localStorage` adulterado.
- `Content-Security-Policy` restringe scripts a `self` + `cdnjs.cloudflare.com`.
- Sem handlers `onclick=` inline; toda a interação usa event delegation.

## Status

🚀 v5.3.1 — em produção
