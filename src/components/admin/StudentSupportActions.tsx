import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, MailCheck, Send, Pencil, Loader2, LifeBuoy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  adminSendPasswordReset,
  adminResendEmailConfirmation,
  adminResendTransactionalEmail,
  adminUpdateStudentEmail,
} from "@/lib/student-support-admin.functions";

const TRANSACTIONAL_OPTIONS = [
  { value: "welcome", label: "Boas-vindas" },
  { value: "payment_approved", label: "Compra aprovada" },
  { value: "access_granted", label: "Acesso liberado" },
  { value: "invoice_created", label: "Fatura criada" },
  { value: "payout_requested", label: "Solicitação de saque" },
  { value: "payout_paid", label: "Saque enviado" },
] as const;

type PendingAction =
  | { kind: "reset" }
  | { kind: "confirmation" }
  | { kind: "transactional"; event: (typeof TRANSACTIONAL_OPTIONS)[number]["value"] }
  | { kind: "email"; email: string; reason: string };

interface Props {
  studentId: string;
  email: string | null;
  verifiedAt: string | null;
  onUpdated?: () => void;
}

export function StudentSupportActions({ studentId, email, verifiedAt, onUpdated }: Props) {
  const resetFn = useServerFn(adminSendPasswordReset);
  const confirmationFn = useServerFn(adminResendEmailConfirmation);
  const transactionalFn = useServerFn(adminResendTransactionalEmail);
  const updateEmailFn = useServerFn(adminUpdateStudentEmail);

  const [event, setEvent] = useState<(typeof TRANSACTIONAL_OPTIONS)[number]["value"]>("welcome");
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState(email ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [running, setRunning] = useState(false);

  const describe = (action: PendingAction) => {
    switch (action.kind) {
      case "reset":
        return {
          title: "Enviar redefinição de senha?",
          body: `Um link seguro de redefinição será enviado para ${email ?? "o e-mail do aluno"}. A ação será registrada em auditoria.`,
          cta: "Enviar link",
        };
      case "confirmation":
        return {
          title: "Reenviar confirmação de e-mail?",
          body: `Um novo código de 6 dígitos será enviado para ${email ?? "o e-mail do aluno"}, válido por 30 minutos.`,
          cta: "Reenviar código",
        };
      case "transactional":
        return {
          title: "Reenviar e-mail transacional?",
          body: `O e-mail "${TRANSACTIONAL_OPTIONS.find((o) => o.value === action.event)?.label}" será reenviado com os dados reais do aluno.`,
          cta: "Reenviar e-mail",
        };
      case "email":
        return {
          title: "Confirmar alteração de e-mail?",
          body: `O e-mail será alterado de ${email ?? "(vazio)"} para ${action.email}. O valor anterior, o novo valor e o responsável ficarão registrados em auditoria.`,
          cta: "Alterar e-mail",
        };
    }
  };

  async function execute() {
    if (!pending) return;
    setRunning(true);
    try {
      if (pending.kind === "reset") {
        await resetFn({ data: { studentId } });
        toast.success("Link de redefinição enviado com sucesso.");
      } else if (pending.kind === "confirmation") {
        const res: any = await confirmationFn({ data: { studentId } });
        toast.success(
          res?.alreadyVerified
            ? "Este e-mail já está confirmado — nenhum código foi necessário."
            : "Novo código de confirmação enviado.",
        );
      } else if (pending.kind === "transactional") {
        await transactionalFn({ data: { studentId, event: pending.event } });
        toast.success("E-mail transacional reenviado com sucesso.");
      } else {
        await updateEmailFn({
          data: { studentId, email: pending.email, reason: pending.reason || undefined },
        });
        toast.success("E-mail do aluno atualizado.");
        setEmailOpen(false);
        setReason("");
      }
      onUpdated?.();
      setPending(null);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao executar a ação.");
    } finally {
      setRunning(false);
    }
  }

  const confirmation = pending ? describe(pending) : null;
  const btn =
    "flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] font-bold uppercase tracking-widest transition disabled:opacity-40";

  return (
    <section className="glass space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 text-[#ff6a00]" />
        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
          Suporte e recuperação de acesso
        </h4>
      </div>

      <p className="text-xs text-white/40">
        Ações registradas em auditoria. Nenhuma delas altera permissões ou acessos do aluno.
      </p>

      <div className="grid gap-2">
        <button className={btn} disabled={!email} onClick={() => setPending({ kind: "reset" })}>
          <KeyRound className="h-4 w-4 text-[#ff6a00]" /> Redefinir senha
        </button>

        <button
          className={btn}
          disabled={!email}
          onClick={() => setPending({ kind: "confirmation" })}
        >
          <MailCheck className="h-4 w-4 text-[#ff6a00]" />
          {verifiedAt ? "E-mail já confirmado" : "Reenviar confirmação"}
        </button>

        <div className="rounded-xl border border-white/5 bg-white/[0.01] p-3 space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            Reenviar e-mail transacional
          </label>
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value as typeof event)}
            className="w-full bg-white/5 border border-white/10 p-2.5 rounded-lg text-sm outline-none focus:border-[#ff6a00]"
          >
            {TRANSACTIONAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-[#0e0e0e]">
                {o.label}
              </option>
            ))}
          </select>
          <button
            className={`${btn} w-full`}
            disabled={!email}
            onClick={() => setPending({ kind: "transactional", event })}
          >
            <Send className="h-4 w-4 text-[#ff6a00]" /> Reenviar
          </button>
        </div>

        <button
          className={btn}
          onClick={() => {
            setNewEmail(email ?? "");
            setEmailOpen(true);
          }}
        >
          <Pencil className="h-4 w-4 text-[#ff6a00]" /> Corrigir e-mail
        </button>
      </div>

      {/* Correção de e-mail */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="bg-[#0e0e0e] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Corrigir e-mail do aluno</DialogTitle>
            <p className="text-sm text-white/40 mt-2">
              E-mail atual: <span className="font-mono break-all">{email ?? "(vazio)"}</span>
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Novo e-mail
              </label>
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="aluno@email.com"
                className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Motivo (opcional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: aluno informou erro de digitação no cadastro."
                className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] min-h-[80px] resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setEmailOpen(false)}
              className="flex-1 py-3 rounded-xl bg-white/5 font-bold hover:bg-white/10 transition uppercase tracking-widest text-[10px]"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const value = newEmail.trim().toLowerCase();
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
                  toast.error("Informe um e-mail válido.");
                  return;
                }
                setPending({ kind: "email", email: value, reason });
              }}
              className="flex-1 py-3 rounded-xl bg-[#ff6a00] text-black font-bold hover:scale-[1.02] active:scale-[0.98] transition uppercase tracking-widest text-[10px]"
            >
              Continuar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação genérica */}
      <Dialog open={!!pending} onOpenChange={(open) => !open && !running && setPending(null)}>
        <DialogContent className="bg-[#0e0e0e] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{confirmation?.title}</DialogTitle>
            <p className="text-sm text-white/50 mt-2 break-words">{confirmation?.body}</p>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setPending(null)}
              disabled={running}
              className="flex-1 py-3 rounded-xl bg-white/5 font-bold hover:bg-white/10 transition uppercase tracking-widest text-[10px] disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={execute}
              disabled={running}
              className="flex-1 py-3 rounded-xl bg-[#ff6a00] text-black font-bold hover:scale-[1.02] active:scale-[0.98] transition uppercase tracking-widest text-[10px] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {running ? "Executando..." : confirmation?.cta}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
