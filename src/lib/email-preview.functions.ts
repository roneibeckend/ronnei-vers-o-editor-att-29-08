import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden: Admin access required");
}

export const previewEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        event: z.string().min(2),
        data: z.record(z.any()).default({}),
      })
      .parse(input),
  )
  .handler(async ({ data: { event, data }, context }) => {
    await assertAdmin(context);

    const { validateEmailData } = await import("@/emails/catalog");
    const { resolveRuntimeEmailTemplate } = await import(
      "./email-template-resolver.server"
    );

    const validation = validateEmailData(event, data);
    const rendered = await resolveRuntimeEmailTemplate(event, data);

    return {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      validation,
      source: rendered.source,
      templateId: rendered.templateId,
      overrideEnabled: rendered.overrideEnabled,
      hasCodeTemplate: rendered.hasCodeTemplate,
    };
  });

export const sendTemplateTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        event: z.string().min(2),
        to: z.string().email("Informe um e-mail válido."),
        data: z.record(z.any()).default({}),
      })
      .parse(input),
  )
  .handler(async ({ data: { event, to, data }, context }) => {
    await assertAdmin(context);

    const { validateEmailData } = await import("@/emails/catalog");
    const validation = validateEmailData(event, data);

    if (!validation.valid) {
      throw new Error(validation.message ?? "Campos obrigatórios ausentes.");
    }

    const { triggerEmailEvent } = await import("./resend.server");
    const result = await triggerEmailEvent({
      event,
      to,
      data: { ...data, is_test: true },
    });

    if (!result?.success || !result.id) {
      throw new Error("O provedor não confirmou o envio do e-mail de teste.");
    }

    return { success: true, id: result.id };
  });

export const sendRawTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        to: z.string().email("Informe um e-mail válido."),
        subject: z.string().min(2),
        html: z.string().min(10),
        data: z.record(z.any()).default({}),
      })
      .parse(input),
  )
  .handler(async ({ data: { to, subject, html, data }, context }) => {
    await assertAdmin(context);

    const { sendResendEmail, renderTemplate } = await import("./resend.server");
    const { wrapCustomHtml } = await import("@/emails/layout");

    const vars = { name: "Churrasqueiro", ...data };
    const renderedSubject = renderTemplate(subject, vars);
    const renderedHtml = renderTemplate(html, vars);

    const result = await sendResendEmail({
      to,
      subject: `[TESTE/RASCUNHO] ${renderedSubject}`,
      html: wrapCustomHtml({
        heading: renderedSubject,
        bodyHtml: renderedHtml,
      }),
      tags: [{ name: "event", value: "modelo_customizado" }],
    });

    if (!result?.success || !result.id) {
      throw new Error("O provedor não confirmou o envio do e-mail de teste.");
    }

    return { success: true, id: result.id };
  });

export const previewRawTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        subject: z.string().min(1),
        html: z.string().min(1),
        data: z.record(z.any()).default({}),
      })
      .parse(input),
  )
  .handler(async ({ data: { subject, html, data }, context }) => {
    await assertAdmin(context);

    const { renderTemplate } = await import("./resend.server");
    const { wrapCustomHtml } = await import("@/emails/layout");

    const vars = { name: "Churrasqueiro", ...data };
    const renderedSubject = renderTemplate(subject, vars);
    const renderedHtml = renderTemplate(html, vars);

    return {
      subject: renderedSubject,
      html: wrapCustomHtml({
        heading: renderedSubject,
        bodyHtml: renderedHtml,
      }),
    };
  });
