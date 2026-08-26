import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/platform/Shell";
import { User, Mail, Phone, Calendar, ShoppingBag, CheckCircle2, Loader2, Download, Smartphone, Camera, X } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProgress } from "@/hooks/use-progress";
import { cpfDigits, formatCpf, isValidCpf } from "@/lib/cpf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { EmailVerificationCard } from "@/components/platform/EmailVerificationCard";


export const Route = createFileRoute("/app/perfil")({
  head: () => ({ meta: [{ title: "Meu perfil — Ronnei na Veia" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const { streak, lessonProgress, ebookProgress } = useProgress();
  const { canInstall, isStandalone, installPwa } = usePwaInstall();
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const formatPhone = (value: string) => {
    // Remove non-digits
    const digits = value.replace(/\D/g, "");
    
    // Format: (XX) XXXXX-XXXX or (XX) XXXX-XXXX
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewCpf(formatCpf(e.target.value));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setNewPhone(formatted);
  };

  const handleSave = async () => {
    if (!user) return;
    
    if (!newPhone.trim()) {
      toast.error("O número de telefone é obrigatório.");
      return;
    }
    
    try {
      setIsSaving(true);
      
      const digits = cpfDigits(newCpf);
      if (digits && !isValidCpf(digits)) {
        toast.error("CPF inválido. Você pode deixar em branco.");
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ 
          phone: newPhone.replace(/\D/g, ""), // Salvar apenas dígitos
          cpf: digits || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id);

      if (error) throw error;

      toast.success("Perfil atualizado com sucesso!");
      setProfile((prev: any) => prev ? { ...prev, phone: newPhone, cpf: cpfDigits(newCpf) || null } : null);
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast.error("Erro ao atualizar perfil: " + (error.message || "Tente novamente."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Tipo de arquivo não suportado. Use JPG, PNG ou WEBP.");
      return;
    }

    // Validate size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("A imagem deve ter no máximo 2MB.");
      return;
    }

    try {
      setIsUploading(true);
      
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/${Math.random()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("profiles")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("profiles")
        .getPublicUrl(filePath);

      // Update profile in database
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ 
          avatar_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setProfile((prev: any) => ({ ...prev, avatar_url: publicUrl }));
      toast.success("Foto de perfil atualizada!");
      
      // Force refresh of any other components using this data
      window.dispatchEvent(new CustomEvent("profile-updated", { detail: { avatar_url: publicUrl } }));
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      toast.error("Erro ao enviar imagem: " + (error.message || "Tente novamente."));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user || !profile?.avatar_url) return;

    try {
      setIsSaving(true);
      
      const { error } = await supabase
        .from("profiles")
        .update({ 
          avatar_url: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id);

      if (error) throw error;

      setProfile((prev: any) => ({ ...prev, avatar_url: null }));
      toast.success("Foto de perfil removida.");
      
      window.dispatchEvent(new CustomEvent("profile-updated", { detail: { avatar_url: null } }));
    } catch (error: any) {
      console.error("Error removing avatar:", error);
      toast.error("Erro ao remover imagem.");
    } finally {
      setIsSaving(false);
    }
  };



  useEffect(() => {
    const handleProfileUpdate = (event: any) => {
      const { avatar_url } = event.detail;
      setProfile((prev: any) => prev ? { ...prev, avatar_url } : null);
    };

    window.addEventListener("profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("profile-updated", handleProfileUpdate);
  }, []);

  useEffect(() => {
    async function loadProfileData() {
      if (!user) return;
      
      try {
        // Load profile data
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        
        if (profileData) {
          setProfile(profileData);
          setNewPhone(formatPhone(profileData.phone || ""));
          setNewCpf(formatCpf(profileData.cpf || ""));
        }


        // Load user specific orders (payments + enrollments)
        const [paymentsRes, courseRes, ebookRes] = await Promise.all([
          supabase
            .from("payments")
            .select("id, amount, status, billing_type, created_at, confirmed_at, metadata")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("course_enrollments")
            .select("id, created_at, course:courses(title, price)")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("ebook_enrollments")
            .select("id, created_at, ebook:ebooks(title, price)")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
        ]);

        const brl = (v: any) =>
          typeof v === "number" && !Number.isNaN(v)
            ? `R$ ${Number(v).toFixed(2).replace(".", ",")}`
            : "Liberado";

        const statusLabel = (s?: string) => {
          const v = (s || "").toUpperCase();
          if (["CONFIRMED", "RECEIVED", "PAID"].includes(v)) return "Pago";
          if (["PENDING", "AWAITING_PAYMENT"].includes(v)) return "Pendente";
          if (["REFUNDED", "CANCELLED", "CANCELED"].includes(v)) return "Cancelado";
          return v ? v.charAt(0) + v.slice(1).toLowerCase() : "Pago";
        };

        const payments = (paymentsRes.data as any[] | null) || [];
        const orders = [
          ...payments.map((p) => ({
            id: `#ORD-${String(p.id).slice(0, 4).toUpperCase()}`,
            rawDate: p.confirmed_at || p.created_at,
            date: p.confirmed_at || p.created_at ? format(new Date(p.confirmed_at || p.created_at), "dd/MM/yyyy") : "—",
            product: p?.metadata?.product_title || p?.metadata?.title || (p.billing_type ? `Pagamento ${p.billing_type}` : "Pagamento"),
            status: statusLabel(p.status),
            value: brl(Number(p.amount)),
          })),
          ...(((courseRes.data as any[] | null) || []).map((o) => ({
            id: `#ORD-${String(o.id).slice(0, 4).toUpperCase()}`,
            rawDate: o.created_at,
            date: o.created_at ? format(new Date(o.created_at), "dd/MM/yyyy") : "—",
            product: o.course?.title || "Curso",
            status: "Pago",
            value: brl(o.course?.price != null ? Number(o.course.price) : undefined),
          }))),
          ...(((ebookRes.data as any[] | null) || []).map((o) => ({
            id: `#ORD-${String(o.id).slice(0, 4).toUpperCase()}`,
            rawDate: o.created_at,
            date: o.created_at ? format(new Date(o.created_at), "dd/MM/yyyy") : "—",
            product: o.ebook?.title || "E-book",
            status: "Pago",
            value: brl(o.ebook?.price != null ? Number(o.ebook.price) : undefined),
          }))),
        ].sort((a, b) => new Date(b.rawDate || 0).getTime() - new Date(a.rawDate || 0).getTime());

        setUserOrders(orders);
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadProfileData();
  }, [user]);

  if (isLoading) {
    return (
      <div className="animate-in fade-in duration-500">
        <PageHeader title="Meu perfil" subtitle="Gerencie seus dados e veja seu histórico de compras." />
        <div className="grid gap-6 md:gap-8 lg:grid-cols-[320px_1fr] w-full">
          <aside className="space-y-6">
            <Skeleton className="h-[300px] w-full rounded-2xl" />
            <Skeleton className="h-[200px] w-full rounded-2xl" />
          </aside>
          <div className="space-y-6 md:space-y-8">
            <Skeleton className="h-[400px] w-full rounded-2xl" />
            <Skeleton className="h-[300px] w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-7xl mx-auto w-full">
      <PageHeader title="Meu perfil" subtitle="Gerencie seus dados e veja seu histórico de compras." />

      <div className="grid gap-6 md:gap-8 lg:grid-cols-[320px_1fr] w-full items-start">
        {/* Sidebar Info */}
        <aside className="space-y-6 w-full max-w-full overflow-hidden">
          <section className="glass overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] shadow-sm w-full">
            <div className="h-24 bg-gradient-to-br from-[#ff6a00] to-[#ff9500] opacity-20" />
            <div className="relative -mt-12 flex flex-col items-center p-6 text-center">
              <div className="relative group">
                <div className="relative h-24 w-24 overflow-hidden rounded-2xl border-4 border-[#0a0a0a] ring-1 ring-white/10">
                  <img 
                    src={profile?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${profile?.full_name || user?.email}&backgroundColor=e11d48`} 
                    alt={profile?.full_name} 
                    className="h-full w-full object-cover"
                  />
                  {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                      <Loader2 className="h-6 w-6 animate-spin text-[#ff6a00]" />
                    </div>
                  )}
                </div>
                
                <label className="absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center rounded-lg bg-[#ff6a00] text-black shadow-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer touch-target">
                  <Camera className="h-4 w-4" />
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={isUploading}
                  />
                </label>

                {profile?.avatar_url && !isUploading && (
                  <button 
                    onClick={handleRemoveAvatar}
                    className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-red-500 text-white shadow-lg transition-transform hover:scale-110 active:scale-95 touch-target"
                    title="Remover foto"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <h3 className="mt-4 font-display text-xl font-bold truncate w-full px-2 text-white">{profile?.name || profile?.full_name || (user?.user_metadata as any)?.name || (user?.user_metadata as any)?.full_name || user?.email?.split("@")[0] || "Aluno"}</h3>

              <p className="text-sm text-white/40">Membro desde {profile?.created_at ? format(new Date(profile.created_at), "dd/MM/yyyy") : "—"}</p>
              
              <div className="mt-6 grid grid-cols-2 w-full gap-2 px-2">
                <div className="rounded-xl bg-white/[0.03] p-3 text-center min-w-0 flex flex-col items-center justify-center border border-white/5 shadow-inner">
                  <div className="text-lg font-bold text-[#ff6a00] truncate w-full">{streak}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 truncate w-full">Dias</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3 text-center min-w-0 flex flex-col items-center justify-center border border-white/5 shadow-inner">
                  <div className="text-lg font-bold text-[#ff6a00] truncate w-full">
                    {lessonProgress.filter((p: any) => p.is_completed).length + ebookProgress.filter((p: any) => !!p.completed_at).length}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 truncate w-full">Aulas</div>
                </div>
              </div>
            </div>
          </section>

          <section className="glass space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Informações de contato</h4>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-[#ff6a00]">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">E-mail</div>
                  <div className="text-sm font-medium truncate text-white">{user?.email || profile?.email || "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-[#ff6a00]">
                  <Phone className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Telefone</div>
                  <div className="text-sm font-medium truncate text-white">{profile?.phone || "Não informado"}</div>
                </div>
              </div>
            </div>
          </section>

          <EmailVerificationCard />



          {canInstall && !isStandalone && (
            <section className="glass space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Aplicativo</h4>
              <p className="text-xs text-white/40 leading-relaxed">
                Instale o app oficial na sua tela inicial para acesso rápido e otimizado.
              </p>
              <button
                onClick={installPwa}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#ff6a00]/30 bg-[#ff6a00]/10 py-3 text-xs font-bold uppercase tracking-widest text-[#ff6a00] transition-all hover:bg-[#ff6a00]/20 active:scale-[0.98]"
              >
                <Download className="h-4 w-4" />
                Instalar Aplicativo
              </button>
            </section>
          )}
          
          {isStandalone && (
            <section className="glass flex items-center gap-3 rounded-2xl border border-emerald-500/10 bg-emerald-500/5 p-4">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/20 text-emerald-500">
                <Smartphone className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/70">App Instalado</div>
                <div className="text-[10px] text-emerald-500/50">Versão nativa ativa</div>
              </div>
            </section>
          )}
        </aside>

        {/* Main Content */}
        <div className="space-y-6 md:space-y-8 min-w-0 w-full overflow-hidden">
          {/* Personal Data Form */}
          <section className="glass rounded-2xl border border-white/5 bg-white/[0.02] p-5 sm:p-6 lg:p-8 w-full">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
              <div className="min-w-0">
                <h3 className="font-display text-xl font-bold text-white truncate">Dados da Conta</h3>
                <p className="text-sm text-white/40 truncate">Mantenha suas informações sempre atualizadas.</p>
              </div>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="btn-fire w-full sm:w-auto px-6 py-3 sm:py-2 text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </button>
            </div>
            
            <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
              <Field label="Nome completo" value={profile?.name || profile?.full_name || ""} readOnly icon={User} />
              <Field label="Seu e-mail" value={user?.email || profile?.email || ""} readOnly type="email" icon={Mail} />
              <Field 
                label="WhatsApp / Telefone" 
                value={newPhone} 
                onChange={handlePhoneChange}
                placeholder="(00) 00000-0000"
                icon={Phone} 
              />
              <Field 
                label="CPF (opcional)" 
                value={newCpf} 
                onChange={handleCpfChange}
                placeholder="000.000.000-00"
                inputMode="numeric"
                icon={User} 
              />
              <Field label="Data de cadastro" value={profile?.created_at ? format(new Date(profile.created_at), "dd/MM/yyyy") : "—"} disabled icon={Calendar} />
            </div>

          </section>

          {/* Order History */}
          <section className="glass rounded-2xl border border-white/5 bg-white/[0.02] p-5 sm:p-6 lg:p-8 w-full overflow-hidden">
            <div className="mb-6 flex items-center gap-3 w-full">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ff6a00]/10 text-[#ff6a00]">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-xl font-bold text-white truncate">Histórico de Pedidos</h3>
                <p className="text-sm text-white/40 truncate">Acompanhe todos os seus investimentos.</p>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-white/5">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[500px] md:min-w-0">
                  <thead>
                    <tr className="bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40">
                      <th className="px-6 py-4">ID do Pedido</th>
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Produto</th>
                      <th className="hidden md:table-cell px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {userOrders.map((order) => (
                      <tr key={order.id} className="transition-colors hover:bg-white/[0.02]">
                        <td className="px-6 py-4 font-mono font-medium text-[#ff6a00] truncate max-w-[120px]">{order.id}</td>
                        <td className="px-6 py-4 text-white/60 whitespace-nowrap">{order.date}</td>
                        <td className="px-6 py-4 font-medium truncate max-w-[200px]">{order.product}</td>
                        <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
                            order.status === "Pago"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : order.status === "Pendente"
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-white/10 text-white/60"
                          }`}>
                            <CheckCircle2 className="h-3 w-3" />
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-white whitespace-nowrap">{order.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {userOrders.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-white/5">
                    <ShoppingBag className="h-6 w-6 text-white/20" />
                  </div>
                  <p className="text-sm text-white/40">Nenhum pedido encontrado no seu histórico.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ 
  label, 
  icon: Icon,
  ...rest 
}: { 
  label: string;
  icon?: any;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block group min-w-0">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 transition-colors group-focus-within:text-[#ff6a00] whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
      </span>
      <div className="relative">
        {Icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 transition-colors group-focus-within:text-[#ff6a00]">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <input 
          {...rest} 
          className={`w-full rounded-xl border border-white/10 bg-white/[0.03] ${Icon ? 'pl-11' : 'px-4'} py-3.5 text-[16px] md:text-sm font-medium outline-none transition-all placeholder:text-white/10 focus:border-[#ff6a00]/50 focus:bg-[#ff6a00]/5 disabled:opacity-50 text-white appearance-none`} 
        />
      </div>
    </label>
  );
}
