import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  CreditCard,
  FileText,
  Loader2,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCheckout, type CheckoutProduct } from "@/hooks/use-checkout";
import { createNativeCheckout, getCheckoutProfile, getNativeCheckoutStatus } from "@/lib/checkout-native.functions";
import { formatCpf, cpfDigits } from "@/lib/cpf";
import { gtmPurchase } from "@/lib/gtm";

type Method = "PIX" | "CREDIT_CARD" | "BOLETO";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const METHODS: { key: Method; label: string; icon: React.ElementType }[] = [
  { key: "PIX", label: "PIX", icon: QrCode },
  { key: "CREDIT_CARD", label: "Cartão", icon: CreditCard },
  { key: "BOLETO", label: "Boleto", icon: FileText },
];

function copy(text: string, label: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`${label} copiado!`))
    .catch(() => toast.error("Não foi possível copiar."));
}

export function CheckoutModal() {
  const { isOpen, product, closeCheckout } = useCheckout();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeCheckout()}>
      <DialogContent className="max-w-4xl w-[96vw] gap-0 overflow-hidden p-0 sm:rounded-3xl">
        {product ? <CheckoutBody product={product} onClose={closeCheckout} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CheckoutBody({ product, onClose }: { product: CheckoutProduct; onClose: () => void }) {
  const [method, setMethod] = React.useState<Method>("PIX");
  const [charge, setCharge] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchProfile = useServerFn(getCheckoutProfile);
  const createCheckout = useServerFn(createNativeCheckout);
  const checkStatus = useServerFn(getNativeCheckoutStatus);

  const { data: profile } = useQuery({
    queryKey: ["checkout-profile"],
    queryFn: () => fetchProfile(),
    staleTime: 60_000,
  });

  const [form, setForm] = React.useState({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    holderName: "",
    number: "",
    expiry: "",
    ccv: "",
  });

  React.useEffect(() => {
    if (!profile) return;
    setForm((f) => ({
      ...f,
      name: f.name || (profile as any).name || "",
      email: f.email || (profile as any).email || "",
      phone: f.phone || (profile as any).phone || "",
      cpf: f.cpf || formatCpf((profile as any).cpf) || "",
      holderName: f.holderName || (profile as any).name || "",
    }));
  }, [profile]);

  // Trocar de aba reinicia a cobrança gerada.
  React.useEffect(() => {
    setCharge(null);
  }, [method]);

  // Polling do status a cada 5s enquanto houver cobrança pendente.
  React.useEffect(() => {
    if (!charge?.paymentId || confirmed) return;
    let active = true;
    const tick = async () => {
      try {
        const res: any = await checkStatus({
          data: {
            paymentId: charge.paymentId,
            product: { productId: product.productId, productType: product.productType },
          },
        });
        if (active && res?.confirmed) setConfirmed(true);
      } catch {
        /* silencioso */
      }
    };
    const id = window.setInterval(tick, 5000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [charge, confirmed, checkStatus, product.productId, product.productType]);

  // Pagamento aprovado: analytics, revalidação e redirecionamento.
  React.useEffect(() => {
    if (!confirmed) return;
    gtmPurchase({
      productId: product.productId,
      productType: product.productType,
      productName: product.title,
      value: Number(charge?.value ?? product.value ?? 0),
      transactionId: String(charge?.paymentId ?? ""),
    });
    queryClient.invalidateQueries();
    product.onSuccess?.();
    const timer = window.setTimeout(() => {
      onClose();
      navigate({
        to:
          product.productType === "fidelize"
            ? "/app/fidelize"
            : product.productType === "course"
              ? `/app/cursos/${product.productId}`
              : `/app/ebooks/${product.productId}`,
      });
    }, 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Informe nome e e-mail.");
      return;
    }
    if (cpfDigits(form.cpf).length !== 11) {
      toast.error("Informe um CPF válido.");
      return;
    }
    if (method === "CREDIT_CARD") {
      const [mm, yy] = form.expiry.split("/");
      if (!form.number.trim() || !mm || !yy || !form.ccv.trim()) {
        toast.error("Preencha os dados do cartão.");
        return;
      }
    }
    setLoading(true);
    try {
      const [mm, yy] = form.expiry.split("/");
      const result: any = await createCheckout({
        data: {
          product: { productId: product.productId, productType: product.productType },
          method,
          recurring: product.recurring === true || product.productType === "fidelize",
          affiliateRef: product.affiliateRef || undefined,
          payer: {
            name: form.name.trim(),
            email: form.email.trim(),
            cpfCnpj: cpfDigits(form.cpf),
            phone: form.phone.replace(/\D/g, "") || undefined,
          },
          card:
            method === "CREDIT_CARD"
              ? {
                  holderName: form.holderName.trim() || form.name.trim(),
                  number: form.number.replace(/\D/g, ""),
                  expiryMonth: (mm || "").trim(),
                  expiryYear: (yy || "").trim(),
                  ccv: form.ccv.trim(),
                }
              : undefined,
        },
      });
      setCharge(result);
      if (result?.confirmed) setConfirmed(true);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível iniciar o pagamento.");
    } finally {
      setLoading(false);
    }
  };

  const price = Number(charge?.value ?? product.value ?? 0);

  return (
    <div className="grid max-h-[92vh] grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {/* Coluna esquerda: resumo do produto */}
      <aside className="space-y-5 bg-muted/40 p-6 md:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {product.productType === "fidelize" ? "Plano selecionado" : "Produto selecionado"}
          </p>
          <DialogTitle className="mt-1 text-2xl font-black leading-tight">{product.title}</DialogTitle>
          <DialogDescription className="mt-1">
            {product.recurring || product.productType === "fidelize"
              ? "Assinatura mensal · cobrança recorrente"
              : "Pagamento único · acesso vitalício"}
          </DialogDescription>
        </div>

        {product.cover && (
          <img
            src={product.cover}
            alt={`Capa de ${product.title}`}
            loading="lazy"
            className="aspect-video w-full rounded-2xl object-cover"
          />
        )}

        {product.benefits && product.benefits.length > 0 && (
          <ul className="space-y-2 text-sm text-muted-foreground">
            {product.benefits.slice(0, 6).map((b) => (
              <li key={b} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {b}
              </li>
            ))}
          </ul>
        )}

        {price > 0 && (
          <div className="rounded-2xl border bg-background/60 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {product.recurring || product.productType === "fidelize" ? "Total mensal" : "Total"}
            </p>
            <p className="mt-1 text-3xl font-black">
              {brl(price)}
              {(product.recurring || product.productType === "fidelize") && (
                <span className="ml-1 text-sm font-normal text-muted-foreground">/mês</span>
              )}
            </p>
          </div>
        )}

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" /> Pagamento processado com segurança via Asaas.
        </p>
      </aside>

      {/* Coluna direita: pagamento */}
      <section className="p-6 md:p-8">
        {confirmed ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h2 className="mt-4 text-2xl font-black">Pagamento aprovado</h2>
            <p className="mt-2 text-muted-foreground">Liberando acesso...</p>
            <Loader2 className="mt-4 h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
              {METHODS.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.key}
                    onClick={() => setMethod(m.key)}
                    className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                      method === m.key ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {m.label}
                  </button>
                );
              })}
            </div>

            {charge && method === "PIX" && charge.pix ? (
              <div className="space-y-4 text-center">
                {charge.pix.encodedImage && (
                  <img
                    src={`data:image/png;base64,${charge.pix.encodedImage}`}
                    alt="QR Code PIX"
                    className="mx-auto h-56 w-56 rounded-2xl bg-white p-2"
                  />
                )}
                <div className="space-y-2 text-left">
                  <Label>PIX copia e cola</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={charge.pix.payload} className="font-mono text-xs" />
                    <Button variant="secondary" onClick={() => copy(charge.pix.payload, "Código PIX")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Aguardando confirmação do pagamento...
                </p>
              </div>
            ) : charge && method === "BOLETO" && charge.boleto ? (
              <div className="space-y-4">
                {charge.boleto.identificationField && (
                  <div className="space-y-2">
                    <Label>Código digitável</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={charge.boleto.identificationField} className="font-mono text-xs" />
                      <Button
                        variant="secondary"
                        onClick={() => copy(charge.boleto.identificationField, "Código do boleto")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
                {charge.boleto.url && (
                  <iframe
                    src={charge.boleto.url}
                    title="Boleto"
                    className="h-72 w-full rounded-2xl border"
                  />
                )}
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> A compensação do boleto pode levar até 2 dias úteis.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome completo" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                  <Field label="E-mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                  <Field
                    label="CPF"
                    value={form.cpf}
                    placeholder="000.000.000-00"
                    onChange={(v) => setForm({ ...form, cpf: formatCpf(v) })}
                  />
                  <Field
                    label="Telefone (opcional)"
                    value={form.phone}
                    onChange={(v) => setForm({ ...form, phone: v })}
                  />
                </div>

                {method === "CREDIT_CARD" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field
                        label="Nome impresso no cartão"
                        value={form.holderName}
                        onChange={(v) => setForm({ ...form, holderName: v })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Field
                        label="Número do cartão"
                        value={form.number}
                        placeholder="0000 0000 0000 0000"
                        onChange={(v) => setForm({ ...form, number: v.replace(/[^\d ]/g, "") })}
                      />
                    </div>
                    <Field
                      label="Validade (MM/AA)"
                      value={form.expiry}
                      placeholder="12/28"
                      onChange={(v) => setForm({ ...form, expiry: v })}
                    />
                    <Field
                      label="CVV"
                      value={form.ccv}
                      placeholder="123"
                      onChange={(v) => setForm({ ...form, ccv: v.replace(/\D/g, "").slice(0, 4) })}
                    />
                  </div>
                )}

                <Button className="w-full" size="lg" onClick={handleSubmit} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {method === "PIX" ? "Gerar PIX" : method === "BOLETO" ? "Gerar boleto" : "Pagar com cartão"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Confirmação automática · Ativação imediata
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
