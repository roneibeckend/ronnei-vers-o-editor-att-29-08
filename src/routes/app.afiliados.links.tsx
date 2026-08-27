import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Link as LinkIcon, 
  Copy, 
  ExternalLink, 
  Plus, 
  Loader2,
  Check,
  Globe
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/afiliados/links")({
  component: AffiliateLinksPage,
});

function AffiliateLinksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: links, isLoading } = useQuery({
    queryKey: ["affiliate-links", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliate_links")
        .select(`
          *,
          course:courses(title)
        `)
        .eq("affiliate_id", user?.id as string)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const { data: courses } = useQuery({
    queryKey: ["available-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title")
        .eq("affiliate_enabled", true);
      if (error) throw error;
      return data;
    }
  });


  const createLinkMutation = useMutation({
    mutationFn: async (courseId: string | null) => {
      const code = `${user?.id?.slice(0, 4).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const { data, error } = await supabase.from("affiliate_links").insert({
        affiliate_id: user?.id as string,
        course_id: courseId,
        code: code
      }).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["affiliate-links"] });
      toast.success("Link gerado com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao gerar link: " + error.message);
    }
  });

  const copyToClipboard = (code: string, id: string) => {
    const url = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success("Link copiado!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-fire" />
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="w-full max-w-full space-y-6 text-left overflow-x-hidden">
      <div className="space-y-4 lg:flex lg:items-center lg:justify-between lg:gap-6 lg:space-y-0">
        <h2 className="text-lg sm:text-xl font-bold break-words">Seus Links de Divulgação</h2>
        <div className="flex flex-col gap-3 w-full lg:w-auto lg:min-w-[340px]">
          <div className="bg-fire/5 border border-fire/20 p-3 rounded-xl flex items-center gap-3 w-full max-w-full">
            <div className="min-w-0 flex-1">
              <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-fire truncate">
                Link de Indicação (Afiliados)
              </div>
              <div className="text-xs text-white/60 truncate">
                {origin}/login?ref={user?.id?.slice(0, 8)}
              </div>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${origin}/login?ref=${user?.id?.slice(0, 8)}`);
                toast.success("Link de indicação copiado!");
              }}
              className="p-2 hover:bg-fire/10 rounded-lg text-fire transition shrink-0"
              aria-label="Copiar link de indicação"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => createLinkMutation.mutate(null)}
            disabled={createLinkMutation.isPending}
            className="btn-ghost-fire text-xs flex items-center justify-center gap-2 h-fit w-full py-3 sm:py-2.5 whitespace-nowrap"
          >
            <Globe className="w-4 h-4 shrink-0" /> Gerar Link Global
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 min-w-0">
        <section className="glass p-4 sm:p-6 rounded-2xl border border-white/5 bg-white/[0.02] min-w-0">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Plus className="w-4 h-4 text-fire shrink-0" /> Gerar Link por Curso
          </h3>
          <div className="space-y-3">
            {courses?.map(course => {
              const hasLink = links?.some(l => l.course_id === course.id);
              return (
                <div key={course.id} className="flex items-center p-3 rounded-xl bg-white/5 border border-white/5 gap-3 min-w-0">
                  <span className="text-sm font-medium flex-1 min-w-0 break-words line-clamp-2">{course.title}</span>
                  <button
                    disabled={hasLink || createLinkMutation.isPending}
                    onClick={() => createLinkMutation.mutate(course.id)}
                    className="shrink-0 w-11 h-11 rounded-lg bg-fire/10 text-fire hover:bg-fire/20 transition disabled:opacity-30 flex items-center justify-center"
                    aria-label={hasLink ? "Link já criado" : `Gerar link para ${course.title}`}
                  >
                    {hasLink ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
            {courses?.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum curso disponível no momento.</p>
            )}
          </div>
        </section>

        <section className="space-y-4 min-w-0">
          {links && links.length > 0 ? (
            links.map((link) => (
              <div key={link.id} className="glass p-4 sm:p-5 rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden min-w-0">
                <div className="flex items-start justify-between gap-3 mb-4 min-w-0">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="bg-fire/20 p-2.5 rounded-lg shrink-0">
                      <LinkIcon className="w-4 h-4 text-fire" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm leading-tight mb-1 break-words line-clamp-2">
                        {link.course ? `Curso: ${link.course.title}` : "Link Global / Home"}
                      </h4>
                      <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate">
                        Código: {link.code}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 text-right">
                    <div className="text-xl sm:text-2xl font-display font-black text-white leading-none">{link.clicks || 0}</div>
                    <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Cliques</div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                  <div className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-3 sm:py-2 text-xs text-white/50 flex items-center min-h-[44px]">
                    <span className="block w-full truncate">{origin}/?ref={link.code}</span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => copyToClipboard(link.code, link.id)}
                      className="flex-1 sm:flex-none px-4 sm:px-0 rounded-lg bg-white/5 hover:bg-white/10 text-white transition flex items-center justify-center gap-2 min-w-[44px] min-h-[44px] sm:w-11"
                      aria-label="Copiar link"
                    >
                      {copiedId === link.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      <span className="text-xs font-semibold sm:hidden">Copiar</span>
                    </button>
                    <a
                      href={`${origin}/?ref=${link.code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 sm:flex-none px-4 sm:px-0 rounded-lg bg-white/5 hover:bg-white/10 text-white transition flex items-center justify-center gap-2 min-w-[44px] min-h-[44px] sm:w-11"
                      aria-label="Abrir link"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span className="text-xs font-semibold sm:hidden">Abrir</span>
                    </a>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="glass p-8 sm:p-10 rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center">
               <LinkIcon className="w-10 h-10 text-white/10 mb-4" />
               <p className="text-sm text-muted-foreground">Nenhum link gerado ainda.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
