import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const providerSchema = z.enum([
  'google',
  'facebook',
  'apple',
  'github',
  'azure',
  'linkedin_oidc',
  'discord',
  'twitter',
]);

type Provider = z.infer<typeof providerSchema>;

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  });
  if (!isAdmin) throw new Error('Proibido');
}

const metaCategory = (provider: Provider) => `oauth_${provider}`;

async function loadMeta(providers: readonly Provider[]) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('integrations')
    .select('id, category, settings, updated_at')
    .in('category', providers.map(metaCategory));
  const map: Record<string, Record<string, any>> = {};
  (data ?? []).forEach((row: any) => {
    map[row.category] = { ...(row.settings ?? {}), _id: row.id, _updated_at: row.updated_at };
  });
  return map;
}

async function saveMeta(provider: Provider, patch: Record<string, unknown>) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const category = metaCategory(provider);
  const { data: existing } = await supabaseAdmin
    .from('integrations')
    .select('id, settings')
    .eq('category', category)
    .maybeSingle();

  const settings = { ...((existing?.settings as Record<string, unknown>) ?? {}), ...patch };

  if (existing?.id) {
    await supabaseAdmin
      .from('integrations')
      .update({ settings: settings as any, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin.from('integrations').insert([
      {
        name: `OAuth ${provider}`,
        type: 'oauth' as any,
        category,
        status: false,
        credentials: {},
        settings: settings as any,
      },
    ]);
  }
}

export const getOAuthProviders = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const server = await import('./oauth-admin.server');
    const meta = await loadMeta(server.PROVIDER_KEYS as Provider[]);

    const tokenConfigured = server.managementTokenConfigured();
    let config: Record<string, any> | null = null;
    let configError: string | null = null;

    if (tokenConfigured) {
      try {
        config = (await server.fetchAuthConfig()) as Record<string, any>;
      } catch (err: any) {
        configError = err?.message ?? 'Falha ao consultar a Management API.';
      }
    }

    const providers = server.PROVIDER_KEYS.map((key) => {
      const m = meta[`oauth_${key}`] ?? {};
      return {
        provider: key,
        enabled: config ? Boolean(config[`external_${key}_enabled`]) : null,
        clientId: config ? ((config[`external_${key}_client_id`] as string) ?? '') : '',
        hasSecret: config ? Boolean(config[`external_${key}_secret`]) : null,
        lastValidatedAt: (m['last_validated_at'] as string) ?? null,
        lastStatus: (m['last_status'] as string) ?? null,
        lastError: (m['last_error'] as string) ?? null,
        secretExpiresAt: (m['secret_expires_at'] as string) ?? null,
        publicFields: {
          teamId: (m['team_id'] as string) ?? '',
          keyId: (m['key_id'] as string) ?? '',
          serviceId: (m['service_id'] as string) ?? '',
        },
      };
    });

    return {
      tokenConfigured,
      configError,
      callbackUrl: server.callbackUrl(),
      siteUrl: (config?.['site_url'] as string) ?? null,
      environment: process.env['NODE_ENV'] === 'production' ? 'production' : 'development',
      providers,
    };
  });

