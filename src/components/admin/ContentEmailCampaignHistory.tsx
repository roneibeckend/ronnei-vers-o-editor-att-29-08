import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  getContentEmailCampaignRecipients,
  listContentEmailCampaigns,
  retryContentEmailCampaignFailures,
} from "@/lib/content-notify.functions";

type Props = { contentType: "course" | "ebook" };

const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  processing: "Enviando",
  completed: "Concluída",
  completed_with_errors: "Concluída com falhas",
  cancelled: "Cancelada",
};

function dt(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

export function ContentEmailCampaignHistory({ contentType }: Props) {
  const listCampaigns = useServerFn(listContentEmailCampaigns);
  const getRecipients = useServerFn(getContentEmailCampaignRecipients);
  const retryFailures = useServerFn(retryContentEmailCampaignFailures);

  const [open, setOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const rows: any = await listCampaigns();
      setCampaigns(Array.isArray(rows) ? rows : []);
    } catch (error: any) {
      toast.error("Erro ao carregar campanhas: " + (error?.message || error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [open]);

  const visible = useMemo(
    () => campaigns.filter((campaign) => campaign.content_type === contentType),
    [campaigns, contentType],
  );

  async function toggleDetails(campaignId: string) {
    if (detailsId === campaignId) {
      setDetailsId(null);
      setRecipients([]);
      return;
    }

    try {
      setLoadingDetails(true);
      const rows: any = await getRecipients({ data: { campaignId } });
      setRecipients(Array.isArray(rows) ? rows : []);
      setDetailsId(campaignId);
    } catch (error: any) {
      toast.error("Erro ao carregar destinatários: " + (error?.message || error));
    } finally {
      setLoadingDetails(false);
    }
  }

  async function retry(campaign: any) {
    if (
      !confirm(
        `Reenviar somente os ${campaign.failed_count} e-mail(s) que falharam nesta campanha?`,
      )
    ) {
      return;
    }

    try {
      const result: any = await retryFailures({ data: { campaignId: campaign.id } });
      if (result?.success) {
        toast.success(`${result.retried} falha(s) voltaram para a fila.`);
        await load();
      } else {
        toast.error(result?.message || "Nenhuma falha para reenviar.");
      }
    } catch (error: any) {
      toast.error("Erro ao reenviar falhas: " + (error?.message || error));
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#111] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2 text-left">
          <Mail className="h-4 w-4 text-[#ff6a00]" />
          <div>
            <div className="text-sm font-bold">Histórico de e-mails</div>
            <div className="text-[10px] text-white/40">Campanhas, entregas e falhas</div>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-white/40" />
        ) : (
          <ChevronDown className="h-4 w-4 text-white/40" />
        )}
      </button>

      {open && (
        <div className="border-t border-white/5 p-4 space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 text-xs text-white/50 hover:text-white disabled:opacity-40"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Atualizar
            </button>
          </div>

          {!loading && visible.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-white/40">
              Nenhuma campanha registrada ainda.
            </div>
          )}

          {visible.map((campaign) => (
            <div key={campaign.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{campaign.title}</div>
                  <div className="mt-1 text-[10px] text-white/40">
                    {dt(campaign.created_at)} · {STATUS_LABEL[campaign.status] || campaign.status}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center shrink-0">
                  <div className="rounded-md bg-white/5 px-3 py-2">
                    <div className="text-sm font-bold">{campaign.total_recipients}</div>
                    <div className="text-[9px] uppercase text-white/35">Total</div>
                  </div>
                  <div className="rounded-md bg-green-500/10 px-3 py-2">
                    <div className="text-sm font-bold text-green-400">{campaign.sent_count}</div>
                    <div className="text-[9px] uppercase text-white/35">Enviados</div>
                  </div>
                  <div className="rounded-md bg-red-500/10 px-3 py-2">
                    <div className="text-sm font-bold text-red-400">{campaign.failed_count}</div>
                    <div className="text-[9px] uppercase text-white/35">Falhas</div>
                  </div>
                </div>
              </div>

              {campaign.next_run_at && (
                <div className="mt-2 rounded-md bg-yellow-500/10 px-3 py-2 text-[10px] text-yellow-300">
                  Próxima tentativa: {dt(campaign.next_run_at)}
                </div>
              )}

              {campaign.last_error && (
                <div className="mt-2 text-[10px] text-red-300/80 break-words">
                  {campaign.last_error}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleDetails(campaign.id)}
                  disabled={loadingDetails && detailsId !== campaign.id}
                  className="rounded-md border border-white/10 px-3 py-1.5 text-[10px] font-bold hover:bg-white/5"
                >
                  {detailsId === campaign.id ? "Ocultar detalhes" : "Ver detalhes"}
                </button>

                {Number(campaign.failed_count) > 0 && (
                  <button
                    type="button"
                    onClick={() => retry(campaign)}
                    className="flex items-center gap-1.5 rounded-md border border-[#ff6a00]/30 px-3 py-1.5 text-[10px] font-bold text-[#ff8c33] hover:bg-[#ff6a00]/10"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reenviar falhas
                  </button>
                )}
              </div>

              {detailsId === campaign.id && (
                <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-white/5">
                  <table className="w-full text-left text-[10px] min-w-[620px]">
                    <thead className="sticky top-0 bg-[#161616] text-white/40 uppercase">
                      <tr>
                        <th className="px-3 py-2">Aluno</th>
                        <th className="px-3 py-2">E-mail</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Tentativas</th>
                        <th className="px-3 py-2">Erro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {recipients.map((recipient) => (
                        <tr key={recipient.id}>
                          <td className="px-3 py-2">{recipient.name || "Aluno"}</td>
                          <td className="px-3 py-2">{recipient.email}</td>
                          <td className="px-3 py-2">{recipient.status}</td>
                          <td className="px-3 py-2">{recipient.attempts}</td>
                          <td className="px-3 py-2 text-red-300/70 max-w-[260px] truncate">
                            {recipient.last_error || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
