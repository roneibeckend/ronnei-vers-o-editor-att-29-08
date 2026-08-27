# Infraestrutura Google oficial (Calendar + Meet + Drive) para Consultorias

Objetivo: criar a base definitiva de integração com o Google usando OAuth próprio do projeto, com o refresh token da conta principal do Ronnei guardado no servidor. Nada manual ou temporário: os eventos, o link do Meet e (depois) as gravações no Drive passam a ser criados pelo sistema.

## Parte 1 — Checklist do Google Cloud Console (você faz)

Faça na conta Google que será a agenda oficial das consultorias (a conta do Ronnei).

### 1. Projeto
- Criar (ou reutilizar) um projeto no Google Cloud, ex.: "Ronnei na Veia — Plataforma".

### 2. APIs a habilitar (APIs e serviços > Biblioteca)
- Google Calendar API (eventos + geração do link do Meet)
- Google Drive API (gravações e materiais)
- Google People API (opcional, só para exibir de qual conta é o token)

Obs.: não existe "Google Meet API" para criar reuniões — o link do Meet é gerado pelo Calendar via `conferenceData` (`conferenceDataVersion=1`). A Meet API só serve para consultar artefatos/gravações depois; se quiser gravações automáticas, habilitar também "Google Meet API".

### 3. Tela de consentimento OAuth
- Tipo: Externo
- Nome do app: Ronnei na Veia
- E-mail de suporte e e-mail do desenvolvedor: conta do Ronnei
- Domínios autorizados: `ronneinaveia.com.br` e `lovable.app`
- Links de política de privacidade e termos: páginas já existentes no site
- Publicação: pode ficar em "Testing" desde que a conta do Ronnei esteja em "Test users" (nesse modo o refresh token expira a cada 7 dias). Para uso definitivo: publicar o app. Com os escopos de Calendar/Drive completos o Google pede verificação; alternativa sem verificação é usar escopos reduzidos (ver item 5).

### 4. Credenciais OAuth (APIs e serviços > Credenciais > Criar > ID do cliente OAuth)
- Tipo: Aplicativo da Web
- Nome: Ronnei na Veia — Server
- Origens JavaScript autorizadas:
  - `https://ronneinaveia.com.br`
  - `https://ronneinv.lovable.app`
- URIs de redirecionamento autorizados (exatos):
  - `https://ronneinaveia.com.br/api/public/google/oauth/callback`
  - `https://ronneinv.lovable.app/api/public/google/oauth/callback`
  - `https://project--188d301c-e736-4692-9777-b32267cd801a-dev.lovable.app/api/public/google/oauth/callback` (ambiente de preview/testes)
- Guardar o Client ID e o Client Secret

Importante: este cliente é separado do login social com Google (que continua pelo Supabase). Não reaproveitar o mesmo redirect.

### 5. Escopos a solicitar
Recomendado (menor atrito de verificação):
- `https://www.googleapis.com/auth/calendar.events` — criar/editar eventos e gerar Meet
- `https://www.googleapis.com/auth/drive.file` — apenas arquivos criados pelo app
- `openid`, `email`, `profile` — identificar a conta conectada

Se depois for necessário ler gravações que o app não criou, incluir `https://www.googleapis.com/auth/drive.readonly` (escopo restrito, exige verificação do Google).

### 6. Secrets que serão salvos no projeto
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENC_KEY` (gerado automaticamente pelo sistema, para criptografar o refresh token)

### 7. Configuração do Calendar (na conta do Ronnei)
- Definir qual agenda será usada (a principal ou uma agenda dedicada "Consultorias") e ter o ID dela
- Fuso: America/Sao_Paulo
- Em Configurações do Google Meet: permitir criação de conferência nos eventos (padrão já permite)
- Para gravação automática das reuniões é obrigatório Google Workspace (Business Standard+); com conta @gmail.com a gravação não é liberada por API

## Parte 2 — O que será implementado no sistema

### Banco de dados
- Tabela `google_credentials`: conta conectada (e-mail), refresh token criptografado, escopos concedidos, validade do access token, data da última renovação, status. Acesso somente por `service_role`, RLS ativa, sem grant para `anon`/`authenticated`.
- Tabela `google_integration_settings`: ID da agenda usada, fuso, duração padrão da consultoria, pasta do Drive para gravações, flags de recursos.
- Tabela `google_api_logs`: auditoria de cada chamada (ação, status, erro, duração) para diagnóstico.

### Backend
- `src/lib/google-oauth.server.ts`: montagem da URL de consentimento (`access_type=offline`, `prompt=consent`), troca de código por tokens, criptografia AES-GCM do refresh token, renovação automática do access token com cache curto e tratamento de `invalid_grant`.
- `src/routes/api/public/google/oauth/callback.ts`: recebe o retorno do Google, valida o parâmetro `state` (token único, curto, gerado no admin), grava as credenciais e redireciona para o painel.
- `src/lib/google-calendar.server.ts`: criar, atualizar e cancelar eventos com `conferenceData` (link do Meet), convidados, lembretes e fuso de Brasília.
- `src/lib/google-drive.server.ts`: base para listar/mover gravações e criar a pasta da consultoria (usada na fase seguinte).
- `src/lib/google-integration.functions.ts`: server functions restritas a admin — iniciar conexão, ver status, desconectar, testar (cria e apaga um evento de teste, retornando o link do Meet gerado).
- Alerta operacional automático (usando o mecanismo de alertas já existente) quando o refresh token for revogado ou a renovação falhar.

### Painel administrativo
- Nova aba "Google" em Integrações: mostra conta conectada, escopos, status do token, seleção da agenda, pasta do Drive, botões "Conectar conta Google", "Testar integração" e "Desconectar", além dos últimos logs de chamadas.

### Segurança
- Refresh token sempre criptografado; nunca retornado ao navegador.
- Rota de callback pública apenas para receber o retorno do Google, protegida por `state` de uso único com expiração.
- Todas as chamadas ao Google acontecem no servidor; nenhuma credencial no bundle do cliente.

## Detalhes técnicos
- Criação de evento: `POST /calendar/v3/calendars/{calendarId}/events?conferenceDataVersion=1` com `conferenceData.createRequest.conferenceSolutionKey.type = "hangoutsMeet"`; o link do Meet volta em `hangoutLink`.
- Renovação: `POST https://oauth2.googleapis.com/token` com `grant_type=refresh_token`; access token cacheado em memória do servidor até ~5 min antes de expirar.
- Criptografia: AES-256-GCM via `node:crypto`, chave em `GOOGLE_TOKEN_ENC_KEY` (base64, 32 bytes), formato armazenado `iv|tag|ciphertext` em base64.
- Fuso fixo `America/Sao_Paulo` em toda a montagem de datas.

## Verificação
- Conectar a conta do Ronnei pelo painel e confirmar que o e-mail e os escopos aparecem corretamente.
- Botão "Testar integração": deve criar um evento temporário, retornar o link do Meet e removê-lo em seguida.
- Forçar renovação do access token e confirmar sucesso nos logs.
- Desconectar e confirmar que as credenciais são apagadas e o status volta para "não conectado".

## Ordem de execução
1. Você conclui o checklist do Google Cloud (Parte 1) e me avisa.
2. Eu implemento a infraestrutura (Parte 2) e abro o formulário seguro para você colar Client ID e Client Secret.
3. Você conecta a conta Google no painel e validamos com o teste.
4. Só então partimos para o módulo de consultorias em si.
