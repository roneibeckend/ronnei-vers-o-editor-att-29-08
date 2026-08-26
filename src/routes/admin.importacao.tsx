import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { importKiwifyStudents } from "@/lib/kiwify-import.functions";
import { formatCpf, isValidCpf, cpfDigits } from "@/lib/cpf";

export const Route = createFileRoute("/admin/importacao")({
  component: KiwifyImportPage,
  head: () => ({
    meta: [
      { title: "Importação de Alunos Kiwify | Ronnei na Veia" },
      { name: "description", content: "Importe alunos da Kiwify com nome, e-mail, CPF e telefone e matricule em cursos ou e-books." },
    ],
  }),
});

type ParsedRow = {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  product: string;
  valid: boolean;
  duplicate?: boolean;
  issue?: string;
};

const HEADER_ALIASES: Record<string, "name" | "email" | "cpf" | "phone" | "product"> = {
  nome: "name",
  name: "name",
  "nome completo": "name",
  cliente: "name",
  comprador: "name",
  email: "email",
  "e-mail": "email",
  "email do cliente": "email",
  cpf: "cpf",
  "cpf/cnpj": "cpf",
  documento: "cpf",
  telefone: "phone",
  celular: "phone",
  whatsapp: "phone",
  phone: "phone",
  mobile: "phone",
  produto: "product",
  product: "product",
  oferta: "product",
  "nome do produto": "product",
  "produto/oferta": "product",
};


function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out.map((v) => v.trim());
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitLine(lines[0], delimiter).map((h) => h.toLowerCase().replace(/^"|"$/g, ""));

  const map = header.map((h) => HEADER_ALIASES[h] ?? null);
  const rows: ParsedRow[] = [];

  const seen = new Set<string>();

  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    const row: ParsedRow = { name: "", email: "", cpf: "", phone: "", product: "", valid: true };
    map.forEach((field, index) => {
      if (!field) return;
      row[field] = (cells[index] ?? "").replace(/^"|"$/g, "");
    });
    row.email = row.email.trim().toLowerCase();

    if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      row.valid = false;
      row.issue = "E-mail inválido ou ausente";
    } else if (seen.has(row.email)) {
      row.valid = false;
      row.duplicate = true;
      row.issue = "Registro duplicado na planilha";
    } else if (row.cpf && !isValidCpf(row.cpf)) {
      row.valid = false;
      row.issue = "CPF inválido";
    }
    if (row.email) seen.add(row.email);
    rows.push(row);
  }
  return rows;
}

function normalizeTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}


