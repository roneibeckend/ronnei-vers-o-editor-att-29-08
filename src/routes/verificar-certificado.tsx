import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Search,
  Loader2,
  Award,
  Calendar,
  User,
  BookOpen,
  QrCode,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { verifyCertificate } from "@/lib/certificates-verify.functions";
import { CertificateQrCode } from "@/components/platform/CertificateQrCode";

export const Route = createFileRoute("/verificar-certificado")({
  validateSearch: (search: Record<string, unknown>) => ({
    codigo: typeof search.codigo === "string" ? search.codigo : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Validar Certificado — Ronnei na Veia" },
      {
        name: "description",
        content:
          "Confira a autenticidade de um certificado emitido pela Academia Ronnei na Veia informando o código de validação.",
      },
      { property: "og:title", content: "Validar Certificado — Ronnei na Veia" },
      {
        property: "og:description",
        content: "Verificação pública e gratuita de certificados da Academia Ronnei na Veia.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://ronneinaveia.com.br/verificar-certificado" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://ronneinaveia.com.br/verificar-certificado" }],
  }),
  component: VerificarCertificado,
});

type VerifyResult = Awaited<ReturnType<typeof verifyCertificate>>;

function VerificarCertificado() {
  const { codigo } = Route.useSearch();
  const navigate = useNavigate();
  const verify = useServerFn(verifyCertificate);

  const [code, setCode] = useState(codigo ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runVerification(rawCode: string) {
    const value = rawCode.trim().toUpperCase();
    if (!value) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await verify({ data: { code: value } });
      if (!data.found) {
        setError("Certificado não encontrado. Verifique o código e tente novamente.");
        return;
      }
      if (!data.isValid) {
        setError("Este certificado foi revogado e não é mais válido.");
        return;
      }
      setResult(data);
    } catch (err) {
      console.error(err);
      setError("Erro ao verificar o certificado. Tente novamente mais tarde.");
    } finally {
      setLoading(false);
    }
  }

  // Verificação automática quando o código chega pela URL (QR Code)
  useEffect(() => {
    if (codigo) void runVerification(codigo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!value) return;
    void navigate({ to: "/verificar-certificado", search: { codigo: value } });
    void runVerification(value);
  }

  const validResult = result && result.found && result.isValid ? result : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a] p-4 text-white md:p-8">
      <div className="mx-auto w-full max-w-4xl space-y-8 py-12">
        <header className="space-y-4 text-center">
          <div className="mb-2 inline-flex items-center justify-center rounded-2xl border border-[#ff6a00]/20 bg-[#ff6a00]/10 p-3">
            <ShieldCheck className="h-8 w-8 text-[#ff6a00]" />
          </div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter md:text-5xl">
            Verificador de <span className="text-[#ff6a00]">Certificados</span>
          </h1>
          <p className="mx-auto max-w-lg text-white/60">
            Valide a autenticidade dos certificados emitidos pela Academia Ronnei na Veia informando
            o código de autenticação único.
          </p>
        </header>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl md:p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex: CERT-A1B2C3D4"
                aria-label="Código do certificado"
                className="w-full rounded-2xl border border-white/10 bg-black/40 py-4 pl-12 pr-4 text-lg uppercase outline-none transition-colors focus:border-[#ff6a00]"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[#ff6a00] px-8 py-4 font-black uppercase italic tracking-tighter text-black transition-all hover:bg-[#ff8c33] disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <QrCode className="h-5 w-5" /> Verificar
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-center text-red-400">
              <XCircle className="h-5 w-5 shrink-0" /> {error}
            </div>
          )}

          {validResult && (
            <div className="mt-8 space-y-8">
              <div className="flex items-center justify-center gap-2 font-bold text-green-500">
                <CheckCircle2 className="h-6 w-6" /> Certificado Autêntico e Válido
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-6">
                  <Field icon={<User className="h-3 w-3" />} label="Aluno" value={validResult.studentName} />
                  <Field icon={<BookOpen className="h-3 w-3" />} label="Conteúdo" value={validResult.contentTitle} />
                  <div className="grid grid-cols-2 gap-4">
                    <Field
                      icon={<Calendar className="h-3 w-3" />}
                      label="Data de emissão"
                      value={validResult.issueDateFormatted}
                      small
                    />
                    <Field
                      icon={<Award className="h-3 w-3" />}
                      label="Carga horária"
                      value={`${validResult.hours}h`}
                      small
                    />
                  </div>
                  <div className="text-xs text-white/40">
                    Emitido em {validResult.cityOfIssue}
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-black/40 p-6 text-center">
                  <CertificateQrCode code={validResult.code} size={132} />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                      Código de autenticação
                    </div>
                    <div className="font-mono text-xl font-black tracking-tight text-[#ff6a00]">
                      {validResult.code}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="text-center">
          <a href="/" className="text-sm font-bold text-white/40 transition-colors hover:text-[#ff6a00]">
            ← Voltar para a Home
          </a>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="space-y-2">
      <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
        {icon} {label}
      </span>
      <div className={small ? "font-bold" : "text-xl font-bold"}>{value}</div>
    </div>
  );
}
