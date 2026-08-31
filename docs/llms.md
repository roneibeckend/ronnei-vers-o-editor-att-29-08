# llms.txt

O Ronnei na Veia disponibiliza um arquivo público para descoberta e contexto por sistemas baseados em LLM.

## Endpoint

`https://ronneinaveia.com.br/llms.txt`

## Content-Type

`text/plain; charset=utf-8`

## Acesso

O endpoint é público e não exige autenticação.

## Fonte

O conteúdo é mantido em:

`public/llms.txt`

## Sitemap

O endpoint também está referenciado em:

`public/sitemap.xml`

## Publicação

Em produção, o Nginx expõe `/llms.txt` diretamente a partir da release ativa para garantir:

- acesso público;
- resposta sem autenticação;
- `Content-Type: text/plain`;
- independência das rotas autenticadas da aplicação.
