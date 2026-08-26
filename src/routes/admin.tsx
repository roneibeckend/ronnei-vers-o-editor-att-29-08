import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { 
  LayoutDashboard, 
  Library, 
  BookOpen, 
  Users, 
  Settings,
  ShieldCheck,
  ChefHat,
  ArrowLeft,
  ChevronLeft,
  Loader2,
  BrainCircuit,
  Clapperboard,
  Bell,
  HelpCircle,
  DollarSign,
  FileText,
  Wallet,
  TrendingUp,
  Menu,
  Star,
  Terminal,
  Activity,
  Download,
  ShieldAlert,
  CreditCard,
  Upload,
  ChevronDown,
  HeartHandshake,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/admin")({
  component: AdminRootLayout,
});

const ORANGE = "#ff6a00";

function AdminRootLayout() {
  const navigate = useNavigate();
  const { isAdmin, role, isLoading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isLoading) return;
    const isStaff = isAdmin || ["manager", "agent"].includes(role || "");
    if (!isStaff && role !== "student") {
      navigate({ to: "/app", replace: true });
      return;
    }
    // Aluno só pode ver o painel central (/admin); sub-rotas de gestão são exclusivas da equipe.
    if (!isStaff && role === "student" && pathname !== "/admin") {
      navigate({ to: "/admin", replace: true });
    }
  }, [isAdmin, role, isLoading, navigate, pathname]);


  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#0a0a0a]">
        <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
      </div>
    );
  }

  if (!isAdmin && !["manager", "agent", "student"].includes(role || "")) return null;

  type NavItem = { to: string; label: string; icon: any; exact?: boolean };
  type NavGroup = { id: string; label: string; icon: any; items: NavItem[] };

  const homeItem: NavItem = { to: "/admin", label: "Visão Geral", icon: LayoutDashboard, exact: true };

  const navGroups: NavGroup[] = [
    {
      id: "financeiro",
      label: "Financeiro",
      icon: DollarSign,
      items: [
        { to: "/admin/financeiro", label: "Visão Financeira", icon: DollarSign, exact: true },
        { to: "/admin/assinaturas", label: "Assinaturas", icon: CreditCard },
        { to: "/admin/reconciliacao", label: "Reconciliação", icon: ShieldAlert },
        { to: "/admin/afiliados", label: "Afiliados", icon: TrendingUp },
      ],
    },
    {
      id: "conteudo",
      label: "Conteúdo",
      icon: Library,
      items: [
        { to: "/admin/cursos", label: "Catálogo", icon: Library },
        { to: "/admin/ebooks", label: "eBooks", icon: BookOpen },
        { to: "/admin/receitas", label: "Receitas", icon: ChefHat },
        { to: "/admin/ao-vivo", label: "Ao Vivo", icon: Clapperboard },
        { to: "/admin/materiais", label: "Materiais", icon: FileText },
        { to: "/admin/downloads", label: "Downloads de E-books", icon: Download },
      ],
    },
    {
      id: "pessoas",
      label: "Pessoas",
      icon: Users,
      items: [
        { to: "/admin/alunos", label: "Alunos", icon: Users },
        { to: "/admin/importacao", label: "Importar Alunos", icon: Upload },
        { to: "/admin/usuarios", label: "Equipe & Permissões", icon: ShieldCheck },
      ],
    },
    {
      id: "relacionamento",
      label: "Relacionamento",
      icon: HeartHandshake,
      items: [
        { to: "/admin/suporte", label: "Suporte", icon: HelpCircle },
        { to: "/admin/feedbacks", label: "Feedbacks", icon: Star },
        { to: "/admin/ranking", label: "Ranking", icon: TrendingUp },
        { to: "/admin/chatbot", label: "Inteligência Brasa", icon: BrainCircuit },
        { to: "/admin/notificacoes", label: "Notificações", icon: Bell },
      ],
    },
    {
      id: "sistema",
      label: "Sistema",
      icon: Settings,
      items: [
        { to: "/admin/integracoes", label: "Integrações", icon: Settings },
        { to: "/admin/relatorios", label: "Relatórios", icon: FileText },
        { to: "/admin/status", label: "Status Operacional", icon: Activity },
        { to: "/admin/logs", label: "Logs do Sistema", icon: Terminal },
      ],
    },
  ];

  const visibleGroups = role === "student" ? [] : navGroups;

  const renderNav = (onNavigate?: () => void) => {
    const isActive = (item: NavItem) =>
      item.exact ? pathname === item.to : pathname.startsWith(item.to);

    const linkClass = (active: boolean) =>
      `flex min-h-11 items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition touch-action-manipulation active:scale-[0.98] ${
        active ? "bg-[#ff6a00]/10 text-[#ff6a00]" : "text-white/60 hover:bg-white/5 hover:text-white"
      }`;

    return (
      <>
        {(() => {
          const Icon = homeItem.icon;
          return (
            <Link to={homeItem.to} onClick={onNavigate} preload="intent" className={linkClass(isActive(homeItem))}>
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 truncate">{homeItem.label}</span>
            </Link>
          );
        })()}

        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const hasActive = group.items.some(isActive);
          const open = hasActive || openGroups[group.id];

          return (
            <div key={group.id}>
              <button
                type="button"
                onClick={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !open }))}
                aria-expanded={open}
                className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm font-semibold transition touch-action-manipulation active:scale-[0.98] ${
                  hasActive ? "text-white" : "text-white/50 hover:bg-white/5 hover:text-white"
                }`}
              >
                <GroupIcon className="h-[18px] w-[18px] shrink-0" style={hasActive ? { color: ORANGE } : undefined} />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>

              {open && (
                <div className="ml-3 space-y-0.5 border-l border-white/10 py-1 pl-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={onNavigate}
                        preload="intent"
                        className={linkClass(isActive(item))}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="admin-shell flex min-h-[100svh] w-full bg-[#0a0a0a] text-white lg:h-dvh lg:overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 lg:flex">
        <div className="flex h-20 shrink-0 items-center gap-2 border-b border-white/10 p-6">
          <ShieldCheck className="h-6 w-6" style={{ color: ORANGE }} />
          <span className="truncate text-sm font-bold uppercase tracking-widest">
            {role === "student" ? "Painel Central" : "Painel Admin"}
          </span>
        </div>

        <nav className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
          {renderNav()}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-4">
          <Link to="/app" className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40 transition-colors hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao App
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:h-dvh lg:overflow-hidden">
        {/* Header - Mobile */}
        <div className="sticky top-0 z-40 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-white/10 bg-[#0a0a0a]/95 px-3 py-2 backdrop-blur pt-safe lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 touch-action-manipulation" aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[17rem] max-w-[85vw] border-white/10 bg-[#0a0a0a] p-0">
              <div className="flex h-dvh flex-col overflow-hidden safe-top safe-bottom">
                <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-4">
                  <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: ORANGE }} />
                  <span className="truncate text-xs font-bold uppercase tracking-widest">
                    {role === "student" ? "Painel Central" : "Painel Admin"}
                  </span>
                </div>
                <nav className="scrollbar-hidden min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 [-webkit-overflow-scrolling:touch]">
                  {renderNav(() => setMobileOpen(false))}
                </nav>
                <div className="shrink-0 border-t border-white/10 p-4">
                  <Link
                    to="/app"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40 transition-colors hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao App
                  </Link>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <span className="min-w-0 truncate text-center text-[11px] font-bold uppercase tracking-widest">
            {role === "student" ? "Painel Central" : "Painel Admin"}
          </span>
          <Link
            to="/admin/notificacoes"
            className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 transition-colors hover:border-[#ff6a00]/50 hover:text-[#ff6a00]"
            aria-label="Notificações"
          >
            <Bell className="h-5 w-5" />
          </Link>
        </div>

        {/* Main Content */}
        <main className="min-w-0 flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar">
          <header className="hidden h-20 shrink-0 items-center justify-between border-b border-white/10 px-8 lg:flex">
            <h1 className="font-display text-xl font-extrabold uppercase tracking-tight">
              {role === "student" ? "Painel Central" : (
                <>Painel Central <span style={{ color: ORANGE }}>Administrativo</span></>
              )}
            </h1>
            <div className="flex items-center gap-3">
              <Link
                to="/admin/notificacoes"
                className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 transition-colors hover:border-[#ff6a00]/50 hover:text-[#ff6a00]"
                title="Notificações"
              >
                <Bell className="h-5 w-5" />
              </Link>
            </div>
          </header>
          <div className="w-full min-w-0 overflow-x-hidden p-3 pb-safe-scroll sm:p-6 lg:p-8 3xl:mx-auto 3xl:max-w-[1800px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
