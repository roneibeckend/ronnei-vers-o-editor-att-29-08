# Auditoria dos findings JWT — GitGuard (scan cmtdjpfng0051khutewkx7fl1)

Data: 2026-08-28 · Branch `main` · commit `87db45d3ea43`

## Findings analisados

O relatório aponta 3 findings GITLEAKS (regra `jwt`) + 3 findings SEMGREP
(`detected-jwt-token`) — na prática são **o mesmo token detectado nos mesmos
locais** por dois scanners. O relatório FREE não mostra arquivo/linha, então
varri o repositório inteiro (incluindo arquivos ocultos) atrás do padrão
`eyJ....`.

## Resultado da varredura

| # | Arquivo | Valor | Tipo | Ambiente afetado | Real ou mock? |
|---|---|---|---|---|---|
| 1 | `src/integrations/supabase/client.ts` (linha 7) | `SUPABASE_PUBLISHABLE_KEY` | JWT Supabase, claim `"role": "anon"` | Browser (todos: preview e produção) | Real, porém **público por design** |
| 2 | `.env` → `SUPABASE_PUBLISHABLE_KEY` | mesmo token | idem | Build/SSR | idem |
| 3 | `.env` → `VITE_SUPABASE_PUBLISHABLE_KEY` | mesmo token | idem | Build/cliente | idem |

Nenhum JWT encontrado em:
- testes (`tests/`) — nenhum token
- fixtures / mocks — nenhum token
- documentação (`*.md`, README, relatórios) — nenhum token
- logs — nenhum token

## Verificação dos claims

Payload decodificado dos três achados (idêntico):

```json
{"iss":"supabase","ref":"llfgqeotxneprvomllru","role":"anon","iat":1787191795,"exp":2102767795}
```

`role: anon` = chave publicável. É a chave que o Supabase **exige** que seja
enviada pelo navegador em toda requisição; ela não concede nenhum acesso além
do que as políticas de RLS permitem ao papel `anon`.

## Chave privilegiada (service_role)

Auditei `src/integrations/supabase/client.server.ts`: a `service_role` é lida
exclusivamente de `process.env['SUPABASE_SERVICE_ROLE_KEY']`, dentro do
handler. **Não há nenhuma chave `service_role`, `sb_secret_` ou token de
gerenciamento (`sbp_`) escrito no código-fonte.**

## Risco real

- **Risco: baixo / falso positivo.** Os scanners detectam o formato JWT sem
  inspecionar o claim `role`. A chave anon é intencionalmente pública e está
  embutida no bundle JavaScript de qualquer app Supabase.
- **Nada a rotacionar.** Rotacionar a anon key não aumenta a segurança e
  quebraria todos os clientes; ela só deve ser trocada junto de um reset de
  JWT secret do projeto.
- **Nada a mover para secrets.** Mover a anon key para uma variável de
  ambiente não a esconde: o Vite a injeta no bundle do navegador do mesmo jeito.

## Onde o risco realmente mora

A postura de segurança aqui depende inteiramente de **RLS**, não de esconder a
anon key. Recomendações:

1. Manter as políticas RLS revisadas em todas as tabelas do schema `public`
   (varredura de segurança do Lovable já cobre isso).
2. Nunca commitar `SUPABASE_SERVICE_ROLE_KEY`, `SB_MANAGEMENT_TOKEN`,
   `GOOGLE_TOKEN_ENC_KEY` ou chaves Asaas — hoje todas estão em secrets. ✅
3. Tratar os 3 findings JWT do GitGuard como aceitos/ignorados, documentando
   este relatório como justificativa.

## Ação tomada

Nenhuma alteração de código: remover a anon key do `client.ts` quebraria a
aplicação e não traria ganho de segurança. Os findings são falsos positivos
confirmados.