export const saveOAuthProvider = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) =>
    z
      .object({
        provider: providerSchema,
        clientId: z.string().optional(),
        secret: z.string().optional(),
        teamId: z.string().optional(),
        keyId: z.string().optional(),
        serviceId: z.string().optional(),
        privateKey: z.string().optional(),
        enabled: z.boolean().optional(),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const server = await import('./oauth-admin.server');
    if (!server.managementTokenConfigured()) {
      throw new Error(
        'Configure o secret SB_MANAGEMENT_TOKEN para aplicar alterações automaticamente no Supabase.',
      );
    }

    const patch: Record<string, unknown> = {};
    const metaPatch: Record<string, unknown> = {};

    if (data.provider === 'apple') {
      const serviceId = data.serviceId?.trim();
      if (!serviceId) throw new Error('Service ID é obrigatório para a Apple.');
      patch['external_apple_client_id'] = serviceId;
      metaPatch['service_id'] = serviceId;

      if (data.privateKey?.trim()) {
        if (!data.teamId?.trim() || !data.keyId?.trim()) {
          throw new Error('Team ID e Key ID são obrigatórios para gerar o client secret da Apple.');
        }
        const { secret, expiresAt } = await server.generateAppleClientSecret({
          teamId: data.teamId.trim(),
          keyId: data.keyId.trim(),
          serviceId,
          privateKey: data.privateKey,
        });
        patch['external_apple_secret'] = secret;
        metaPatch['team_id'] = data.teamId.trim();
        metaPatch['key_id'] = data.keyId.trim();
        metaPatch['secret_expires_at'] = expiresAt;
      }
    } else {
      if (data.clientId?.trim()) patch[`external_${data.provider}_client_id`] = data.clientId.trim();
      if (data.secret?.trim()) patch[`external_${data.provider}_secret`] = data.secret.trim();
      if (!Object.keys(patch).length) throw new Error('Informe pelo menos o Client ID.');
    }

    if (typeof data.enabled === 'boolean') patch[`external_${data.provider}_enabled`] = data.enabled;

    try {
      await server.patchAuthConfig(patch);
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('permissão') || msg.includes('privileges') || msg.includes('403')) {
        const ref = (process.env['SUPABASE_PROJECT_ID'] ??
          process.env['SUPABASE_URL']?.match(/https?:\/\/([a-z0-9]+)\.supabase\./i)?.[1] ??
          '');
        throw new Error(
          `${msg} Como alternativa, configure o provedor manualmente em: https://supabase.com/dashboard/project/${ref}/auth/providers`,
        );
      }
      throw err;
    }

    await saveMeta(data.provider, { ...metaPatch, last_saved_at: new Date().toISOString() });

    return { success: true };
  });

export const setOAuthProviderEnabled = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) =>
    z.object({ provider: providerSchema, enabled: z.boolean() }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const server = await import('./oauth-admin.server');
    await server.patchAuthConfig({ [`external_${data.provider}_enabled`]: data.enabled });
    await saveMeta(data.provider, { last_toggled_at: new Date().toISOString() });
    return { success: true, enabled: data.enabled };
  });

export const removeOAuthProvider = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => z.object({ provider: providerSchema }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const server = await import('./oauth-admin.server');
    await server.patchAuthConfig({
      [`external_${data.provider}_enabled`]: false,
      [`external_${data.provider}_client_id`]: '',
      [`external_${data.provider}_secret`]: '',
    });
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await supabaseAdmin.from('integrations').delete().eq('category', `oauth_${data.provider}`);
    return { success: true };
  });

export const testOAuthProvider = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) =>
    z
      .object({
        provider: providerSchema,
        clientId: z.string().optional(),
        secret: z.string().optional(),
        teamId: z.string().optional(),
        keyId: z.string().optional(),
        serviceId: z.string().optional(),
        privateKey: z.string().optional(),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const server = await import('./oauth-admin.server');
    const startedAt = Date.now();

    let result: { success: boolean; httpCode: number; message: string; expiresAt?: string };

    try {
      if (data.provider === 'facebook') {
        if (!data.clientId || !data.secret) {
          throw new Error('Informe App ID e App Secret para testar (o secret salvo não é legível).');
        }
        result = await server.testFacebookCredentials(data.clientId.trim(), data.secret.trim());
      } else if (data.provider === 'apple') {
        if (!data.teamId || !data.keyId || !data.serviceId || !data.privateKey) {
          throw new Error('Informe Team ID, Key ID, Service ID e Private Key para testar.');
        }
        result = await server.testAppleKey({
          teamId: data.teamId.trim(),
          keyId: data.keyId.trim(),
          serviceId: data.serviceId.trim(),
          privateKey: data.privateKey,
        });
      } else {
        result = await server.testGenericProvider(data.clientId ?? '', data.secret ?? '');
      }
    } catch (err: any) {
      result = { success: false, httpCode: 0, message: err?.message ?? 'Falha no teste.' };
    }

    const timestamp = new Date().toISOString();
    await saveMeta(data.provider, {
      last_validated_at: timestamp,
      last_status: result.success ? 'ok' : 'error',
      last_error: result.success ? null : result.message,
      ...(result.expiresAt ? { secret_expires_at: result.expiresAt } : {}),
    });

    return {
      ...result,
      latency: `${Date.now() - startedAt}ms`,
      timestamp,
      callbackUrl: server.callbackUrl(),
    };
  });
