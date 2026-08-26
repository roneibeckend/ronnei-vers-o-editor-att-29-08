import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  ShoppingBag, 
  CheckCircle2, 
  ChevronLeft, 
  Loader2,
  BookOpen,
  Trophy,
  History,
  ShieldAlert,
  Plus,
  CreditCard,
  DollarSign,
  Award
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PageHeader } from "@/components/platform/Shell";
import { useServerFn } from "@tanstack/react-start";
import { manualConfirmEnrollment } from "@/lib/enrollment-admin.functions";
import { 
  generateCertificateManually,
  getContentCertificate
} from "@/lib/certificates.functions.ts";
import { 
  Dialog, 

  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { StudentSupportActions } from "@/components/admin/StudentSupportActions";
import { AccessControlPanel } from "@/components/admin/AccessControlPanel";


export const Route = createFileRoute("/admin/alunos/$studentId")({
  head: () => ({ meta: [{ title: "Perfil do Aluno · Admin" }] }),
  component: AdminStudentProfilePage,
});

function AdminStudentProfilePage() {
  const { studentId } = Route.useParams();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [stats, setStats] = useState({
    coursesCompleted: 0,
    lessonsWatched: 0,
    totalSpent: 0
  });
  const [payments, setPayments] = useState<any[]>([]);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<{courses: any[], ebooks: any[]}>({ courses: [], ebooks: [] });
  const [manualLoading, setManualLoading] = useState(false);
  const [manualData, setManualData] = useState({ productId: '', productType: 'course' as 'course' | 'ebook', notes: '' });

  const manualConfirmFn = useServerFn(manualConfirmEnrollment);
  const generateCertFn = useServerFn(generateCertificateManually);
  const getCertConfigFn = useServerFn(getContentCertificate);

  const [certLoading, setCertLoading] = useState<string | null>(null);


  useEffect(() => {
    fetchStudentData();
    fetchAvailableProducts();
  }, [studentId]);

  async function fetchAvailableProducts() {
    try {
      const [{ data: courses }, { data: ebooks }] = await Promise.all([
        supabase.from('courses').select('id, title').eq('status', 'active'),
        supabase.from('ebooks').select('id, title').eq('status', 'active')
      ]);
      setAvailableProducts({ 
        courses: courses || [], 
        ebooks: ebooks || [] 
      });
    } catch (error) {
      console.error("Erro ao carregar produtos:", error);
    }
  }

  const handleManualConfirm = async () => {
    if (!manualData.productId) {
      toast.error("Selecione um produto.");
      return;
    }

    try {
      setManualLoading(true);
      await manualConfirmFn({
        data: {
          studentId,
          productId: manualData.productId,
          productType: manualData.productType,
          notes: manualData.notes
        }
      });
      
      toast.success("Pagamento confirmado e acesso liberado manualmente!");
      setIsManualModalOpen(false);
      fetchStudentData(); // Refresh list
    } catch (error: any) {
      toast.error(error.message || "Erro ao realizar confirmação manual.");
    } finally {
      setManualLoading(false);
    }
  };

  async function fetchStudentData() {
    try {
      setLoading(true);
      
      // Fetch basic profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', studentId)
        .single();
        
      if (profileError) throw profileError;
      setProfile(profileData);

      // Fetch all lessons for courses to calculate progress
      const { data: allLessons } = await supabase
        .from('course_lessons')
        .select('id, module_id, course_modules!inner(course_id)');

      // Fetch all ebook chapters to calculate progress
      const { data: allChapters } = await supabase
        .from('ebook_chapters')
        .select('id, ebook_id');

      // Fetch enrollments (courses and ebooks)
      const [{ data: courseEnrollData, error: courseEnrollError }, { data: ebookEnrollData, error: ebookEnrollError }] = await Promise.all([
        supabase.from('course_enrollments')
          .select(`*, course:courses(id, title, cover_url)`)
          .eq('user_id', studentId),
        supabase.from('ebook_enrollments')
          .select(`*, ebook:ebooks(id, title, cover_url)`)
          .eq('user_id', studentId)
      ]);

      if (courseEnrollError) throw courseEnrollError;
      if (ebookEnrollError) throw ebookEnrollError;

      // Fetch progress status for lessons
      const { data: progressData } = await supabase
        .from('lesson_progress')
        .select('lesson_id, is_completed')
        .eq('user_id', studentId)
        .eq('is_completed', true);

      // Fetch progress status for ebook chapters
      const { data: ebookProgressData } = await supabase
        .from('ebook_progress')
        .select('chapter_id')
        .eq('user_id', studentId);

      const completedLessonIds = new Set(progressData?.map(p => p.lesson_id) || []);
      const completedChapterIds = new Set(ebookProgressData?.map(p => p.chapter_id) || []);

      // Fetch payment history
      const { data: paymentData } = await supabase
        .from('payments')
        .select('*')
        .eq('user_id', studentId)
        .order('created_at', { ascending: false });

      setPayments(paymentData || []);

      // Calculate progress per course enrollment
      const courseEnrollmentsWithProgress = (courseEnrollData || []).map(enroll => {
        const courseLessons = allLessons?.filter(l => (l.course_modules as any).course_id === enroll.course_id) || [];
        const total = courseLessons.length;
        const completed = courseLessons.filter(l => completedLessonIds.has(l.id)).length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        return {
          ...enroll,
          type: 'course',
          progress: percent,
          title: enroll.course?.title,
          cover: enroll.course?.cover_url
        };
      });

      const ebookEnrollmentsFormatted = (ebookEnrollData || []).map(enroll => {
        const ebookChapters = allChapters?.filter(c => c.ebook_id === enroll.ebook_id) || [];
        const total = ebookChapters.length;
        const completed = ebookChapters.filter(c => completedChapterIds.has(c.id)).length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        return {
          ...enroll,
          type: 'ebook',
          progress: percent,
          title: enroll.ebook?.title,
          cover: enroll.ebook?.cover_url
        };
      });

      const allEnrollments = [...courseEnrollmentsWithProgress, ...ebookEnrollmentsFormatted];
      setEnrollments(allEnrollments);

      // Calculate total spent
      const confirmedPayments = paymentData?.filter(p => p.status === 'CONFIRMED' || p.status === 'RECEIVED') || [];
      const totalSpent = confirmedPayments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

      setStats({
        coursesCompleted: allEnrollments.filter(e => e.progress === 100).length,
        lessonsWatched: completedLessonIds.size,
        totalSpent
      });

    } catch (error: any) {
      toast.error("Erro ao carregar dados do aluno: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleGenerateCertificate = async (enrollment: any) => {
    try {
      setCertLoading(enrollment.id);
      
      // First check if certificate is enabled for this content
      const config = await getCertConfigFn({ data: { contentId: enrollment.type === 'course' ? enrollment.course_id : enrollment.ebook_id } }) as any;
      
      if (!config || !config.is_enabled) {
        toast.error("A geração de certificado não está habilitada para este conteúdo.");
        return;
      }

      await generateCertFn({
        data: {
          student_id: studentId,
          content_id: enrollment.type === 'course' ? enrollment.course_id : enrollment.ebook_id,
          content_type: enrollment.type as 'course' | 'ebook',
        }
      });
      
      toast.success("Certificado gerado com sucesso!");
      fetchStudentData();
    } catch (error: any) {
      toast.error("Erro ao gerar certificado: " + error.message);
    } finally {
      setCertLoading(null);
    }
  };


  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#ff6a00]" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Aluno não encontrado</h2>
        <button 
          onClick={() => window.history.back()}
          className="text-[#ff6a00] hover:underline flex items-center gap-2 mx-auto"
        >
          <ChevronLeft className="w-4 h-4" /> Voltar para listagem
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => window.history.back()}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <PageHeader 
          title={`Perfil: ${profile.name || "Sem Nome"}`} 
          subtitle="Visualize o progresso e informações detalhadas do aluno." 
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[350px_1fr]">
        {/* Profile Info Card */}
        <aside className="space-y-6">
          <section className="glass overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
            <div className="h-24 bg-gradient-to-br from-[#ff6a00] to-[#ff9500] opacity-20" />
            <div className="relative -mt-12 flex flex-col items-center p-6 text-center">
              <div className="h-24 w-24 rounded-2xl border-4 border-[#0a0a0a] bg-[#ff6a00]/10 flex items-center justify-center text-[#ff6a00] text-3xl font-bold ring-1 ring-white/10">
                {profile.name?.charAt(0) || "A"}
              </div>
              <h3 className="mt-4 font-display text-xl font-bold">{profile.name || "Sem Nome"}</h3>
              <p className="text-sm text-white/40">Membro desde {profile.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : "—"}</p>
              
              <div className="mt-6 grid w-full grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/[0.03] p-3 text-center border border-white/5">
                  <div className="text-lg font-bold text-[#ff6a00]">{stats.lessonsWatched}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Aulas</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3 text-center border border-white/5">
                  <div className="text-lg font-bold text-[#ff6a00]">{stats.coursesCompleted}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Cursos</div>
                </div>
                <div className="col-span-2 rounded-xl bg-[#ff6a00]/5 p-3 text-center border border-[#ff6a00]/10">
                  <div className="text-lg font-bold text-[#ff6a00]">
                    {stats.totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#ff6a00]/60">Total Investido</div>
                </div>
              </div>
            </div>
          </section>

          <section className="glass space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 flex items-center gap-2">
              <History className="w-3 h-3" /> Detalhes de Contato
            </h4>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-[#ff6a00]">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">E-mail</div>
                  <div className="truncate text-sm font-medium">{profile.email || "Não informado"}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-[#ff6a00]">
                  <Phone className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">Telefone</div>
                  <div className="truncate text-sm font-medium">{profile.phone || "Não informado"}</div>
                </div>
              </div>
            </div>
          </section>

          <StudentSupportActions
            studentId={studentId}
            email={profile.email ?? null}
            verifiedAt={profile.email_verified_at ?? null}
            onUpdated={fetchStudentData}
          />

          <AccessControlPanel
            studentId={studentId}
            status={profile.status ?? null}
            enrollments={enrollments.map((e: any) => ({
              type: e.type,
              title: e.title,
              course_id: e.course_id,
              ebook_id: e.ebook_id,
            }))}
            availableProducts={availableProducts}
            onUpdated={fetchStudentData}
          />

        </aside>


        {/* Main Content: Courses and Activity */}
        <div className="space-y-8">
          <section className="glass rounded-2xl border border-white/5 bg-white/[0.02] p-6 lg:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff6a00]/10 text-[#ff6a00]">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold text-white">Conteúdos Ativos</h3>
                  <p className="text-sm text-white/40">Cursos e E-books que o aluno possui acesso.</p>
                </div>
              </div>

              <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
                <DialogTrigger asChild>
                  <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest transition border border-white/5">
                    <ShieldAlert className="w-4 h-4 text-[#ff6a00]" />
                    Liberar Manualmente
                  </button>
                </DialogTrigger>
                <DialogContent className="bg-[#0e0e0e] border-white/10 text-white">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold">Confirmação Manual de Pagamento</DialogTitle>
                    <p className="text-sm text-white/40 mt-2">
                      Use esta ferramenta apenas se o gateway falhou. A ação será registrada para auditoria.
                    </p>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Tipo de Conteúdo</label>
                      <select 
                        value={manualData.productType}
                        onChange={(e) => setManualData({ ...manualData, productType: e.target.value as any, productId: '' })}
                        className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00]"
                      >
                        <option value="course" className="bg-[#0e0e0e]">Curso</option>
                        <option value="ebook" className="bg-[#0e0e0e]">E-book</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Produto</label>
                      <select 
                        value={manualData.productId}
                        onChange={(e) => setManualData({ ...manualData, productId: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00]"
                      >
                        <option value="" className="bg-[#0e0e0e]">Selecione um produto...</option>
                        {(manualData.productType === 'course' ? availableProducts.courses : availableProducts.ebooks).map(p => (
                          <option key={p.id} value={p.id} className="bg-[#0e0e0e]">{p.title}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Observações / Motivo</label>
                      <textarea 
                        value={manualData.notes}
                        onChange={(e) => setManualData({ ...manualData, notes: e.target.value })}
                        placeholder="Ex: Falha no webhook do Asaas, comprovante enviado via WhatsApp."
                        className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-sm outline-none focus:border-[#ff6a00] min-h-[100px] resize-none"
                      />
                    </div>
                  </div>

                  <DialogFooter className="gap-2 sm:gap-0">
                    <button 
                      onClick={() => setIsManualModalOpen(false)}
                      className="flex-1 py-3 rounded-xl bg-white/5 font-bold hover:bg-white/10 transition uppercase tracking-widest text-[10px]"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleManualConfirm}
                      disabled={manualLoading}
                      className="flex-1 py-3 rounded-xl bg-[#ff6a00] text-black font-bold disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] transition uppercase tracking-widest text-[10px]"
                    >
                      {manualLoading ? "Confirmando..." : "Confirmar Pagamento"}
                    </button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4">
              {enrollments.length > 0 ? (
                enrollments.map((enrollment) => {
                  // Calculate progress for this specific course
                  // We need to fetch this in fetchStudentData or calculate here if we had all lessons
                  // For now, let's use a placeholder or enhance fetchStudentData
                  return (
                    <div key={enrollment.id} className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] transition relative group">
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-white/5 text-[8px] font-bold uppercase tracking-widest text-white/40">
                        {enrollment.type === 'course' ? 'Curso' : 'E-book'}
                      </div>
                      <img 
                        src={enrollment.cover || "/placeholder.svg"} 
                        alt={enrollment.title}
                        className="w-16 h-16 rounded-lg object-cover bg-white/5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-sm pr-16">{enrollment.title}</h4>
                          <div className="flex items-center gap-3">
                            {enrollment.progress === 100 && (
                              <button
                                onClick={() => handleGenerateCertificate(enrollment)}
                                disabled={certLoading === enrollment.id}
                                className="flex items-center gap-1.5 px-3 py-1 bg-[#ff6a00]/10 hover:bg-[#ff6a00]/20 rounded-lg text-[9px] font-bold uppercase tracking-widest text-[#ff6a00] transition disabled:opacity-50"
                              >
                                {certLoading === enrollment.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Award className="w-3 h-3" />
                                )}
                                Gerar Certificado
                              </button>
                            )}
                            <span className="text-[10px] font-bold text-[#ff6a00] uppercase tracking-widest">
                              {enrollment.progress || 0}% Concluído
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-[#ff6a00] to-[#ff9500] transition-all duration-1000"
                            style={{ width: `${enrollment.progress || 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
                  <p className="text-sm text-white/20 uppercase tracking-widest font-bold">Nenhum curso matriculado</p>
                </div>
              )}
            </div>
          </section>

          {/* Activity Log */}
          <section className="glass rounded-2xl border border-white/5 bg-white/[0.02] p-6 lg:p-8">
             <div className="flex items-center gap-3 mb-6">
                <History className="w-5 h-5 text-[#ff6a00]" />
                <h3 className="font-display text-xl font-bold text-white">Atividade Recente</h3>
             </div>
             
             <div className="space-y-4">
                {profile.last_activity ? (
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.01] border border-white/5">
                    <div className="mt-1 h-2 w-2 rounded-full bg-[#ff6a00] shadow-[0_0_10px_rgba(255,106,0,0.5)]" />
                    <div>
                      <p className="text-sm font-medium">Último acesso à plataforma</p>
                      <p className="text-xs text-white/40 mt-1">
                        {new Date(profile.last_activity).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 border border-dashed border-white/10 rounded-xl">
                    <p className="text-sm text-white/20 italic">Nenhuma atividade registrada recentemente.</p>
                  </div>
                 )}
             </div>
          </section>

          {/* Payment History */}
          <section className="glass rounded-2xl border border-white/5 bg-white/[0.02] p-6 lg:p-8">
             <div className="flex items-center gap-3 mb-6">
                <CreditCard className="w-5 h-5 text-[#ff6a00]" />
                <h3 className="font-display text-xl font-bold text-white">Histórico Financeiro</h3>
             </div>
             
             <div className="space-y-3">
                {payments.length > 0 ? (
                  payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.02] transition">
                      <div className="flex items-center gap-4">
                        <div className={`grid h-10 w-10 place-items-center rounded-lg ${
                          payment.status === 'CONFIRMED' || payment.status === 'RECEIVED' 
                            ? 'bg-emerald-500/10 text-emerald-400' 
                            : 'bg-white/5 text-white/40'
                        }`}>
                          <DollarSign className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">
                            {Number(payment.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                          <p className="text-[10px] text-white/40 font-medium uppercase tracking-widest mt-0.5">
                            {payment.billing_type || 'OUTRO'} • {new Date(payment.created_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest ${
                          payment.status === 'CONFIRMED' || payment.status === 'RECEIVED'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : payment.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}>
                          {payment.status === 'CONFIRMED' || payment.status === 'RECEIVED' ? 'Confirmado' : 
                           payment.status === 'PENDING' ? 'Pendente' : payment.status}
                        </span>
                        {payment.external_reference && (
                          <p className="text-[8px] text-white/20 mt-1 font-mono">{payment.external_reference}</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 border border-dashed border-white/10 rounded-xl">
                    <p className="text-sm text-white/20 italic">Nenhum registro financeiro encontrado.</p>
                  </div>
                )}
             </div>
          </section>
        </div>
      </div>
    </div>
  );
}
