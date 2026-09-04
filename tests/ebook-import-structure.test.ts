import { describe, expect, it } from "vitest";
import { isModuleTitle, normalizeImportStructure } from "@/lib/ebook-import-structure";

describe("normalizeImportStructure", () => {
  it("transforma títulos de módulo recebidos como capítulos em limites de módulo", () => {
    const result = normalizeImportStructure([
      { title: "Capa", content: "", order_index: 0 },
      { title: "MÓDULO 1 — INTRODUÇÃO", content: "", order_index: 1 },
      { title: "Capítulo 1.1", content: "<p>Primeiro</p>", order_index: 2 },
      { title: "MÓDULO 2 — VENDAS", content: "", order_index: 3 },
      { title: "Capítulo 2.1", content: "<p>Segundo</p>", order_index: 4 },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((section) => section.module_title)).toEqual([
      "MÓDULO 1 — INTRODUÇÃO",
      "MÓDULO 2 — VENDAS",
    ]);
    expect(result.map((section) => section.title)).toEqual(["Capítulo 1.1", "Capítulo 2.1"]);
  });

  it("preserva a estrutura já reconhecida", () => {
    const result = normalizeImportStructure([
      { title: "Capítulo 1", content: "<p>Texto</p>", order_index: 0, module_title: "MÓDULO 1" },
    ]);

    expect(result[0]?.module_title).toBe("MÓDULO 1");
  });

  it("reconhece variações usuais de títulos de módulo", () => {
    expect(isModuleTitle("Módulo 1 — Começo")).toBe(true);
    expect(isModuleTitle("1. UNIDADE — Base")).toBe(true);
    expect(isModuleTitle("PARTE 2: Venda")).toBe(true);
    expect(isModuleTitle("Capítulo 2.1")).toBe(false);
  });
});