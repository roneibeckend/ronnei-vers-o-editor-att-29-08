import { useState } from "react";
import { X, ShieldAlert, Loader2, PlayCircle } from "lucide-react";

interface ConsultationRecordingDialogProps {
  open: boolean;
  onClose: () => void;
  /** Registra o aceite no servidor e devolve a URL liberada da gravação. */
  onConfirm: (accepted: boolean) => Promise<void> | void;
  consultationTitle: string;
  owner: { name?: string | null; email?: string | null } | null;
}

/**
 * Aceite obrigatório antes de abrir a gravação da consultoria: direitos
 * autorais, confidencialidade e LGPD — mesmo padrão do download de e-books.
 */
export default function ConsultationRecordingDialog({
  open,
  onClose,
  onConfirm,
  consultationTitle,
  owner,
}: ConsultationRecordingDialogProps) {
  const [copyright, setCopyright] = useState(false);
  const [confidential, setConfidential] = useState(false);
  const [lgpd, setLgpd] = useState(false);
  const [loading, setLoading] = useState(false);

  const allAccepted = copyright && confidential && lgpd;

  if (!open) return null;

  async function handleConfirm() {
    if (!allAccepted) return;
    try {
      setLoading(true);
      await onConfirm(true);
      setCopyright(false);
      setConfidential(false);
      setLgpd(false);
      onClose();
    } catch {
      // Erros são notificados pelo chamador; mantemos o modal aberto.
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
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/15 sm:hidden" />

        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-xl bg-[#ff6a00]/10 p-2.5 text-[#ff6a00]">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold leading-tight sm:text-lg">
                Termos de acesso à gravação
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                Conteúdo confidencial
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

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-5 text-left text-[13px] leading-relaxed text-white/60 sm:px-6">
          <p>
            Você vai acessar a gravação de{" "}
            <span className="font-bold text-white">{consultationTitle}</span>. O vídeo é protegido
            pela Lei 9.610/98 (Direitos Autorais) e contém informações confidenciais da sua
            consultoria.
          </p>

          <ul className="space-y-2 rounded-xl border border-white/5 bg-black/40 p-4">
            <li>• O acesso é pessoal e intransferível, vinculado à sua conta.</li>
            <li>
              • É <span className="font-bold text-white">proibido baixar, regravar, publicar ou
              revender</span> o vídeo, no todo ou em parte.
            </li>
            <li>• É proibido compartilhar o link em grupos, redes sociais ou sites.</li>
            <li>• Qualquer uso comercial exige autorização expressa e por escrito do autor.</li>
          </ul>

          <div className="rounded-xl border border-[#ff6a00]/20 bg-[#ff6a00]/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#ff6a00]">
              Acesso registrado (LGPD)
            </p>
            <p className="mt-2 text-white/70">
              Este aceite fica registrado com data, hora e os dados da sua conta:
            </p>
            <p className="mt-1 break-all font-mono text-xs text-white">
              {owner?.name || "—"} · {owner?.email || "—"}
            </p>
            <p className="mt-2 text-white/50">
              A gravação contém dados pessoais e informações do seu negócio, tratados conforme a Lei
              13.709/2018 (LGPD) e a nossa Política de Privacidade, exclusivamente para a prestação
              da consultoria. Em caso de vazamento, a origem poderá ser rastreada até a sua conta.
            </p>
          </div>

          <Consent
            checked={copyright}
            onChange={setCopyright}
            label="Li e aceito os termos de direitos autorais e me comprometo a não compartilhar, copiar, publicar ou revender a gravação."
          />
          <Consent
            checked={confidential}
            onChange={setConfidential}
            label="Reconheço que o conteúdo é confidencial e de uso pessoal e intransferível."
          />
          <Consent
            checked={lgpd}
            onChange={setLgpd}
            label="Estou ciente do tratamento dos meus dados conforme a LGPD e do registro deste acesso."
          />
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-white/5 px-5 pb-4 pt-3 sm:flex-row sm:px-6">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 text-xs font-bold uppercase tracking-widest text-white/60 transition hover:text-white active:bg-white/10 sm:flex-1"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allAccepted || loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff6a00] py-3.5 text-xs font-bold uppercase tracking-widest text-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {loading ? "Liberando..." : "Aceitar e assistir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Consent({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[#ff6a00]"
      />
      <span className="text-white/70">{label}</span>
    </label>
  );
}
