import { describe, expect, it } from "vitest";
import { computeCheckoutPreview, roundCents } from "@/lib/checkout-preview";

describe("computeCheckoutPreview", () => {
  it("aplica desconto percentual validado pelo servidor", () => {
    const p = computeCheckoutPreview({ subtotal: 97, couponDiscount: 19.4, couponCode: "OFF20" });
    expect(p.subtotal).toBe(97);
    expect(p.discount).toBe(19.4);
    expect(p.total).toBe(77.6);
    expect(p.couponCode).toBe("OFF20");
    expect(p.isFree).toBe(false);
  });

  it("cupom de 100% zera o total e marca como gratuito", () => {
    const p = computeCheckoutPreview({ subtotal: 47.9, couponDiscount: 47.9, couponCode: "FREE100" });
    expect(p.total).toBe(0);
    expect(p.isFree).toBe(true);
    expect(p.hasDiscount).toBe(true);
  });

  it("mantém itens adicionais no subtotal e desconta só o cupom do principal", () => {
    const p = computeCheckoutPreview({ subtotal: 97 + 40.72, couponDiscount: 97, couponCode: "CURSO100" });
    expect(p.subtotal).toBe(137.72);
    expect(p.discount).toBe(97);
    expect(p.total).toBe(40.72);
    expect(p.isFree).toBe(false);
  });

  it("nunca deixa o total negativo", () => {
    const p = computeCheckoutPreview({ subtotal: 30, couponDiscount: 500 });
    expect(p.discount).toBe(30);
    expect(p.total).toBe(0);
    expect(p.isFree).toBe(true);
  });

  it("sem cupom mantém o subtotal", () => {
    const p = computeCheckoutPreview({ subtotal: 197 });
    expect(p.total).toBe(197);
    expect(p.hasDiscount).toBe(false);
    expect(p.couponCode).toBeNull();
  });

  it("arredonda corretamente em centavos", () => {
    const p = computeCheckoutPreview({ subtotal: 19.9 * 3, couponDiscount: 19.9 * 0.1 });
    expect(p.subtotal).toBe(59.7);
    expect(p.discount).toBe(1.99);
    expect(p.total).toBe(57.71);
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
  });

  it("ignora valores inválidos", () => {
    const p = computeCheckoutPreview({ subtotal: Number.NaN, couponDiscount: -10 });
    expect(p.subtotal).toBe(0);
    expect(p.discount).toBe(0);
    expect(p.total).toBe(0);
    expect(p.isFree).toBe(false);
  });
});
