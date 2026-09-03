import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteAffiliateMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    // 1. Check if user is admin
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin"
    });

    if (!isAdmin) {
      // 2. If not admin, verify ownership
      const { data: material } = await supabaseAdmin
        .from("affiliate_materials" as any)
        .select("owner_id")
        .eq("id", data.id)
        .maybeSingle();

      if (!material || (material as any).owner_id !== userId) {
        throw new Error("Acesso negado: Você não tem permissão para excluir este material.");
      }
    }

    const { error } = await supabaseAdmin
      .from("affiliate_materials" as any)
      .delete()
      .eq("id", data.id);
    
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const saveAffiliateMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({
    id: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    category: z.string(),
    file_url: z.string(),
    thumbnail_url: z.string().optional(),
    owner_id: z.string().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    // 1. Check if user is admin
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin"
    });

    let finalOwnerId = data.owner_id || userId;

    if (!isAdmin) {
      // If not admin, the owner MUST be the current user
      finalOwnerId = userId;

      // If updating, check existing ownership
      if (data.id) {
        const { data: existing } = await supabaseAdmin
          .from("affiliate_materials" as any)
          .select("owner_id")
          .eq("id", data.id)
          .maybeSingle();
        
        if (existing && (existing as any).owner_id !== userId) {
          throw new Error("Acesso negado: Você não pode alterar este material.");
        }
      }
    }

    const { error } = await supabaseAdmin
      .from("affiliate_materials" as any)
      .upsert({
        ...data,
        owner_id: finalOwnerId,
        updated_at: new Date().toISOString()
      });
    
    if (error) throw new Error(error.message);
    return { success: true };
  });


export const getAffiliateNetwork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    if (data.id !== context.userId) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin"
      });
      if (!isAdmin) throw new Error("Acesso negado.");
    }

    const { data: network, error } = await supabaseAdmin
      .from("affiliates")
      .select(`
        id,
        status,
        created_at,
        profile:profiles(name, email)
      `)
      .eq("referrer_id" as any, data.id);
    
    if (error) throw new Error(error.message);
    return network;
  });

export const updateAffiliateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({
    id: z.string(),
    status: z.enum(["active", "blocked", "pending"]),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso negado: permissão de administrador necessária.");

    const { error } = await supabaseAdmin
      .from("affiliates")
      .update({ status: data.status as any, updated_at: new Date().toISOString() })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });

const AFFILIATE_SETTINGS_ID = "00000000-0000-0000-0000-000000000000";

const affiliateSettingsSchema = z
  .object({
    directCommissionRate: z.number().min(0).max(100),
    secondLevelCommissionRate: z.number().min(0).max(100),
  })
  .refine(
    (value) =>
      value.directCommissionRate + value.secondLevelCommissionRate <= 100,
    { message: "A soma das comissões não pode ultrapassar 100%." },
  );

async function assertAffiliateAdmin(context: any) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !isAdmin) {
    throw new Error("Acesso negado: permissão de administrador necessária.");
  }
}

export const getAffiliateSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAffiliateAdmin(context);
    const { data, error } = await (supabaseAdmin as any)
      .from("affiliate_settings")
      .select("direct_commission_rate, second_level_commission_rate")
      .eq("id", AFFILIATE_SETTINGS_ID)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return {
      directCommissionRate: Number(data?.direct_commission_rate ?? 30),
      secondLevelCommissionRate: Number(
        data?.second_level_commission_rate ?? 5,
      ),
    };
  });

export const saveAffiliateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => affiliateSettingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAffiliateAdmin(context);
    const { error } = await (supabaseAdmin as any).rpc(
      "save_affiliate_settings",
      {
        p_direct_commission_rate: data.directCommissionRate,
        p_second_level_commission_rate: data.secondLevelCommissionRate,
      },
    );
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const requestAffiliateRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async ({ context }) => {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("affiliates")
      .select("id")
      .eq("id", context.userId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existing) return { success: true, alreadyExists: true };

    const { data: settings, error: settingsError } = await (
      supabaseAdmin as any
    )
      .from("affiliate_settings")
      .select("direct_commission_rate")
      .eq("id", AFFILIATE_SETTINGS_ID)
      .maybeSingle();

    if (settingsError) throw new Error(settingsError.message);

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (authError) throw new Error(authError.message);

    const candidateReferrerId =
      authData.user?.user_metadata?.pending_referrer_id;
    const parsedReferrerId = z.string().uuid().safeParse(candidateReferrerId);
    let referrerId: string | null = null;

    if (
      parsedReferrerId.success &&
      parsedReferrerId.data !== context.userId
    ) {
      const { data: referrer } = await supabaseAdmin
        .from("affiliates")
        .select("id")
        .eq("id", parsedReferrerId.data)
        .eq("status", "active")
        .maybeSingle();
      referrerId = referrer?.id ?? null;
    }

    const { error } = await supabaseAdmin.from("affiliates").insert({
      id: context.userId,
      status: "pending",
      commission_rate: Number(settings?.direct_commission_rate ?? 30),
      balance: 0,
      total_earnings: 0,
      referrer_id: referrerId,
    } as any);

    if (error) throw new Error(error.message);
    return { success: true, alreadyExists: false };
  });
