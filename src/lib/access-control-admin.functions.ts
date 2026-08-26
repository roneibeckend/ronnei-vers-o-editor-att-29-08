import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase 2 — Controle de Acesso (ações administrativas).
 *
 * Todas as ações:
 *  - exigem papel admin;
 *  - exigem motivo;
 *  - registram auditoria em public.admin_audit_log (responsável, data/hora, motivo);
 *  - retornam sucesso/falha explícito para o painel.
 */

const PERMANENT_BAN = "876000h"; // ~100 anos

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Acesso restrito a administradores.");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function auditAccess(input: {
  action: string;
  studentId: string;
  adminId: string;
  reason?: string | null;
  productType?: string | null;
  productId?: string | null;
  productName?: string | null;
  details?: Record<string, unknown>;
  message: string;
  level?: "info" | "warning" | "error";
}) {
  const db = await admin();
  await db.from("admin_audit_log").insert({
    action: input.action,
    target_user_id: input.studentId,
    actor_id: input.adminId,
    product_type: input.productType ?? null,
    product_id: input.productId ?? null,
    product_name: input.productName ?? null,
    reason: input.reason ?? null,
    details: input.details ?? {},
  });

  const { logSystemEvent } = await import("@/lib/system-log.server");
  await logSystemEvent({
    level: input.level ?? "info",
    source: "admin-acesso",
    message: input.message,
    details: {
      action: input.action,
      student_id: input.studentId,
      admin_id: input.adminId,
      reason: input.reason ?? null,
      product_type: input.productType ?? null,
      product_id: input.productId ?? null,
    },
    userId: input.adminId,
  });
}

const reasonSchema = z
  .string()
  .trim()
  .min(5, "Informe um motivo com pelo menos 5 caracteres.")
  .max(500);

const productSchema = z.object({
  studentId: z.string().uuid(),
  productType: z.enum(["course", "ebook"]),
  productId: z.string().min(1),
  reason: reasonSchema,
});

async function loadProfile(db: any, studentId: string) {
  const { data } = await db
    .from("profiles")
    .select("id, name, email, status")
    .eq("id", studentId)
    .maybeSingle();
  if (!data) throw new Error("Aluno não encontrado.");
  return data;
}

async function productName(db: any, type: "course" | "ebook", id: string) {
  const table = type === "course" ? "courses" : "ebooks";
  const { data } = await db.from(table).select("title").eq("id", id).maybeSingle();
  return data?.title ?? id;
}

/** 1) Bloquear conta — impede login e encerra sessões ativas. */
export const adminBlockAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ studentId: z.string().uuid(), reason: reasonSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.studentId === context.userId) {
      throw new Error("Você não pode bloquear a sua própria conta.");
    }
    const db = await admin();
    const profile = await loadProfile(db, data.studentId);

    try {
      // Impede login (GoTrue recusa autenticação de usuário banido).
      const { error: banError } = await db.auth.admin.updateUserById(data.studentId, {
        ban_duration: PERMANENT_BAN,
      });
      if (banError) throw new Error(banError.message);

      // Encerra sessões ativas (invalida refresh tokens existentes).
      try {
        await db.auth.admin.signOut(data.studentId, "global");
      } catch {
        /* GoTrue pode não expor logout por id; o ban já invalida a renovação */
      }

      await db
        .from("profiles")
        .update({ status: "blocked", updated_at: new Date().toISOString() })
        .eq("id", data.studentId);

      await auditAccess({
        action: "account_blocked",
        studentId: data.studentId,
        adminId: context.userId,
        reason: data.reason,
        level: "warning",
        message: `Conta bloqueada: ${profile.email ?? data.studentId}`,
        details: { email: profile.email, sessions_revoked: true },
      });

      return { success: true as const, status: "blocked" as const };
    } catch (err: any) {
      await auditAccess({
        action: "account_block_failed",
        studentId: data.studentId,
        adminId: context.userId,
        reason: data.reason,
        level: "error",
        message: `Falha ao bloquear conta ${profile.email ?? data.studentId}: ${err?.message ?? err}`,
      });
      throw new Error(err?.message || "Falha ao bloquear a conta.");
    }
  });

