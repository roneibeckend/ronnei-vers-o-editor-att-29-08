import { supabase } from "@/integrations/supabase/client";

/**
 * Cache em memória para as configurações da tabela `integrations`.
 *
 * Essas linhas são configuração (quase nunca mudam), mas eram consultadas
 * dezenas de vezes por sessão na área de membros. O cache reduz drasticamente
 * o número de requisições sem alterar nenhuma regra de negócio.
 */

export type IntegrationConfig = {
  status: boolean | null;
  settings: Record<string, any> | null;
};

const TTL_MS = 5 * 60 * 1000; // 5 minutos

const cache = new Map<string, { at: number; promise: Promise<IntegrationConfig | null> }>();

export function getIntegrationConfig(
  category: string,
  options?: { force?: boolean },
): Promise<IntegrationConfig | null> {
  const cached = cache.get(category);
  if (!options?.force && cached && Date.now() - cached.at < TTL_MS) {
    return cached.promise;
  }

  const promise: Promise<IntegrationConfig | null> = (async () => {
    try {
      const { data } = await supabase
        .from("integrations")
        .select("status, settings")
        .eq("category", category)
        .maybeSingle();
      return (data as IntegrationConfig | null) ?? null;
    } catch {
      return null;
    }
  })();

  // Falha (ou ausência de configuração) não deve ficar em cache por 5 minutos.
  promise.then((value: IntegrationConfig | null) => {
    if (value === null) cache.delete(category);
  });


  cache.set(category, { at: Date.now(), promise });
  return promise;
}

export async function getIntegrationStatus(category: string): Promise<boolean> {
  const config = await getIntegrationConfig(category);
  return config?.status ?? false;
}

export async function getIntegrationSettings(
  category: string,
): Promise<Record<string, any> | null> {
  const config = await getIntegrationConfig(category);
  const settings = config?.settings;
  return settings && typeof settings === "object" ? settings : null;
}

export function invalidateIntegrationConfig(category?: string) {
  if (category) cache.delete(category);
  else cache.clear();
}
