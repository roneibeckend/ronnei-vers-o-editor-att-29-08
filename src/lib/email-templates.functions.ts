import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Proibido");
}

function normalizeVariableKeys(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .filter((value) => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  if (raw && typeof raw === "object") {
    return Object.keys(raw as Record<string, unknown>)
      .map((key) => key.trim())
      .filter(Boolean);
  }

  return [];
}

function variableType(raw: unknown) {
  if (Array.isArray(raw)) return "array";
  if (raw && typeof raw === "object") return "object";
  return "empty";
}

const variablesSchema = z.union([
  z.array(z.string()),
  z.record(z.any()),
]);

export const getEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from("email_templates")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row: any) => ({
      ...row,
      variables: row.variables ?? [],
      variable_keys: normalizeVariableKeys(row.variables),
      variables_type: variableType(row.variables),
      is_production_override: Boolean(row.is_production_override),
    }));
  });

export const saveEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(2),
        subject: z.string().min(2),
        content_html: z.string().min(10),
        content_text: z.string().optional(),
        description: z.string().optional(),
        variables: variablesSchema.default([]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const db = supabaseAdmin as any;
    const payload: Record<string, any> = {
      name: data.name.trim(),
      subject: data.subject,
      content_html: data.content_html,
      content_text: data.content_text ?? null,
      description: data.description ?? null,
      variables: data.variables,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await db
        .from("email_templates")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db
        .from("email_templates")
        .upsert(payload, { onConflict: "name" });
      if (error) throw new Error(error.message);
    }

    return { success: true };
  });

export const setEmailTemplateProductionOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const db = supabaseAdmin as any;
    const { data: current, error: findError } = await db
      .from("email_templates")
      .select("id,name,subject,content_html")
      .eq("id", data.id)
      .maybeSingle();

    if (findError || !current) {
      throw new Error(findError?.message || "Template não encontrado.");
    }

    if (
      data.enabled &&
      (!String(current.subject || "").trim() ||
        String(current.content_html || "").trim().length < 10)
    ) {
      throw new Error(
        "O template precisa ter assunto e HTML válidos antes de assumir a produção.",
      );
    }

    const { error } = await db
      .from("email_templates")
      .update({
        is_production_override: data.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    if (error) throw new Error(error.message);

    return {
      success: true,
      enabled: data.enabled,
      name: current.name,
    };
  });

export const deleteEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const db = supabaseAdmin as any;
    const { data: row } = await db
      .from("email_templates")
      .select("is_production_override")
      .eq("id", data.id)
      .maybeSingle();

    if (row?.is_production_override) {
      throw new Error(
        "Desative o override de produção antes de excluir este template.",
      );
    }

    const { error } = await db
      .from("email_templates")
      .delete()
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
