import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Download,
  Image as ImageIcon,
  Video,
  FileText,
  Search,
  Loader2,
  Copy,
  Link as LinkIcon,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { downloadFromResponse, openExternal } from "@/lib/download";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { listFidelizePlans } from "@/lib/fidelize-products.functions";
import {
  buildKitCopies,
  generateAffiliateKitPPTX,
  KIT_FORMAT_LABELS,
  type KitFormat,
  type KitProduct,
} from "@/lib/affiliate-kit-generator";

const TABS = [
  { key: "curso", label: "Cursos" },
  { key: "ebook", label: "E-books" },
  { key: "consultoria", label: "Consultorias" },
  { key: "fidelize", label: "Fidelize" },
] as const;

function AffiliateKits() {
  const { user } = useAuth();
  const refCode = user?.id?.slice(0, 8) ?? "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [tab, setTab] = useState<KitProduct["type"]>("curso");
  const [format, setFormat] = useState<KitFormat>("story");
  const [busy, setBusy] = useState<string | null>(null);
  const listFidelize = useServerFn(listFidelizePlans);

  const { data: products, isLoading } = useQuery({
    queryKey: ["affiliate-kit-products", refCode],
    queryFn: async (): Promise<KitProduct[]> => {
      const [courses, ebooks, consults, plans] = await Promise.all([
        supabase
          .from("courses")
          .select("id, title, description, price, cover_url")
          .eq("status", "active"),
        supabase
          .from("ebooks")
          .select("id, title, description, price, cover_url")
          .eq("status", "active"),
        supabase
          .from("consultation_products")
          .select("id, title, subtitle, description, price, cover_url, duration_minutes")
          .eq("status", "active"),
        listFidelize({} as any).catch(() => [] as any[]),
      ]);

      const items: KitProduct[] = [];

      (courses.data ?? []).forEach((c: any) =>
        items.push({
          type: "curso",
          title: c.title,
          price: Number(c.price ?? 0),
          description: c.description ?? undefined,
          coverUrl: c.cover_url,
          bullets: [
            "Aulas online com acesso imediato",
            "Método prático testado na operação real",
            "Certificado de conclusão",
            "Suporte dentro da plataforma",
          ],
          link: `${origin}/app/cursos?ref=${refCode}`,
        }),
      );

      (ebooks.data ?? []).forEach((e: any) =>
        items.push({
          type: "ebook",
          title: e.title,
          price: Number(e.price ?? 0),
          description: e.description ?? undefined,
          coverUrl: e.cover_url,
          bullets: [
            "Download imediato após a compra",
            "Passo a passo direto ao ponto",
            "Leitura no celular ou computador",
          ],
          link: `${origin}/?ref=${refCode}`,
        }),
      );

      (consults.data ?? []).forEach((c: any) =>
        items.push({
          type: "consultoria",
          title: c.title,
          price: Number(c.price ?? 0),
          description: c.subtitle ?? c.description ?? undefined,
          coverUrl: c.cover_url,
          bullets: [
            `${c.duration_minutes ?? 60} minutos de atendimento individual`,
            "Diagnóstico do seu negócio ponto a ponto",
            "Plano de ação personalizado",
            "Gravação disponível depois da sessão",
          ],
          link: `${origin}/app/consultorias?ref=${refCode}`,
        }),
      );

      ((plans as any[]) ?? [])
        .filter((p: any) => p.active && p.affiliateEnabled)
        .forEach((p: any) =>
          items.push({
            type: "fidelize",
            title: p.label,
            price: Number(p.price ?? 0),
            pricePeriod: "/mês",
            description: p.description ?? p.tagline ?? undefined,
            coverUrl: p.coverUrl ?? null,
            bullets: (p.modules ?? []).slice(0, 5),
            link: `${origin}/fidelize/${p.plan}?ref=${refCode}`,
          }),
        );

      return items;
    },
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const list = (products ?? []).filter((p) => p.type === tab);

  return (
    <section className="glass rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-fire" /> Kits por produto (editáveis no Canva)
          </h3>
          <p className="text-xs text-muted-foreground">
            Baixe o .pptx, importe no Canva e edite textos, preços e cores. O link já sai com o seu código.
          </p>
        </div>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as KitFormat)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
          aria-label="Formato do kit"
        >
          {Object.entries(KIT_FORMAT_LABELS).map(([k, label]) => (
            <option key={k} value={k} className="bg-black">
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition ${
              tab === t.key ? "bg-fire text-white" : "bg-white/5 text-white/50 hover:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-fire" />
        </div>
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground italic">
          Nenhum produto liberado nesta categoria por enquanto.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const copies = buildKitCopies(p);
            const id = `${p.type}-${p.title}`;
            return (
              <div
                key={id}
                className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 flex flex-col gap-3 min-w-0"
              >
                {p.coverUrl && (
                  <img
                    src={p.coverUrl}
                    alt={p.title}
                    loading="lazy"
                    className="w-full h-32 object-cover rounded-xl"
                  />
                )}
                <div className="min-w-0">
                  <h4 className="font-bold text-sm leading-tight break-words">{p.title}</h4>
                  <div className="text-xs text-fire font-bold mt-1">
                    {p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    {p.pricePeriod ?? ""}
                  </div>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy === id}
                    onClick={async () => {
                      setBusy(id);
                      try {
                        await generateAffiliateKitPPTX(p, format);
                        toast.success("Kit gerado! Importe o .pptx no Canva.");
                      } catch (err: any) {
                        toast.error("Falha ao gerar o kit: " + (err?.message ?? "erro"));
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="col-span-2 btn-ghost-fire text-xs flex items-center justify-center gap-2 py-2.5"
                  >
                    {busy === id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Baixar artes (.pptx)
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(copies.whatsapp, "Texto")}
                    className="text-xs bg-white/5 hover:bg-white/10 rounded-lg py-2.5 flex items-center justify-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(p.link, "Link")}
                    className="text-xs bg-white/5 hover:bg-white/10 rounded-lg py-2.5 flex items-center justify-center gap-1.5"
                  >
                    <LinkIcon className="w-3.5 h-3.5" /> Link
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}



export const Route = createFileRoute("/app/afiliados/materiais")({
  head: () => ({
    meta: [
      { title: "Materiais de Divulgação" },
      { name: "description", content: "Baixe artes, vídeos e textos prontos para divulgar os produtos." },
      { property: "og:title", content: "Materiais de Divulgação" },
      { property: "og:description", content: "Baixe artes, vídeos e textos prontos para divulgar os produtos." },
    ],
  }),
  component: AffiliateMaterialsPage,
});

function AffiliateMaterialsPage() {
  const [search, setSearch] = useState("");

  const { data: materials, isLoading } = useQuery({
    queryKey: ["affiliate-materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliate_materials" as any)
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as any[];
    }
  });

  const filtered = materials?.filter(m => 
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.category.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-fire" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <AffiliateKits />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Materiais de Divulgação</h2>
          <p className="text-sm text-muted-foreground">Artes, vídeos e textos prontos para você usar em suas campanhas.</p>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/20" />
          <input 
            placeholder="Buscar material..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 py-2 pl-10 pr-4 rounded-lg text-sm outline-none focus:border-fire/50" 
          />
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered?.map((material) => (
          <div key={material.id} className="glass rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden group flex flex-col">
            <div className="aspect-video bg-white/5 relative">
              {material.thumbnail_url ? (
                <img src={material.thumbnail_url} alt={material.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/10">
                  {material.category === 'banner' && <ImageIcon className="w-12 h-12" />}
                  {material.category === 'video' && <Video className="w-12 h-12" />}
                  {material.category === 'copy' && <FileText className="w-12 h-12" />}
                </div>
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(material.file_url, { cache: "no-store" });
                      await downloadFromResponse(
                        res,
                        material.file_url.split("/").pop() || material.title
                      );
                    } catch {
                      openExternal(material.file_url);
                    }
                  }}
                  aria-label={`Baixar ${material.title}`}
                  className="bg-fire text-white p-3 rounded-full hover:scale-110 transition-transform"
                >
                  <Download className="w-5 h-5" />
                </button>

              </div>
            </div>
            <div className="p-4 sm:p-5 flex-1 flex flex-col min-w-0">
              <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-fire mb-1 truncate">{material.category}</div>
              <h4 className="font-bold text-sm mb-1 truncate leading-tight">{material.title}</h4>
              {material.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mt-auto pt-2">{material.description}</p>
              )}
            </div>
          </div>
        ))}

        {filtered?.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground italic">
            Nenhum material de apoio disponível no momento.
          </div>
        )}
      </div>
    </div>
  );
}