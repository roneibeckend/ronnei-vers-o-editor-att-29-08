import { Link, useRouterState, useNavigate, Outlet } from "@tanstack/react-router";
import { useState, type ReactNode, Suspense, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

import { toast } from "sonner";
import { Bell, Rocket } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { PwaInstallBanner } from "./PwaInstallBanner";
import { OnboardingLauncher } from "./OnboardingGuide";
import {
  Home,
  GraduationCap,
  BookOpen,
  ChefHat,
  FileSpreadsheet,
  TrendingUp,
  Award,
  LifeBuoy,
  Library,
  Clapperboard,
  User,
  LogOut,
  Menu,
  X,
  Shield,
  ChevronRight,
  Settings,
  Wallet,
  Video,
} from "lucide-react";
import { student } from "@/lib/platform-data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  badge?: string;
  module?: string; // Módulo necessário para acesso
};

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "Principal",
    items: [
      { to: "/app", label: "Início", icon: Home, exact: true },
      { to: "/app/receitas", label: "Receitas", icon: ChefHat },
      { to: "/app/materiais", label: "Recursos", icon: Library },
    ],
  },
  {
    title: "Aprendizado",
    items: [
      { to: "/app/cursos", label: "Meus cursos", icon: GraduationCap },
      { to: "/app/ao-vivo", label: "Ao Vivo", icon: Video },
      { to: "/app/progresso", label: "Ranking", icon: TrendingUp },
    ],
  },
  {
    title: "Conta",
    items: [
      { to: "/app/certificados", label: "Certificados", icon: Award },
      { to: "/app/perfil", label: "Meu perfil", icon: User },
      { to: "/app/suporte", label: "Suporte", icon: LifeBuoy },
      { to: "/app/afiliados", label: "Afiliados", icon: TrendingUp },
      { to: "/app/financeiro", label: "Meu Financeiro", icon: Wallet, module: "financeiro" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { to: "/admin", label: "Painel Admin", icon: Shield, badge: "Gestão", module: "admin_only" },
      { to: "/admin/usuarios", label: "Equipe", icon: User, module: "admin_only" },
      { to: "/admin/alunos", label: "Alunos", icon: GraduationCap, module: "alunos" },
      { to: "/admin/cursos", label: "Cursos", icon: GraduationCap, module: "conteudo" },
      { to: "/admin/ebooks", label: "E-books", icon: BookOpen, module: "conteudo" },
      { to: "/admin/suporte", label: "Suporte", icon: LifeBuoy, module: "suporte" },
      { to: "/admin/materiais", label: "Materiais", icon: Library, module: "admin_only" },
      { to: "/admin/afiliados", label: "Afiliados", icon: TrendingUp, module: "financeiro" },
    ],
  },
];

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { isAdmin, role, hasModule, profile: authProfile, user } = useAuth();
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { unreadCount } = useNotifications();

  // Use local state if it exists, otherwise use profile from useAuth
  const profile = authProfile ? { ...authProfile, avatar_url: localAvatar || authProfile.avatar_url } : authProfile;

  useEffect(() => {
    const handleProfileUpdate = (event: any) => {
      if (event.detail.avatar_url !== undefined) {
        setLocalAvatar(event.detail.avatar_url);
      }
    };

    window.addEventListener("profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("profile-updated", handleProfileUpdate);
  }, []);

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const SidebarInner = (
    <div className="flex h-dvh flex-col overflow-hidden bg-sidebar text-sidebar-foreground safe-top safe-bottom">
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-3 border-b border-sidebar-border px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary">
          <img
            src="/favicon.png"
            alt=""
            aria-hidden
            width={36}
            height={36}
            decoding="async"
            className="h-9 w-9 object-contain brightness-0 invert"
          />
        </div>
        <div className="min-w-0">
          <div className="font-display text-base font-extrabold uppercase leading-tight tracking-wide text-sidebar-foreground">
            Ronnei <span className="text-primary">na Veia</span>
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/40">
            Área de membros
          </div>
        </div>
      </div>

      {/* Student mini card */}
      <div className="mx-3 mt-3 flex shrink-0 items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-2.5">
        <div className="relative shrink-0">
          <img 
            src={profile?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${profile?.name || user?.email}&backgroundColor=e11d48`} 
            alt={profile?.name || "Usuário"} 
            className="h-9 w-9 rounded-md object-cover" 
          />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-emerald-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-sidebar-foreground truncate">{profile?.name || (user?.user_metadata as any)?.name || (user?.user_metadata as any)?.full_name || user?.email?.split('@')[0] || "Aluno"}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Aluno ativo</div>
        </div>
      </div>

      {/* Nav */}
      <nav 
        aria-label="Menu principal"
        className="scrollbar-hidden flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 [WebkitOverflowScrolling:touch]"
      >
        {navGroups.map((group) => {
          // Filtra itens do grupo com base nas permissões
          const visibleItems = group.items.filter(item => {
            if (!item.module) return true;
            if (item.module === "admin_only") return isAdmin;
            return hasModule(item.module);
          });

          let displayItems = visibleItems;

          if (displayItems.length === 0) return null;

          return (
            <div key={group.title} className="mb-4 last:mb-0">
              <div className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-sidebar-foreground/35">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {displayItems.map((item) => {
                  const active = isActive(item.to, item.exact);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      preload="intent"
                      className={`group relative flex h-12 sm:h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none active:scale-[0.98] touch-action-manipulation ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.5 : 2} />
                      <span>{item.label}</span>
                      {item.badge && (
                        <span
                          className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            active ? "bg-black/20 text-primary-foreground" : "bg-primary/15 text-primary"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <button
          onClick={async () => {
            const { error } = await supabase.auth.signOut();
            if (error) {
              toast.error("Erro ao sair.");
              return;
            }
            toast.success("Você saiu da plataforma.");
            navigate({ to: '/login', replace: true });
          }}
          className="flex h-12 sm:h-10 w-full items-center gap-3 rounded-md border border-sidebar-border px-3 text-sm font-medium text-sidebar-foreground/70 transition-colors duration-200 hover:border-primary/50 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none touch-action-manipulation active:scale-[0.98]"
        >
          <LogOut className="h-4 w-4" />
          Sair da plataforma
        </button>
      </div>
    </div>
  );

  return (
    <div className="app-shell flex h-[100svh] max-h-[100svh] lg:h-dvh lg:max-h-dvh w-full overflow-hidden bg-[#0a0a0a] text-foreground">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-white/5 lg:block transition-[width] duration-300 ease-in-out">
        {SidebarInner}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-40 flex shrink-0 items-center gap-3 border-b border-white/5 bg-[#0a0a0a]/90 px-4 backdrop-blur lg:px-8 pt-safe min-h-[calc(3.5rem+env(safe-area-inset-top))] h-[calc(3.5rem+env(safe-area-inset-top))]">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="grid h-10 w-10 place-items-center rounded-md border border-white/10 lg:hidden touch-target"
                aria-label="Abrir menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 border-r border-white/10 bg-[#0e0e0e]">
              <SheetHeader className="sr-only">
                <SheetTitle>Menu de Navegação</SheetTitle>
              </SheetHeader>
              {SidebarInner}
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-extrabold uppercase tracking-wide sm:text-xl text-foreground">
              Ronnei <span className="text-primary">na Veia</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <OnboardingLauncher />
            <Link 
              to="/app/notificacoes"
              className="relative grid h-10 w-10 place-items-center rounded-md border border-white/10 hover:border-primary/50 transition-colors touch-target"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
            </Link>
            <Link
              to="/app/perfil"
              className="flex items-center gap-2 rounded-md border border-white/10 py-1 pl-1 pr-3 transition-colors hover:border-primary/50 touch-target"
            >
            <img 
              src={profile?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${profile?.name || user?.email}&backgroundColor=e11d48`} 
              alt={profile?.name || "Usuário"} 
              className="h-8 w-8 rounded object-cover" 
            />
              <span className="hidden text-sm font-medium sm:inline">{ (profile?.name || user?.email?.split('@')[0] || "Aluno").split(" ")[0] }</span>
            </Link>
          </div>
        </header>

        <main className="min-w-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hidden-mobile custom-scrollbar [-webkit-overflow-scrolling:touch] px-4 py-4 pb-safe-scroll lg:px-8 lg:py-8 3xl:max-w-[1800px] 3xl:mx-auto w-full">
          <Outlet />
        </main>
        <div className="hidden sm:block">
          <PwaInstallBanner />
        </div>
        <PwaInstallModal />

      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-full">
        <h1 className="font-display text-2xl font-bold sm:text-3xl text-foreground break-words">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground break-words">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
