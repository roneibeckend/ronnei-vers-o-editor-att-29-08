import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/platform/Shell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Clock, Video, ExternalLink, Loader2, PlayCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock } from "lucide-react";
import { useHasPurchase } from "@/hooks/use-access";
import { LockedFeature } from "@/components/platform/LockedFeature";

export const Route = createFileRoute("/app/ao-vivo")({
  head: () => ({
    meta: [{ title: "Aulas ao Vivo — Espetinho na Veia" }],
  }),
  component: LiveClassesPage,
});

function LiveClassesPage() {
  const { data: liveClasses, isLoading } = useQuery({
    queryKey: ["live-classes-student"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_classes")
        .select("*")
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const upcomingClasses = liveClasses?.filter(c => c.status !== 'completed') || [];
  const pastClasses = liveClasses?.filter(c => c.status === 'completed') || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader 
        title="Aulas ao Vivo" 
        subtitle="Participe das nossas transmissões ao vivo e tire suas dúvidas em tempo real."
      />

      <section className="space-y-6">
        <h2 className="font-display text-xl font-bold flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-primary" />
          Próximas Transmissões
        </h2>
        
        {upcomingClasses.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {upcomingClasses.map((live) => (
              <LiveClassCard key={live.id} live={live} />
            ))}
          </div>
        ) : (
          <div className="glass rounded-2xl p-12 text-center">
            <Calendar className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">Nenhuma aula agendada para o momento</h3>
            <p className="text-sm text-muted-foreground/60 mt-1">Fique atento às notificações para novas datas!</p>
          </div>
        )}
      </section>

      {pastClasses.length > 0 && (
        <section className="space-y-6 opacity-80">
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Aulas Encerradas
          </h2>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {pastClasses.map((live) => (
              <LiveClassCard key={live.id} live={live} isPast />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LiveClassCard({ live, isPast = false }: { live: any; isPast?: boolean }) {
  const date = new Date(live.scheduled_at);
  const isLive = live.status === 'live';

  return (
    <div className={`glass overflow-hidden rounded-2xl border transition-all duration-300 flex flex-col h-full ${isLive ? 'border-primary ring-1 ring-primary/20' : 'border-white/5'}`}>
      <div className="relative aspect-[16/9] bg-muted/20 sm:aspect-video">
        {live.cover_url ? (
          <img 
            src={live.cover_url} 
            alt={live.title} 
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" 
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Video className={`h-12 w-12 ${isLive ? 'text-primary animate-pulse' : 'text-muted-foreground/20'}`} />
          </div>
        )}
        
        {isLive && (
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg animate-pulse z-10">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            Ao Vivo
          </div>
        )}

        {!isPast && !isLive && (
          <div className="absolute top-3 left-3 rounded-full bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gold z-10">
            Agendada
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5 space-y-3 sm:space-y-4 flex flex-col flex-1">
        <div>
          <h3 className="font-display text-base sm:text-lg font-bold line-clamp-1">{live.title}</h3>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground line-clamp-2 min-h-[32px] sm:min-h-[40px]">
            {live.description || "Nenhuma descrição disponível."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 sm:h-4 w-4 text-primary/60" />
            {format(date, "dd 'de' MMMM", { locale: ptBR })}
          </div>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 sm:h-4 w-4 text-primary/60" />
            {format(date, "HH:mm", { locale: ptBR })}h
          </div>
        </div>

        <div className="pt-2 mt-auto">
          {isPast ? (
            <button 
              disabled 
              className="w-full py-2.5 rounded-xl bg-white/5 text-muted-foreground text-xs font-bold uppercase tracking-widest cursor-not-allowed border border-white/5"
            >
              Aula Finalizada
            </button>
          ) : (
            <a
              href={live.link || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex w-full items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all active:scale-[0.98] touch-action-manipulation ${
                isLive 
                  ? 'btn-fire shadow-lg shadow-primary/20' 
                  : 'bg-white/5 border border-white/10 hover:border-primary/50 text-foreground'
              }`}
            >
              {isLive ? (
                <>
                  <PlayCircle className="h-4 w-4" />
                  Entrar na Aula Agora
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" />
                  Link de Acesso
                </>
              )}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}