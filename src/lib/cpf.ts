/** Utilitários de CPF (client-safe). CPF é sempre opcional no sistema. */

export function cpfDigits(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

export function formatCpf(value?: string | null): string {
  const d = cpfDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Validação oficial dos dígitos verificadores. */
export function isValidCpf(value?: string | null): boolean {
  const d = cpfDigits(value);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
