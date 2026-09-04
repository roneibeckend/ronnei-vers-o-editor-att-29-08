import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "./login";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Criar conta — Espetinho na Veia" },
      {
        name: "description",
        content:
          "Crie sua conta de aluno na plataforma Espetinho na Veia para acessar cursos, e-books e materiais.",
      },
      { property: "og:title", content: "Criar conta — Espetinho na Veia" },
    ],
  }),
  component: CadastroPage,
});

function CadastroPage() {
  return <LoginPage initialMode="signup" />;
}
