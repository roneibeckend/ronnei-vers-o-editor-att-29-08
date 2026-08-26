import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  Users, 
  Search, 
  Loader2,
  TrendingUp,
  GraduationCap,
  Trash2,
  Edit3,
  X,
  Mail,
  Calendar,
  Phone,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  User
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, Link } from "@tanstack/react-router";
import { deleteStudent } from "@/lib/students-admin.functions";
import { cpfDigits, formatCpf, isValidCpf } from "@/lib/cpf";

export const Route = createFileRoute("/admin/alunos")({
  head: () => ({ meta: [{ title: "Gestão de Alunos · Admin" }] }),
  component: AdminAlunosPage,
});

function AdminAlunosPage() {
  const { hasModule, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!authLoading && !hasModule("alunos")) {
      toast.error("Acesso negado: você não tem permissão para gerenciar alunos.");
      navigate({ to: "/admin" });
    }
  }, [authLoading, hasModule, navigate]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    fetchData();
  }, [currentPage, search]);

  async function fetchData() {
    try {
      setLoading(true);
      
      let query = supabase.from('profiles').select('*', { count: 'exact' });
      
      if (search) {
        const filters = [`name.ilike.%${search}%`, `email.ilike.%${search}%`];
        const digits = cpfDigits(search);
        if (digits) filters.push(`cpf.ilike.%${digits}%`);
        query = query.or(filters.join(","));
      }
      
      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1);
        
      if (error) throw error;

      const rows = data || [];
      let roles: { user_id: string; role: string }[] = [];
      if (rows.length) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', rows.map(r => r.id));
        roles = roleData || [];
      }

      setProfiles(rows.map(r => ({
        ...r,
        role: roles.find(x => x.user_id === r.id)?.role || 'student',
      })));
      setTotalCount(count || 0);
    } catch (error: any) {
      toast.error("Erro ao carregar alunos: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const digits = cpfDigits(editingItem?.cpf);
      if (digits && !isValidCpf(digits)) {
        toast.error("CPF inválido. Deixe em branco se não quiser informar.");
        return;
      }

      setIsSaving(true);
      const { role: _role, ...payload } = editingItem || {};
      const { error } = await supabase
        .from('profiles')
        .update({ ...payload, cpf: digits || null })
        .eq('id', editingItem.id);
      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja remover este aluno? Esta ação exclui definitivamente o perfil e a conta de autenticação.")) return;
    try {
      await deleteStudent({ data: { studentId: id } });
      toast.success("Aluno removido com sucesso");
      await fetchData();
    } catch (error: any) {
      toast.error("Erro ao excluir: " + (error?.message || "falha desconhecida"));
    }
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Gestão de Alunos</h2>
          <p className="text-sm text-white/40 text-left">Acompanhe e gerencie todos os alunos matriculados.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-3 h-4 w-4 text-white/20" />
          <input 
            placeholder="Buscar por nome, e-mail ou CPF..." 
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setCurrentPage(1); // Reset to first page on search
            }}
            className="w-full bg-white/5 border border-white/10 py-2.5 pl-10 pr-4 rounded-lg text-sm outline-none focus:border-[#ff6a00] transition-colors" 
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
        </div>
      ) : (
        <div className="border border-white/5 rounded-xl overflow-x-auto bg-[#111] w-full">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm table-fixed lg:table-auto min-w-[700px]">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-6 py-4 font-bold text-white/40 uppercase tracking-widest text-[10px] w-[30%] min-w-[200px]">Aluno</th>
                  <th className="px-6 py-4 font-bold text-white/40 uppercase tracking-widest text-[10px] w-[15%] min-w-[100px]">Status</th>
                  <th className="px-6 py-4 font-bold text-white/40 uppercase tracking-widest text-[10px] w-[25%] min-w-[200px]">Contato</th>
                  <th className="px-6 py-4 font-bold text-white/40 uppercase tracking-widest text-[10px] w-[15%] min-w-[120px]">Matrícula</th>
                  <th className="px-6 py-4 font-bold text-white/40 uppercase tracking-widest text-[10px] text-right w-[15%] min-w-[150px]">Ações</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-white/5">
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.01] transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-[#ff6a00]/10 flex items-center justify-center text-[#ff6a00] font-bold text-xs">
                        {p.name?.charAt(0) || "A"}
                      </div>
                      <span className="font-medium">{p.name || "Sem Nome"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {p.role && p.role !== 'student' ? (
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                          p.role === 'admin' ? 'bg-red-500/10 text-red-400'
                          : p.role === 'manager' ? 'bg-[#ff6a00]/10 text-[#ff6a00]'
                          : 'bg-blue-500/10 text-blue-400'
                      }`}>
                          {p.role === 'admin' ? 'Admin' : p.role === 'manager' ? 'Gerente' : 'Atendente'}
                      </span>
                    ) : (
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                          p.status === 'student' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                          {p.status === 'student' ? 'Aluno' : 'Lead'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-white/40">
                    <div>{p.email || "—"}</div>
                    <div className="text-[10px] text-white/25">
                      {p.cpf ? `CPF ${formatCpf(p.cpf)}` : "CPF não informado"}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-white/40">{p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : "—"}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to="/admin/alunos/$studentId"
                        params={{ studentId: p.id }}
                        className="p-2 text-white/40 hover:text-[#ff6a00] transition tooltip"
                        title="Ver Perfil"
                      >
                        <User className="h-4 w-4" />
                      </Link>
                      <button 
                        onClick={() => { setEditingItem(p); setIsModalOpen(true); }}
                        className="p-2 text-white/40 hover:text-white transition"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(p.id)}
                        className="p-2 text-white/40 hover:text-red-500 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-white/20 uppercase tracking-widest text-[10px] font-bold">
                    Nenhum aluno encontrado
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalCount > ITEMS_PER_PAGE && (
            <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/20">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} de {totalCount} alunos
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.ceil(totalCount / ITEMS_PER_PAGE) }).map((_, i) => {
                    const pageNum = i + 1;
                    // Limit visible pages if there are many
                    if (
                      pageNum === 1 || 
                      pageNum === Math.ceil(totalCount / ITEMS_PER_PAGE) || 
                      (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-8 h-8 rounded-lg text-[10px] font-bold transition ${
                            currentPage === pageNum ? 'bg-[#ff6a00] text-black' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    }
                    if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                      return <span key={pageNum} className="text-white/20 text-xs px-1">...</span>;
                    }
                    return null;
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / ITEMS_PER_PAGE), p + 1))}
                  disabled={currentPage === Math.ceil(totalCount / ITEMS_PER_PAGE)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto py-6 sm:py-4">
          <div className="w-full max-w-lg bg-[#0e0e0e] border border-white/10 rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
              <h3 className="text-xl font-bold">Editar Aluno</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6 text-left">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Nome Completo</label>
                  <div className="relative">
                    <UserCheck className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
                    <input required value={editingItem?.name || ""} onChange={e => setEditingItem({...editingItem, name: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 pl-10 rounded-lg text-sm outline-none focus:border-[#ff6a00]" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
                    <input required type="email" value={editingItem?.email || ""} onChange={e => setEditingItem({...editingItem, email: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 pl-10 rounded-lg text-sm outline-none focus:border-[#ff6a00]" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Telefone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
                    <input value={editingItem?.phone || ""} onChange={e => setEditingItem({...editingItem, phone: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 pl-10 rounded-lg text-sm outline-none focus:border-[#ff6a00]" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">CPF (opcional)</label>
                  <div className="relative">
                    <UserCheck className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
                    <input
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      value={formatCpf(editingItem?.cpf)}
                      onChange={e => setEditingItem({ ...editingItem, cpf: cpfDigits(e.target.value).slice(0, 11) })}
                      className="w-full bg-white/5 border border-white/10 p-3 pl-10 rounded-lg text-sm outline-none focus:border-[#ff6a00]"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3.5 rounded-xl bg-white/5 font-bold hover:bg-white/10 transition uppercase tracking-widest text-xs">Cancelar</button>
                <button type="submit" disabled={isSaving} className="flex-1 py-3.5 rounded-xl bg-[#ff6a00] text-black font-bold disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] transition uppercase tracking-widest text-xs">
                  {isSaving ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
