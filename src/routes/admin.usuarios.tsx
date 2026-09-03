import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  Users, 
  Search, 
  Loader2,
  Trash2,
  Edit3,
  X,
  Mail,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserPlus,
  Lock,
  CheckCircle2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { EmailVerificationsPanel } from "@/components/admin/EmailVerificationsPanel";

export const Route = createFileRoute("/admin/usuarios")({
  head: () => ({ meta: [{ title: "Gestão de Usuários · Admin" }] }),
  component: AdminUsuariosPage,
});

function AdminUsuariosPage() {
  const navigate = useNavigate();
  const { role, isLoading: isLoadingAuth } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 10;


  // Permissões editáveis
  const [userPermissions, setUserPermissions] = useState<{module: string, can_access: boolean}[]>([]);

  useEffect(() => {
    if (!isLoadingAuth && role === "student") {
      toast.error("Acesso restrito.");
      navigate({ to: "/admin" });
      return;
    }
    if (!isLoadingAuth) {
      fetchData();
    }
  }, [currentPage, search, role, isLoadingAuth, navigate]);



  async function fetchData() {
    try {
      setLoading(true);
      
      // 1. Buscar todos os perfis (paginados)
      let profileQuery = supabase
        .from('profiles')
        .select('*', { count: 'exact' });
      
      if (search) {
        profileQuery = profileQuery.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      }
      
      const { data: profileData, error: profileError, count } = await profileQuery
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1);
        
      if (profileError) throw profileError;
      if (!profileData) {
        setUsers([]);
        setTotalCount(0);
        return;
      }

      // 2. Buscar roles para estes perfis específicos
      const userIds = profileData.map(p => p.id);
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);

      if (roleError) throw roleError;

      // 3. Combinar dados
      // Listamos TODOS os perfis que retornaram na busca, marcando sua role se houver.
      // Isso permite que o admin veja novos cadastros e os promova a equipe.
      const resultUsers = profileData.map(profile => ({
        ...profile,
        role: roleData?.find(r => r.user_id === profile.id)?.role || 'student'
      }));

      setUsers(resultUsers);
      setTotalCount(count || 0);
    } catch (error: any) {
      toast.error("Erro ao carregar usuários: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEdit(user: any) {
    setEditingUser(user);
    // Carregar permissões do usuário
    const { data, error } = await supabase
        .from('admin_permissions')
        .select('module, can_access')
        .eq('user_id', user.id);
    
    const initialPermissions = [
        { module: 'suporte', can_access: false },
        { module: 'alunos', can_access: false }
    ];

    if (data) {
        data.forEach(p => {
            const index = initialPermissions.findIndex(ip => ip.module === p.module);
            if (index !== -1) initialPermissions[index].can_access = !!p.can_access;
        });
    }

    setUserPermissions(initialPermissions);
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setIsSaving(true);
      
      // 1. Atualizar Perfil
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ name: editingUser.name })
        .eq('id', editingUser.id);
      if (profileError) throw profileError;

      // 2. Atualizar Role
      if (editingUser.role === 'student') {
          // Aluno não possui role administrativa.
          const { error: roleDeleteError } = await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', editingUser.id);

          if (roleDeleteError) throw roleDeleteError;
      } else {
          // A constraint real é UNIQUE(user_id, role).
          // Primeiro garante a nova role e só depois remove roles antigas,
          // evitando deixar o usuário sem acesso caso o insert falhe.
          const { error: roleError } = await supabase
            .from('user_roles')
            .upsert(
              { user_id: editingUser.id, role: editingUser.role },
              { onConflict: 'user_id,role' }
            );

          if (roleError) throw roleError;

          const { error: oldRolesError } = await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', editingUser.id)
            .neq('role', editingUser.role);

          if (oldRolesError) throw oldRolesError;
      }

      // 3. Atualizar Permissões
      for (const perm of userPermissions) {
        const { error: permError } = await supabase
            .from('admin_permissions')
            .upsert({ 
                user_id: editingUser.id, 
                module: perm.module, 
                can_access: perm.can_access 
            }, { onConflict: 'user_id,module' });
        if (permError) throw permError;
      }

      toast.success("Usuário atualizado com sucesso!");
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setIsSaving(false);
    }
  }

  const togglePermission = (module: string) => {
    setUserPermissions(prev => prev.map(p => 
        p.module === module ? { ...p, can_access: !p.can_access } : p
    ));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Gestão de Equipe</h2>
          <p className="text-sm text-white/40 text-left">Gerencie administradores, gerentes e atendentes do sistema.</p>
        </div>
        <button 
            disabled 
            title="Convite de usuários via admin estará disponível em breve"
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-bold text-white/40 cursor-not-allowed"
        >
            <UserPlus className="h-4 w-4" />
            Convidar Colaborador
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-white/20" />
        <input 
          placeholder="Buscar colaborador por nome ou e-mail..." 
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full bg-white/5 border border-white/10 py-2.5 pl-10 pr-4 rounded-lg text-sm outline-none focus:border-[#ff6a00]" 
        />
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
        </div>
      ) : (
        <div className="border border-white/5 rounded-xl overflow-x-auto bg-[#111]">
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-4 font-bold text-white/40 uppercase tracking-widest text-[10px]">Colaborador</th>
                <th className="px-6 py-4 font-bold text-white/40 uppercase tracking-widest text-[10px]">Acesso / Perfil</th>
                <th className="px-6 py-4 font-bold text-white/40 uppercase tracking-widest text-[10px]">Status</th>
                <th className="px-6 py-4 font-bold text-white/40 uppercase tracking-widest text-[10px] text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.01] transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 font-bold text-xs overflow-hidden">
                        {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : (u.name?.charAt(0) || "U")}
                      </div>
                      <div>
                        <div className="font-medium">{u.name || "Sem Nome"}</div>
                        <div className="text-[10px] text-white/30">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider w-fit ${
                          u.role === 'admin' ? 'bg-red-500/10 text-red-400' : 
                          u.role === 'manager' ? 'bg-[#ff6a00]/10 text-[#ff6a00]' : 
                          u.role === 'agent' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-white/5 text-white/40'
                      }`}>
                          {u.role === 'admin' ? 'Administrador' : 
                          u.role === 'manager' ? 'Gerente' : 
                          u.role === 'agent' ? 'Atendente' : 'Colaborador'}
                      </span>
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider w-fit ${
                          u.status === 'student' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                          {u.status === 'student' ? 'Aluno Ativo' : 'Lead (Cadastrado)'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-white/40">
                    <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Ativo</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleEdit(u)}
                        className="p-2 text-white/40 hover:text-white transition"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {role === "admin" && <EmailVerificationsPanel />}

      {isModalOpen && (

        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto py-6 sm:py-4">
          <div className="w-full max-w-xl bg-[#0e0e0e] border border-white/10 rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
              <div>
                <h3 className="text-xl font-bold">Configurar Acessos</h3>
                <p className="text-xs text-white/40">{editingUser?.email}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition"><X className="h-5 w-5" /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-8 text-left">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Nome de Exibição</label>
                    <input required value={editingUser?.name || ""} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00]" />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Perfil de Acesso</label>
                        <select 
                            value={editingUser?.role || "student"} 
                            onChange={e => setEditingUser({...editingUser, role: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] appearance-none"
                        >
                            <option value="student" className="bg-[#111]">Aluno (Padrão)</option>
                            <option value="admin" className="bg-[#111]">Administrador (Total)</option>
                            <option value="manager" className="bg-[#111]">Gerente</option>
                            <option value="agent" className="bg-[#111]">Atendente</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 block">Módulos Permitidos</label>
                    
                    {editingUser?.role === 'admin' ? (
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center gap-3">
                            <ShieldCheck className="h-5 w-5 text-[#ff6a00]" />
                            <p className="text-xs text-white/60">Administradores possuem acesso total e irrestrito.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {[
                                { id: 'suporte', label: 'Central de Suporte', desc: 'Visualizar e responder tickets' },
                                { id: 'alunos', label: 'Gestão de Alunos', desc: 'Ver lista e editar perfis' }
                            ].map((module) => (
                                <button
                                    key={module.id}
                                    type="button"
                                    onClick={() => togglePermission(module.id)}
                                    className={`w-full p-4 rounded-xl border transition-all text-left flex items-start gap-3 ${
                                        userPermissions.find(p => p.module === module.id)?.can_access 
                                        ? 'border-[#ff6a00]/50 bg-[#ff6a00]/5' 
                                        : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                                    }`}
                                >
                                    <div className={`mt-0.5 h-4 w-4 rounded-sm border flex items-center justify-center transition-colors ${
                                        userPermissions.find(p => p.module === module.id)?.can_access 
                                        ? 'bg-[#ff6a00] border-[#ff6a00]' 
                                        : 'border-white/20'
                                    }`}>
                                        {userPermissions.find(p => p.module === module.id)?.can_access && <CheckCircle2 className="h-3 w-3 text-black" />}
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold">{module.label}</div>
                                        <div className="text-[10px] text-white/40">{module.desc}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
              </div>

              <div className="pt-4 flex gap-3 border-t border-white/5">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3.5 rounded-xl bg-white/5 font-bold hover:bg-white/10 transition uppercase tracking-widest text-xs">Descartar</button>
                <button type="submit" disabled={isSaving} className="flex-1 py-3.5 rounded-xl bg-[#ff6a00] text-black font-bold disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] transition uppercase tracking-widest text-xs">
                  {isSaving ? "Salvando..." : "Atualizar Colaborador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}