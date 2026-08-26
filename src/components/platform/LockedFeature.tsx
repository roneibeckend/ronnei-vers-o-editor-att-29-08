import { Link } from "@tanstack/react-router";
import { Lock, ShoppingBag } from "lucide-react";

export function LockedFeature({
  title = "Recurso exclusivo para alunos",
  description = "Adquira um curso ou e-book para liberar este conteúdo.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="glass rounded-2xl border border-white/10 p-8 sm:p-12 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-fire/10 text-primary ring-1 ring-fire/20">
        <Lock className="h-7 w-7" />
      </div>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      <Link
        to="/app/cursos"
        className="btn-fire mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold"
      >
        <ShoppingBag className="h-4 w-4" />
        Ver cursos e e-books
      </Link>
    </div>
  );
}
