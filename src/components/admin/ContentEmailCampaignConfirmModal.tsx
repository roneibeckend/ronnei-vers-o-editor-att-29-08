import type { ReactNode } from "react";
import {
  Info,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ContentEmailCampaignConfirmModalProps = {
  open: boolean;
  contentType: "course" | "ebook";
  contentTitle: string;
  recipients: number;
  alreadySent: boolean;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
};

type DetailCardProps = {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  description: string;
};

function DetailCard({
  icon,
  label,
  children,
  description,
}: DetailCardProps) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3.5 sm:p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#ff6a00]/15 bg-[#ff6a00]/10 text-[#ff6a00]">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
          {label}
        </div>
        <div className="mt-0.5 text-sm font-bold text-white sm:text-[15px]">
          {children}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-white/45">
          {description}
        </p>
      </div>
    </div>
  );
}

export function ContentEmailCampaignConfirmModal({
  open,
  contentType,
  contentTitle,
  recipients,
  alreadySent,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: ContentEmailCampaignConfirmModalProps) {
  const contentLabel = contentType === "ebook" ? "eBook" : "curso";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
        className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto border-[#ff6a00]/45 bg-[#0b0b0d] p-0 text-white shadow-[0_0_70px_rgba(255,106,0,0.16)] sm:rounded-2xl"
      >
        <div className="relative overflow-hidden rounded-[inherit]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(255,106,0,0.20),transparent_60%)]"
          />

          <div className="relative p-5 sm:p-7">
            <DialogHeader className="pr-8 text-left">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#ff7a00]/60 bg-gradient-to-br from-[#ff6a00] to-[#a83b00] text-white shadow-[0_0_28px_rgba(255,106,0,0.30)]">
                  <Send className="h-6 w-6" />
                </div>

                <div className="min-w-0 pt-0.5">
                  <DialogTitle className="text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">
                    Avisar alunos sobre este {contentLabel}?
                  </DialogTitle>
                  <DialogDescription className="mt-1.5 text-xs leading-relaxed text-white/45 sm:text-sm">
                    Campanha de novidade com envio em fila e lotes controlados.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="mt-5 rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">
                Conteúdo selecionado
              </div>
              <div className="mt-1 truncate text-sm font-bold text-white/85">
                {contentTitle || `Novo ${contentLabel}`}
              </div>
            </div>

            {alreadySent && (
              <div className="mt-3 flex gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5 text-xs leading-relaxed text-amber-100/80">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <p>
                  Este conteúdo já teve um anúncio anterior. Ao continuar,
                  será criada uma <strong className="text-amber-300">nova campanha</strong>{" "}
                  para a base elegível atual.
                </p>
              </div>
            )}

            <div className="mt-4 space-y-2.5">
              <DetailCard
                icon={<Users className="h-5 w-5" />}
                label="Alunos elegíveis"
                description="Perfis com status de aluno, e-mail preenchido e notificações por e-mail habilitadas."
              >
                <span className="text-2xl font-black leading-none text-[#ff7a00]">
                  {recipients.toLocaleString("pt-BR")}
                </span>
              </DetailCard>

              <DetailCard
                icon={<Mail className="h-5 w-5" />}
                label="Forma de envio"
                description="A campanha fica registrada no banco e o worker processa os destinatários gradualmente."
              >
                Fila automática <span className="text-[#ff7a00]">•</span> lotes controlados
              </DetailCard>

              <DetailCard
                icon={<ShieldCheck className="h-5 w-5" />}
                label="Segurança"
                description="A validação também acontece no servidor antes da criação da campanha."
              >
                Somente alunos <span className="text-white/25">•</span> sem leads{" "}
                <span className="text-white/25">•</span> conteúdo publicado
              </DetailCard>
            </div>

            <div className="mt-4 flex gap-3 rounded-xl border border-[#ff6a00]/20 bg-[#ff6a00]/[0.055] p-3.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#ff7a00]" />
              <p className="text-[11px] leading-relaxed text-white/55">
                Ao confirmar, a campanha será criada e os e-mails serão enviados
                gradualmente. Você poderá acompanhar enviados, falhas e reenvios no{" "}
                <strong className="text-[#ff7a00]">Histórico de e-mails</strong>.
              </p>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="h-11 rounded-xl border border-white/15 bg-white/[0.025] px-5 text-sm font-bold text-white/75 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => void onConfirm()}
                disabled={isSubmitting}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff8a00] to-[#ff4d00] px-6 text-sm font-black text-black shadow-[0_10px_30px_rgba(255,106,0,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Criando campanha...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {alreadySent ? "Criar nova campanha" : "Criar campanha"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
