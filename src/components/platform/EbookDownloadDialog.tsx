import { useState } from "react";
import { X, ShieldAlert, Loader2, Download } from "lucide-react";

interface EbookDownloadDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (accepted: boolean) => Promise<void> | void;
  ebookTitle: string;
  owner: { name: string; email: string } | null;
}

export default function EbookDownloadDialog({
  open,
  onClose,
  onConfirm,
  ebookTitle,
  owner,
}: EbookDownloadDialogProps) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    if (!accepted) return;
    try {
      setLoading(true);
      await onConfirm(accepted);
      setAccepted(false);
      onClose();
    } catch {
      // Erros (não logado, aceite ausente, limite de downloads) já são
      // notificados pelo chamador; mantemos o modal aberto.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/90 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0e0e0e] pb-[env(safe-area-inset-bottom)] sm:max-h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle (mobile) */}
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/15 sm:hidden" />

        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-xl bg-[#ff6a00]/10 p-2.5 text-[#ff6a00]">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold leading-tight sm:text-lg">
                Aviso de Direitos Autorais
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                Download protegido
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-2.5 transition hover:bg-white/5 active:bg-white/10"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-5 text-left text-[13px] leading-relaxed text-white/60 sm:px-6">
          <p>
            Você está baixando <span className="font-bold text-white">{ebookTitle}</span>. Este
            material é protegido pela Lei 9.610/98 (Direitos Autorais).
          </p>
          <ul className="space-y-2 rounded-xl border border-white/5 bg-black/40 p-4">
            <li>
              • É <span className="font-bold text-white">proibida a revenda</span> deste material,
              total ou parcial.
            </li>
            <li>
              • É proibido compartilhar, redistribuir ou publicar o arquivo em grupos, redes sociais
              ou sites.
            </li>
            <li>• É proibido qualquer uso comercial sem autorização expressa e por escrito do autor.</li>
            <li>
              • O uso é <span className="font-bold text-white">pessoal e intransferível</span>.
            </li>
          </ul>
          <div className="rounded-xl border border-[#ff6a00]/20 bg-[#ff6a00]/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#ff6a00]">
              Cópia identificada
            </p>
            <p className="mt-2 text-white/70">Todas as páginas do PDF serão marcadas com seus dados:</p>
            <p className="mt-1 break-all font-mono text-xs text-white">
              {owner?.name || "—"} · {owner?.email || "—"}
            </p>
            <p className="mt-2 text-white/50">
              Em caso de distribuição irregular, a cópia poderá ser rastreada até a sua conta, com
              responsabilização civil e criminal.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-4">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#ff6a00]"
            />
            <span className="text-white/70">
              Declaro que li e concordo com os termos acima e que o uso para venda ou distribuição é
              proibido.
            </span>
          </label>
        </div>

        {/* Ações fixas */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-white/5 px-5 pb-4 pt-3 sm:flex-row sm:px-6">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 text-xs font-bold uppercase tracking-widest text-white/60 transition hover:text-white active:bg-white/10 sm:flex-1"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!accepted || loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff6a00] py-3.5 text-xs font-bold uppercase tracking-widest text-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {loading ? "Gerando PDF..." : "Aceitar e baixar"}
          </button>
        </div>
      </div>
    </div>
  );
}
