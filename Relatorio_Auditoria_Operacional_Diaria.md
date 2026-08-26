# Auditoria Operacional Diária — Autossuficiência do Painel Admin

Escopo: apenas operação diária pós-lançamento. Não reavalia segurança, RLS, webhooks, reconciliação, e-mails (entrega), checkout e performance.
Data: 26/08/2026

---

## Respostas diretas

**1. Tarefas administrativas que ainda exigem acesso ao banco?** Sim.
- Revogar/remover uma matrícula específica (`course_enrollments` / `ebook_enrollments`): o painel só sabe **liberar** manualmente. Estorno, chargeback ou compra errada exigem SQL.
- Revogar/reemitir certificado: as colunas `is_revoked`, `revoked_at`, `revocation_reason` existem, sem nenhuma tela.
- Comissão personalizada por produto (`affiliate_custom_commissions`) e alteração da `commission_rate` de um afiliado: só leitura no painel.
- Bloquear/suspender conta (`profiles.status`): sem UI — hoje a única saída é excluir o aluno, o que é destrutivo e contraria os Termos (que preveem bloqueio).

**2. Situações que exigem Supabase manual?** Sim.
- Redefinir senha de um aluno / reenviar e-mail de confirmação (Auth Dashboard).
- Corrigir e-mail de login digitado errado no cadastro.
- Consultar um pagamento específico (`payments`) — não há nenhuma tela que liste transações.
- Os quatro itens do ponto 1.

**3. Situações que exigem Asaas manual?** Sim.
- Emitir estorno/reembolso (garantia de 7 dias prometida na landing e nos Termos).
- Cancelar assinatura recorrente de um aluno.
- Consultar/ajustar cliente, cobrança ou 2ª via de boleto/PIX.
- Conferir se um pagamento existe: a Reconciliação mostra apenas divergências, não o extrato.

**4. Situações que exigem Resend manual?** Sim.
- Ver bounces, spam complaints e lista de supressão (endereço queimado = aluno sem e-mail para sempre, sem sinal no painel).
- Conferir DNS/domínio além do `validation_status` binário atual.

**5. Informação importante ausente do painel?**
- Extrato de transações (valor, status, método, `external_id`, produto, aluno) com busca — hoje inexistente.
- Assinaturas ativas / próximas cobranças / inadimplentes.
- Histórico de ações administrativas: existe `payout_audit_log` (saques) e `system_logs` genérico, mas não há “quem liberou acesso manualmente”, “quem excluiu o curso”, “quem mudou o papel”.
- Histórico de e-mails por aluno (o que ele recebeu, abriu, falhou) na própria ficha.

**6. Ação crítica não executável pelo painel?**
- Estorno, cancelamento de assinatura, revogação de acesso, bloqueio de conta, reset de senha, revogação de certificado, reenvio pontual de um e-mail transacional a um aluno.

**7. Configuração que depende de código?**
- Copy, preços exibidos, prova social e FAQ da landing (`src/routes/index.tsx`, `src/lib/landing-faq.ts`), Termos e Política.
- Parâmetros da recuperação operacional: janela de deduplicação (6h), 3 tentativas de e-mail, intervalo de 15 min, limiar de saque parado.
- Comissão padrão de afiliado e regras de pontuação/ranking.

**8. Integração não monitorável pelo painel?** Parcialmente.
- Asaas e Resend têm status/teste em Integrações e Status Operacional; falta histórico de chamadas por integração com filtro por período e código HTTP (dados já existem em `integration_logs`, sem tela dedicada com filtros).
- Google Drive (vídeos) e YouTube não têm verificação de link quebrado.

**9. Fluxos que geram chamado de suporte e poderiam ser resolvidos pelo admin?**
- “Paguei e não liberou” → resolvido (Reconciliação).
- “Não recebi o e-mail / link do e-book” → hoje só reprocessa a fila; falta “reenviar este e-mail para este aluno”.
- “Esqueci a senha / não recebo o link” → sem ação no painel.
- “Quero cancelar / quero reembolso” → sem ação no painel.
- “Errei meu e-mail no cadastro” → sem ação no painel.
- “Meu certificado saiu com nome errado” → sem revogar/reemitir.

**10. Onde faltam histórico, filtros, exportação, busca e logs?**
- Exportação CSV existe só em Relatórios e Downloads de e-books. Faltam em Alunos, Afiliados, Saques, Cupons, Transações, Logs.
- Filtro por período e status faltam em Alunos, Afiliados, Feedbacks, Suporte e Downloads.
- Busca global (aluno por e-mail/telefone/ID de pagamento) inexistente.
- Ficha do aluno sem timeline unificada (compras, acessos, e-mails, tickets, certificados).

---

## Melhorias reais

### Essencial antes do lançamento
1. **Revogar acesso** por item na ficha do aluno (com motivo e registro em log).
2. **Bloquear/reativar conta** usando `profiles.status`, com bloqueio de login e mensagem ao aluno.
3. **Extrato de transações** (`payments`) com busca por e-mail, `external_id` e produto + filtro de status/período.
4. **Reset de senha e reenvio de confirmação** de e-mail disparáveis pelo painel.
5. **Reenvio pontual de e-mail transacional** para um aluno (boas-vindas, link do e-book, certificado, dados de acesso).
6. **Registro de estorno** no painel: marcar o pagamento como reembolsado, revogar acesso e notificar — mesmo que o estorno financeiro ainda seja feito no Asaas (com link direto para a cobrança).

### Recomendado após o lançamento
7. Estorno e cancelamento de assinatura executados via API do Asaas direto do painel.
8. Tela de assinaturas: ativas, inadimplentes, próximas cobranças.
9. Revogar/reemitir certificado com motivo.
10. Editar comissão do afiliado e comissões por produto (`affiliate_custom_commissions`).
11. Corrigir e-mail de login do aluno pelo painel.
12. Log unificado de ações administrativas (quem, o quê, quando) com filtro e exportação.
13. Painel de saúde do Resend: bounces, supressões e status de DNS.
14. Tela de `integration_logs` com filtros por integração, período e código HTTP.
15. Exportação CSV em Alunos, Afiliados, Saques, Cupons e Transações.
16. Busca global no topo do painel.
17. Timeline por aluno (compras, acessos, e-mails, tickets, certificados, downloads).

### Futuro
18. Configurações operacionais editáveis (retentativas, janela de dedup, intervalo do cron, limiares de alerta).
19. CMS leve para copy/FAQ/Termos da landing sem deploy.
20. Respostas prontas (macros) e SLA no suporte.
21. Verificador automático de links de vídeo (Drive/YouTube) com alerta.
22. Regras de pontuação e ranking configuráveis pelo painel.
