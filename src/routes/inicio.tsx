import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { completeAuthFromUrl } from "@/lib/auth-callback";

export const Route = createFileRoute("/inicio")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrando na área de membros — Espetinho na Veia" },
      { name: "description", content: "Redirecionando você para a sua área de membros Espetinho na Veia." },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: InicioPage,
});

function InicioPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Links antigos de confirmação apontam para /inicio: conclui a sessão antes de redirecionar.
      const result = await completeAuthFromUrl();
      if (cancelled) return;
      navigate({ to: result.status === "success" ? result.redirectTo : "/app", replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return null;
}
