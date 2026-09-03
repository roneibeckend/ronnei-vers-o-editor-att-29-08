import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  GraduationCap, 
  ChefHat, 
  TrendingUp, 
  CheckCircle2,
  Rocket
} from 'lucide-react';
import { useServerFn } from '@tanstack/react-start';
import { getOnboardingStatus, completeOnboarding } from '@/lib/onboarding.functions';
import { supabase } from '@/integrations/supabase/client';

const STEPS = [
  {
    title: "Bem-vindo à sua nova jornada!",
    description: "Estamos felizes em ter você aqui. Preparamos um guia rápido para você aproveitar ao máximo a plataforma Espetinho na Veia.",
    icon: Rocket,
    color: "text-primary",
    bgColor: "bg-primary/10"
  },
  {
    title: "Seus Cursos e E-books",
    description: "Em 'Meus Cursos', você encontrará todos os conteúdos que adquiriu. O progresso é salvo automaticamente para você retomar de onde parou.",
    icon: GraduationCap,
    color: "text-gold",
    bgColor: "bg-gold/10"
  },
  {
    title: "Receitas e Materiais",
    description: "Acesse centenas de receitas exclusivas e planilhas de apoio em 'Receitas' e 'Recursos'. Tudo o que você precisa para o seu negócio.",
    icon: ChefHat,
    color: "text-fire",
    bgColor: "bg-fire/10"
  },
  {
    title: "Ranking e Gamificação",
    description: "Acompanhe seu progresso, ganhe pontos ao concluir aulas e dispute o topo do ranking com outros alunos da comunidade.",
    icon: TrendingUp,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10"
  },
  {
    title: "Tudo Pronto!",
    description: "Agora você já conhece o básico. Explore a plataforma e, se precisar de ajuda, nosso suporte está sempre disponível no menu lateral.",
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-500/10"
  }
];

export function OnboardingGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const getStatus = useServerFn(getOnboardingStatus);
  const completeStatus = useServerFn(completeOnboarding);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Checkout/cadastro tem prioridade absoluta sobre onboarding.
        // Se o usuário chegou aqui para comprar, nenhuma tela educativa
        // pode disputar foco, clique ou z-index com o checkout.
        const params = new URLSearchParams(window.location.search);
        const hasPurchaseIntent =
          Boolean(params.get("buy")) ||
          Boolean(params.get("type"));

        if (hasPurchaseIntent) {
          setIsOpen(false);
          return;
        }

        // First check local storage for speed
        const hasSeenLocal =
          localStorage.getItem('onboarding_completed');

        if (hasSeenLocal) return;

        // O servidor só libera o onboarding quando existe matrícula real.
        const {
          hasSeenOnboarding,
          hasPurchasedAccess,
        } = await getStatus();

        if (!hasPurchasedAccess) {
          setIsOpen(false);
          return;
        }

        if (!hasSeenOnboarding) {
          setIsOpen(true);
        } else {
          // Sync local storage if DB says we've seen it
          localStorage.setItem(
            'onboarding_completed',
            'true',
          );
        }
      } catch (error) {
        console.error("Erro ao verificar status de onboarding:", error);
      }
    };

    checkStatus();

    // Allow the launcher to re-open the guide at any time
    const handleOpen = () => {
      setCurrentStep(0);
      setIsOpen(true);
    };
    window.addEventListener('open-onboarding-guide', handleOpen);
    return () => window.removeEventListener('open-onboarding-guide', handleOpen);
  }, [getStatus]);

  const handleClose = async () => {
    setIsOpen(false);
    localStorage.setItem('onboarding_completed', 'true');
    try {
      await completeStatus();
    } catch (error) {
      console.error("Erro ao salvar progresso de onboarding:", error);
    }
  };

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((step) => step + 1);
    } else {
      void handleClose();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const step = STEPS[currentStep];
  const Icon = step.icon;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-[#0e0e0e] shadow-2xl"
        >

          {/* Progress Bar */}
          <div className="absolute top-0 left-0 flex h-1.5 w-full gap-1 p-1">
            {STEPS.map((_, i) => (
              <div 
                key={i} 
                className={`h-full flex-1 rounded-full transition-all duration-300 ${
                  i <= currentStep ? 'bg-primary' : 'bg-white/10'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 text-white/40 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="p-5 pt-12 pb-6 text-center sm:p-8 sm:pt-12">
            <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl ${step.bgColor} ${step.color}`}>
              <Icon className="h-8 w-8 sm:h-10 sm:w-10" />
            </div>

            <h2 className="mb-3 font-display text-xl sm:text-2xl font-black text-white">
              {step.title}
            </h2>
            
            <p className="mb-6 text-sm sm:mb-8 sm:text-base text-white/60 leading-relaxed">
              {step.description}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={prevStep}
                disabled={currentStep === 0}
                className={`flex items-center gap-2 text-sm font-bold uppercase tracking-widest transition-colors ${
                  currentStep === 0 ? 'pointer-events-none opacity-0' : 'text-white/40 hover:text-white'
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                >
                  Pular
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="btn-fire flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-widest"
                >
                  {currentStep === STEPS.length - 1 ? 'Começar' : 'Próximo'}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function OnboardingLauncher() {
  const openGuide = () => {
    window.dispatchEvent(new Event('open-onboarding-guide'));
  };

  return (
    <button 
      onClick={openGuide}
      title="Guia de Primeiros Passos"
      className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 text-white/60 transition-all hover:border-primary/50 hover:text-primary active:scale-95"
    >
      <Rocket className="h-5 w-5" />
    </button>
  );
}

