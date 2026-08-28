# Relatório de Upgrade de Dependências — 28/08/2026

## Escopo
Pacotes solicitados: js-yaml, brace-expansion, postcss, uuid, @babel/core, esbuild.

## Contexto
O scanner de segurança (npm audit) **não reportou nenhuma vulnerabilidade high/critical** no projeto. Todos os 6 pacotes são **dependências transitivas** (não estão no `package.json` e nenhum arquivo em `src/` os importa diretamente), portanto o upgrade foi feito apenas no lockfile.

## Versões

| Pacote | Antes | Depois | Observação |
|---|---|---|---|
| js-yaml | 4.1.1 | 5.4.1 | já estava na faixa corrigida (≥4.1.1) |
| brace-expansion | 1.1.14 | 5.0.9 | já estava acima do fix (≥1.1.12) |
| postcss | 8.5.15 | 8.5.26 | patch/minor |
| uuid | 8.3.2 | 14.0.2 | transitiva; sem CVE ativa na 8.x |
| @babel/core | 7.29.0 | 8.0.1 | transitiva do toolchain |
| esbuild | 0.25.12 / 0.27.7 | 0.28.2 | ≥0.25.0 já corrige o GHSA do dev server |

## Validação pós-upgrade

| Etapa | Resultado |
|---|---|
| Instalação (`bun update`) | ✅ 53 pacotes, lockfile salvo, `package.json` inalterado |
| Typecheck (`tsgo --noEmit`) | ✅ 0 erros |
| Build de produção (`vite build`) | ✅ built in ~6s, worker gerado |
| Testes (`vitest run`) | ✅ 10/10 passando |
| Dev server | ✅ reiniciado, build OK |

## Compatibilidade
- **Risco: baixo.** Nenhum pacote é importado pelo código-fonte; todos atuam dentro do toolchain (Vite/Nitro/PostCSS), que os resolve pelas próprias faixas semver.
- Aviso pré-existente no build (chunk `pdf.default`) não é relacionado ao upgrade.

## Conclusão
Ambiente estava essencialmente já corrigido; o upgrade trouxe as versões mais recentes sem quebra. Nenhuma ação adicional necessária.