/** 2) Reativar conta — restaura o acesso. */
export const adminUnblockAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ studentId: z.string().uuid(), reason: reasonSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const profile = await loadProfile(db, data.studentId);

    try {
      const { error } = await db.auth.admin.updateUserById(data.studentId, {
        ban_duration: "none",
      });
      if (error) throw new Error(error.message);

      await db
        .from("profiles")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", data.studentId);

      await auditAccess({
        action: "account_reactivated",
        studentId: data.studentId,
        adminId: context.userId,
        reason: data.reason,
        message: `Conta reativada: ${profile.email ?? data.studentId}`,
        details: { email: profile.email },
      });

      return { success: true as const, status: "active" as const };
    } catch (err: any) {
      await auditAccess({
        action: "account_reactivate_failed",
        studentId: data.studentId,
        adminId: context.userId,
        reason: data.reason,
        level: "error",
        message: `Falha ao reativar conta ${profile.email ?? data.studentId}: ${err?.message ?? err}`,
      });
      throw new Error(err?.message || "Falha ao reativar a conta.");
    }
  });

/** 3) Revogar acesso — remove matrícula individual em curso ou e-book. */
export const adminRevokeAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => productSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    await loadProfile(db, data.studentId);
    const name = await productName(db, data.productType, data.productId);

    const table = data.productType === "course" ? "course_enrollments" : "ebook_enrollments";
    const column = data.productType === "course" ? "course_id" : "ebook_id";

    const { data: existing } = await db
      .from(table)
      .select("id")
      .eq("user_id", data.studentId)
      .eq(column, data.productId)
      .maybeSingle();

    if (!existing) throw new Error("O aluno não possui acesso a este conteúdo.");

    const { error } = await db.from(table).delete().eq("id", existing.id);
    if (error) {
      await auditAccess({
        action: "access_revoke_failed",
        studentId: data.studentId,
        adminId: context.userId,
        reason: data.reason,
        productType: data.productType,
        productId: data.productId,
        productName: name,
        level: "error",
        message: `Falha ao revogar acesso a ${name}: ${error.message}`,
      });
      throw new Error(error.message);
    }

    await auditAccess({
      action: "access_revoked",
      studentId: data.studentId,
      adminId: context.userId,
      reason: data.reason,
      productType: data.productType,
      productId: data.productId,
      productName: name,
      level: "warning",
      message: `Acesso revogado: ${name}`,
    });

    return { success: true as const, productName: name };
  });

/** 4) Conceder acesso — libera manualmente curso ou e-book. */
export const adminGrantAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => productSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    await loadProfile(db, data.studentId);
    const name = await productName(db, data.productType, data.productId);

    const table = data.productType === "course" ? "course_enrollments" : "ebook_enrollments";
    const column = data.productType === "course" ? "course_id" : "ebook_id";

    const { data: existing } = await db
      .from(table)
      .select("id")
      .eq("user_id", data.studentId)
      .eq(column, data.productId)
      .maybeSingle();

    if (existing) throw new Error("O aluno já possui acesso a este conteúdo.");

    const { error } = await db
      .from(table)
      .insert({ user_id: data.studentId, [column]: data.productId });

    if (error) {
      await auditAccess({
        action: "access_grant_failed",
        studentId: data.studentId,
        adminId: context.userId,
        reason: data.reason,
        productType: data.productType,
        productId: data.productId,
        productName: name,
        level: "error",
        message: `Falha ao conceder acesso a ${name}: ${error.message}`,
      });
      throw new Error(error.message);
    }

    await auditAccess({
      action: "access_granted",
      studentId: data.studentId,
      adminId: context.userId,
      reason: data.reason,
      productType: data.productType,
      productId: data.productId,
      productName: name,
      message: `Acesso concedido: ${name}`,
    });

    return { success: true as const, productName: name };
  });

/** 5) Histórico de controle de acesso do aluno. */
export const getAccessControlHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ studentId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();

    const { data: rows, error } = await db
      .from("admin_audit_log")
      .select("id, action, product_type, product_name, product_id, reason, created_at, actor_id")
      .eq("target_user_id", data.studentId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);

    if (error) throw new Error(error.message);

    const actorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.actor_id).filter(Boolean)),
    );

    let actors: Record<string, string> = {};
    if (actorIds.length) {
      const { data: profiles } = await db
        .from("profiles")
        .select("id, name, email")
        .in("id", actorIds);
      actors = Object.fromEntries(
        (profiles ?? []).map((p: any) => [p.id, p.name || p.email || p.id]),
      );
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      action: r.action as string,
      productType: r.product_type as string | null,
      productName: (r.product_name ?? null) as string | null,
      reason: (r.reason ?? null) as string | null,
      createdAt: r.created_at as string,
      actor: r.actor_id ? actors[r.actor_id] ?? "Administrador" : "Sistema",
    }));
  });
