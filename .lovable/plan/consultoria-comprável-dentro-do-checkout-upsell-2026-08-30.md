# Consultoria comprável dentro do checkout (upsell)

Hoje, quando o cliente escolhe uma consultoria no upsell, ele é levado para `/app/consultorias` e abandona o pagamento em andamento. A consultoria vai passar a ser paga no mesmo checkout nativo, como qualquer curso ou e-book, gerando um **crédito de consultoria**. Depois do pagamento, o cliente é levado a escolher o horário (sem pagar de novo) e, em seguida, preencher o briefing.

## Fluxo novo

```text
Upsell -> cliente marca "Pack 3 Horas" junto do produto principal
       -> checkout nativo cobra tudo em uma transação (PIX / cartão / boleto)
       -> pagamento aprovado: sistema cria um crédito de consultoria
       -> redireciona para /app/consultorias?credito=<id>
       -> cliente escolhe o(s) horário(s) usando o crédito (R$ 0)
       -> vai direto para o briefing
       -> agendamento confirmado, Meet e e-mails como hoje
```

## O que será feito

1. **Crédito de consultoria (banco)**
   - Nova tabela `consultation_credits`: dono, produto, valor pago, id do pagamento, status (`available`, `used`, `refunded`), data de uso e consultoria vinculada.
   - Acesso restrito: o cliente só enxerga os próprios créditos; criação e baixa apenas pelo servidor.

2. **Consultoria como produto do checkout nativo**
   - O tipo de produto `consultation` passa a ser aceito no checkout nativo, com preço lido sempre de `consultation_products` (nunca do navegador).
   - Após o pagamento confirmado (à vista, cartão ou confirmação por polling/webhook), a liberação cria o crédito em vez de matricular em curso.
   - Cupom, order bump e valor total continuam funcionando igual.

3. **Upsell deixa de redirecionar**
   - No modal de upsell, consultorias ativas passam a ser itens selecionáveis (com preço, descrição e capa vindos do admin), somando no mesmo pagamento.
   - Some o botão "ir para consultorias" nesse caso; nada mais tira o cliente do pagamento em andamento.

4. **Pós-pagamento: agendar com crédito**
   - Depois da confirmação, o cliente é redirecionado para `/app/consultorias?credito=<id>` com um aviso destacado: "Consultoria paga — escolha seu horário".
   - A reserva com crédito não gera link de pagamento no Asaas: consome o crédito, marca a consultoria como paga/agendada e segue direto para o briefing obrigatório.
   - Se o cliente sair sem agendar, o crédito continua disponível e aparece como pendência em `/app/consultorias` e na home.

5. **Segurança e consistência**
   - Consumo do crédito é atômico (um crédito só agenda uma vez).
   - Estorno/chargeback do pagamento invalida o crédito ainda não usado.
   - Eventos registrados na auditoria de consultorias e nos logs de upsell já existentes.

## Detalhes técnicos

- `src/lib/checkout-native.server.ts`: `priceProduct` ganha o caso `consultation` (lê `consultation_products`: preço, título, status).
- `src/lib/checkout-native.functions.ts`: `productSchema` aceita `consultation`; `fulfill()` insere em `consultation_credits` de forma idempotente por `payment_id + product_id`; o retorno passa a informar créditos criados para o modal redirecionar.
- `src/components/checkout/CheckoutModal.tsx`: na tela de sucesso, se houver crédito de consultoria, CTA/redirecionamento para `/app/consultorias?credito=<id>`.
- `src/components/platform/PostPurchaseOffer.tsx`: consultorias saem de `ExtraOffer` (link) e entram em `OfferItem` selecionável com `productType: 'consultation'`.
- `src/lib/consultations.functions.ts`: `reserveConsultation` aceita `creditId` opcional; com crédito válido do próprio usuário, pula a criação de `paymentLinks`, grava `status: 'scheduled'`, `paid_at`, `amount` e chama o mesmo caminho de confirmação usado hoje pelo webhook (`confirmConsultationPayment`), marcando o crédito como `used`.
- `src/routes/app.consultorias.tsx`: lê `?credito=`, mostra faixa de crédito disponível, pré-seleciona o produto do crédito e leva ao briefing após a escolha do horário.
- Webhook Asaas (`src/routes/api/public/webhooks/asaas.ts`): estorno/chargeback de um pagamento com crédito não usado marca o crédito como `refunded`.

## Fora do escopo

- Reembolso automático de crédito não utilizado após X dias (pode ser adicionado depois).
- Venda de consultoria na landing pública (segue pelo fluxo atual).
