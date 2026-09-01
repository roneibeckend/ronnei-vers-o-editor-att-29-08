# Kit de Materiais de Divulgação para Afiliados (editável no Canva)

Objetivo: cada produto (curso, e-book, consultoria, plano Fidelize) ter um pacote de artes prontas + copy, que o afiliado baixa e pode editar no Canva.

## Como o "editável no Canva" funciona

O Canva não aceita upload de "arquivo Canva" por link direto sem conta Pro/Brand. Duas formas viáveis:

1. **Arquivo .pptx importável** (recomendado como padrão)
   - Geramos o material com `pptxgenjs` (já usado no projeto em `src/lib/pptx-generator.ts`).
   - O afiliado importa o .pptx no Canva: textos, preços e cores continuam editáveis.
   - Funciona sem depender de conta/licença Canva nossa.

2. **Link de template Canva** (opcional, manual)
   - O admin cola no cadastro do material um link "Usar como modelo" criado no Canva.
   - Campo extra `external_url` no material; o botão vira "Editar no Canva".

Sugestão: oferecer os dois — .pptx sempre, link Canva quando o admin tiver criado.

## Formatos por produto

Para cada produto, um kit com 4 peças:
- Story 1080x1920 (chamada + CTA)
- Feed 1080x1350 (apresentação do produto)
- Banner/print 1080x1080 (prova social / preço)
- Copy pronta (WhatsApp, bio, legenda) em texto copiável

## Etapas

1. **Previews primeiro (antes de qualquer código)**
   - Gero 3 imagens de amostra do kit: 1 story de curso, 1 feed de consultoria, 1 story Fidelize, na identidade preto/grafite + laranja/dourado.
   - Você aprova a direção visual.

2. **Gerador de kit por produto**
   - `src/lib/affiliate-kit-generator.ts`: monta o .pptx do produto (nome, preço, bullets, capa, link com `?ref=CODE`).
   - Copy gerada a partir dos dados reais do produto (cursos, ebooks, consultation_products, planos Fidelize).

3. **Área do afiliado (`/app/afiliados/materiais`)**
   - Agrupar por produto, com abas Curso / E-book / Consultoria / Fidelize.
   - Botões: "Baixar artes (.pptx)", "Editar no Canva" (se houver link), "Copiar copy", "Copiar meu link".
   - Link já sai com o código de referência do afiliado.

4. **Admin (`/admin/afiliados` > Materiais)**
   - Vincular material a um produto (`product_type` + `product_id`).
   - Campo opcional para link de template Canva.
   - Upload de artes prontas continua funcionando.

## Detalhes técnicos

- Migration: adicionar `product_type`, `product_id`, `canva_url` em `affiliate_materials` (nullable, retrocompatível).
- Geração do .pptx no cliente com `pptxgenjs`; sem custo de storage.
- Links de afiliado montados com o `code` do afiliado logado.

## Próximo passo

Ao aprovar, começo pelos 3 previews visuais e só depois implemento o resto.
