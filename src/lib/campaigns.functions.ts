import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getCampaigns = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("ranking_campaigns")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  });

// Admin-only: inclui campanhas inativas/rascunho
export const getAllCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: hasRole } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin'
    });
    if (!hasRole) throw new Error("Unauthorized");

    const { data, error } = await supabaseAdmin
      .from("ranking_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  });


export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({
    name: z.string(),
    description: z.string().optional(),
    startDate: z.string(),
    endDate: z.string(),
    prizeDescription: z.string(),
    rewardedPositions: z.array(z.number())
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin'
    });

    if (!hasRole) throw new Error("Unauthorized");

    const { error } = await supabaseAdmin
      .from("ranking_campaigns")
      .insert({
        name: data.name,
        description: data.description,
        start_date: data.startDate,
        end_date: data.endDate,
        prize_description: data.prizeDescription,
        rewarded_positions: data.rewardedPositions
      });
    
    if (error) throw error;
    return { success: true };
  });

export const finishCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({
    campaignId: z.string()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin'
    });

    if (!hasRole) throw new Error("Unauthorized");

    const { error } = await context.supabase.rpc('finish_ranking_campaign', {
      _campaign_id: data.campaignId
    });
    
    if (error) throw error;
    return { success: true };
  });

export const getCampaignWinners = createServerFn({ method: "GET" })
  .validator((data: any) => z.object({
    campaignId: z.string()
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: winners, error: winnersError } = await supabaseAdmin
      .from("campaign_winners")
      .select("*")
      .eq("campaign_id", data.campaignId)
      .order("position", { ascending: true });
    
    if (winnersError) throw winnersError;
    if (!winners || winners.length === 0) return [];

    const userIds = winners.map(w => w.user_id).filter((id): id is string => !!id);
    if (userIds.length === 0) return winners.map(w => ({ ...w, profiles: null }));

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, name, avatar_url")
      .in("id", userIds);
    
    if (profilesError) throw profilesError;

    return winners.map(w => ({
      ...w,
      profiles: profiles?.find(p => p.id === w.user_id) || null
    }));
  });
