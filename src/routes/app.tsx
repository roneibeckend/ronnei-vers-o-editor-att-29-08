import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Shell } from "@/components/platform/Shell";
import { supabase } from "@/integrations/supabase/client";
import { AsaasPaymentModal } from "@/components/platform/AsaasPaymentModal";
import { OnboardingGuide } from "@/components/platform/OnboardingGuide";
import { getIntegrationConfig, getIntegrationStatus, getIntegrationSettings } from "@/lib/integration-settings";

export const Route = createFileRoute("/app")({
  ssr: false,
  loader: async ({ context: { queryClient } }) => {
    let { data: { session } } = await supabase.auth.getSession();

    // Confirma que o token ainda é válido no servidor. Tokens revogados/expirados
    // ficavam salvos no navegador e geravam recarga infinita entre /login e /app.
    if (session) {
      const { data: userData, error } = await supabase.auth.getUser();
      if (error || !userData.user) {
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          /* ignora */
        }
        session = null;
      }
    }

    if (!session) {
      const currentPath = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/app';
      throw redirect({
        to: '/login',
        search: {
          redirectTo: currentPath,
        },
      });
    }


    // Parallel prefetch common app data
    await Promise.all([
      queryClient.ensureQueryData({
        queryKey: ["user-enrollments", session.user.id],
        queryFn: async () => {
          const [courses, ebooks] = await Promise.all([
             supabase.from("course_enrollments").select("course_id").eq("user_id", session.user.id),
             supabase.from("ebook_enrollments").select("ebook_id").eq("user_id", session.user.id)
          ]);
          return {
            courseEnrollments: courses.data?.map(e => e.course_id) || [],
            ebookEnrollments: ebooks.data?.map(e => e.ebook_id) || []
          };
        }
      }),
      queryClient.ensureQueryData({
        queryKey: ["interactive-previews-status"],
        queryFn: async () => {
          return await getIntegrationStatus('interactive_previews');
        }
      })
    ]);
  },
  head: () => ({
    meta: [
      { title: "Plataforma — Espetinho na Veia" },
      { name: "description", content: "Área de membros da plataforma Espetinho na Veia — cursos, e-books, receitas e materiais." },
    ],
  }),
  component: AppGate,
});

function AppGate() {
  return (
    <>
      <Shell>
        <Outlet />
      </Shell>
      <AsaasPaymentModal />
      <OnboardingGuide />
    </>
  );
}