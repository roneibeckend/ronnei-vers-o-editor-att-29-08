import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOnboardingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('user_onboarding' as any)
      .select('*')
      .eq('user_id', context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const onboardingData = data as any;

    // O onboarding automático pertence ao PÓS-COMPRA.
    // Criar uma conta, por si só, não transforma o visitante em aluno.
    //
    // Usamos as matrículas como fonte autoritativa de acesso adquirido.
    // Service role aqui evita qualquer falso negativo causado por RLS,
    // mas o userId continua vindo exclusivamente da sessão autenticada.
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const [courseAccess, ebookAccess] = await Promise.all([
      supabaseAdmin
        .from("course_enrollments")
        .select("course_id", { count: "exact", head: true })
        .eq("user_id", context.userId),
      supabaseAdmin
        .from("ebook_enrollments")
        .select("ebook_id", { count: "exact", head: true })
        .eq("user_id", context.userId),
    ]);

    if (courseAccess.error) {
      throw new Error(courseAccess.error.message);
    }

    if (ebookAccess.error) {
      throw new Error(ebookAccess.error.message);
    }

    const hasPurchasedAccess =
      (courseAccess.count ?? 0) > 0 ||
      (ebookAccess.count ?? 0) > 0;

    return {
      hasSeenOnboarding:
        onboardingData?.has_seen_onboarding ?? false,
      hasPurchasedAccess,
    };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from('user_onboarding' as any)
      .upsert({
        user_id: context.userId,
        has_seen_onboarding: true,
        last_seen_at: new Date().toISOString()
      } as any);

    if (error) throw new Error(error.message);

    return { success: true };
  });