function KiwifyImportPage() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [products, setProducts] = useState<{ id: string; title: string; type: "course" | "ebook" }[]>([]);
  const [product, setProduct] = useState("");
  const [sendPasswordEmail, setSendPasswordEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const [courses, ebooks] = await Promise.all([
        supabase.from("courses").select("id, title").in("status", ["active", "published"]),
        supabase.from("ebooks").select("id, title").in("status", ["active", "published"]),
      ]);
      setProducts([
        ...(courses.data || []).map((c: any) => ({ id: c.id, title: c.title, type: "course" as const })),
        ...(ebooks.data || []).map((e: any) => ({ id: e.id, title: e.title, type: "ebook" as const })),
      ]);
    })();
  }, []);

  const validRows = useMemo(() => rows.filter((r) => r.valid), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => !r.valid), [rows]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length) {
      toast.error("Nenhuma linha encontrada. Verifique o cabeçalho da planilha (nome, email, cpf, telefone).");
      return;
    }
    setRows(parsed);
    setFileName(file.name);
    setResult(null);
    toast.success(`${parsed.length} linha(s) carregada(s).`);
  }

  async function run(dryRun: boolean) {
    if (!validRows.length) {
      toast.error("Nenhuma linha válida para importar.");
      return;
    }
    const selected = products.find((p) => `${p.type}:${p.id}` === product);
    try {
      setBusy(true);
      const payload = {
        rows: validRows.map((r) => ({
          email: r.email,
          name: r.name || null,
          cpf: cpfDigits(r.cpf) || null,
          phone: r.phone || null,
        })),
        productType: selected?.type ?? null,
        productId: selected?.id ?? null,
        sendPasswordEmail: dryRun ? false : sendPasswordEmail,
        dryRun,
      };
      const res = await importKiwifyStudents({ data: payload });
      setResult(res);
      toast.success(
        dryRun
          ? "Simulação concluída — nada foi alterado."
          : `Importação concluída: ${res.summary.created} criados, ${res.summary.updated} atualizados.`,
      );
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "falha na importação"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Importação de Alunos (Kiwify)</h2>
        <p className="text-sm text-white/40">
          Envie a planilha exportada da Kiwify em CSV. Colunas reconhecidas: nome, email, cpf e telefone. O CPF é opcional.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-5">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center transition hover:border-[#ff6a00]/50">
          <FileSpreadsheet className="h-8 w-8 text-[#ff6a00]" />
          <span className="text-sm font-medium">{fileName || "Selecionar arquivo CSV"}</span>
          <span className="text-[11px] text-white/40">Máximo de 500 alunos por importação</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Matricular em (opcional)</label>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-[#ff6a00]"
            >
              <option value="">Não matricular</option>
              {products.map((p) => (
                <option key={`${p.type}:${p.id}`} value={`${p.type}:${p.id}`}>
                  {p.type === "course" ? "Curso" : "E-book"} — {p.title}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-end gap-2 pb-3 text-sm text-white/70">
            <input
              type="checkbox"
              checked={sendPasswordEmail}
              onChange={(e) => setSendPasswordEmail(e.target.checked)}
              className="h-4 w-4 accent-[#ff6a00]"
            />
            Enviar e-mail para o aluno definir a senha
          </label>
        </div>

        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="rounded-lg bg-white/5 px-3 py-1.5"><Users className="mr-1 inline h-3 w-3" />{rows.length} linhas</span>
              <span className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-emerald-400">{validRows.length} válidas</span>
              {invalidRows.length > 0 && (
                <span className="rounded-lg bg-red-500/10 px-3 py-1.5 text-red-400">{invalidRows.length} com erro</span>
              )}
            </div>

            <div className="max-h-72 overflow-auto rounded-xl border border-white/5">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-white/40">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">CPF</th>
                    <th className="px-4 py-3">Telefone</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r, i) => (
                    <tr key={`${r.email}-${i}`} className="border-t border-white/5">
                      <td className="px-4 py-2.5">{r.name || "—"}</td>
                      <td className="px-4 py-2.5">{r.email || "—"}</td>
                      <td className="px-4 py-2.5">{r.cpf ? formatCpf(r.cpf) : "—"}</td>
                      <td className="px-4 py-2.5">{r.phone || "—"}</td>
                      <td className="px-4 py-2.5">
                        {r.valid ? (
                          <span className="text-emerald-400">OK</span>
                        ) : (
                          <span className="text-red-400">{r.issue}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => run(true)}
                disabled={busy}
                className="flex-1 rounded-xl bg-white/5 py-3.5 text-xs font-bold uppercase tracking-widest transition hover:bg-white/10 disabled:opacity-50"
              >
                {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Simular importação"}
              </button>
              <button
                onClick={() => run(false)}
                disabled={busy}
                className="flex-1 rounded-xl bg-[#ff6a00] py-3.5 text-xs font-bold uppercase tracking-widest text-black transition hover:scale-[1.01] disabled:opacity-50"
              >
                {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <><Upload className="mr-2 inline h-4 w-4" />Importar alunos</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
          <h3 className="text-sm font-bold">
            {result.dryRun ? "Resultado da simulação" : "Resultado da importação"}
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5 text-center text-xs">
            {[
              ["Total", result.summary.total],
              ["Criados", result.summary.created],
              ["Atualizados", result.summary.updated],
              ["Matrículas", result.summary.enrolled],
              ["Erros", result.summary.errors],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-white/[0.03] p-3">
                <div className="text-lg font-bold text-[#ff6a00]">{String(value)}</div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">{label}</div>
              </div>
            ))}
          </div>
          <div className="max-h-64 space-y-1.5 overflow-auto">
            {result.results.map((r: any, i: number) => (
              <div key={`${r.email}-${i}`} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-xs">
                {r.status === "error" ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                )}
                <span className="truncate font-medium">{r.email}</span>
                <span className="ml-auto text-right text-white/40">{r.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
