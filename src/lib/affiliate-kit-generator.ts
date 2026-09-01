import PptxGenJS from "pptxgenjs";

/**
 * Gerador de kits de divulgação para afiliados.
 * Gera um .pptx editável (importável no Canva) por produto e formato.
 */

export type KitFormat = "story" | "feed" | "square";

export interface KitProduct {
  type: "curso" | "ebook" | "consultoria" | "fidelize";
  title: string;
  price: number;
  /** Sufixo do preço (ex.: "/mês") */
  pricePeriod?: string;
  description?: string;
  bullets: string[];
  coverUrl?: string | null;
  /** Link já com ?ref= do afiliado */
  link: string;
}

const COLORS = {
  bg: "0C0B0A",
  panel: "16130F",
  gold: "E8B04B",
  orange: "FF8A18",
  white: "FFFFFF",
  muted: "B8AFA6",
};

const FORMATS: Record<KitFormat, { w: number; h: number; label: string }> = {
  // 1080x1920, 1080x1350, 1080x1080 em polegadas (96 dpi)
  story: { w: 11.25, h: 20, label: "Story 1080x1920" },
  feed: { w: 11.25, h: 14.06, label: "Feed 1080x1350" },
  square: { w: 11.25, h: 11.25, label: "Quadrado 1080x1080" },
};

export const KIT_FORMAT_LABELS: Record<KitFormat, string> = {
  story: FORMATS.story.label,
  feed: FORMATS.feed.label,
  square: FORMATS.square.label,
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function toDataUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const TYPE_LABEL: Record<KitProduct["type"], string> = {
  curso: "CURSO ONLINE",
  ebook: "E-BOOK",
  consultoria: "CONSULTORIA",
  fidelize: "PLANO FIDELIZE",
};

/** Copies prontas por produto (texto puro, sem métricas inventadas). */
export function buildKitCopies(p: KitProduct) {
  const preco = `${brl(p.price)}${p.pricePeriod ?? ""}`;
  const bullets = p.bullets.map((b) => `• ${b}`).join("\n");
  return {
    whatsapp:
      `${p.title}\n\n` +
      `${p.description ?? ""}\n\n` +
      `${bullets}\n\n` +
      `Investimento: ${preco}\n` +
      `Garanta o seu: ${p.link}`,
    instagram:
      `${TYPE_LABEL[p.type]} — ${p.title}\n\n` +
      `${p.description ?? ""}\n\n` +
      `${bullets}\n\n` +
      `${preco} • link na bio 👉 ${p.link}\n\n` +
      `#espetinho #ronneinaveia #empreendedorismo`,
    bio: `${p.title} — ${preco} 👉 ${p.link}`,
    story:
      `Quer resultado de verdade com ${p.type === "fidelize" ? "fidelização" : "espetinhos"}?\n` +
      `${p.title} por ${preco}. Arrasta pra cima: ${p.link}`,
  };
}

export async function generateAffiliateKitPPTX(
  product: KitProduct,
  format: KitFormat = "story",
) {
  const { w, h } = FORMATS[format];
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "KIT", width: w, height: h });
  pptx.layout = "KIT";

  const cover = await toDataUrl(product.coverUrl);
  const copies = buildKitCopies(product);
  const pad = w * 0.08;
  const cw = w - pad * 2;

  const base = (slide: PptxGenJS.Slide) => {
    slide.background = { color: COLORS.bg };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w,
      h: h * 0.012,
      fill: { color: COLORS.gold },
    });
    slide.addText("RONNEI NA VEIA", {
      x: pad,
      y: h * 0.035,
      w: cw,
      h: 0.5,
      fontSize: 14,
      bold: true,
      color: COLORS.gold,
      charSpacing: 3,
      fontFace: "Arial",
    });
  };

  // Slide 1 — capa / chamada
  const s1 = pptx.addSlide();
  base(s1);
  let y = h * 0.1;
  if (cover) {
    s1.addImage({
      data: cover,
      x: pad,
      y,
      w: cw,
      h: h * 0.34,
      sizing: { type: "cover", w: cw, h: h * 0.34 },
    });
    y += h * 0.38;
  }
  s1.addText(TYPE_LABEL[product.type], {
    x: pad,
    y,
    w: cw,
    h: 0.4,
    fontSize: 13,
    bold: true,
    color: COLORS.orange,
    charSpacing: 3,
  });
  s1.addText(product.title.toUpperCase(), {
    x: pad,
    y: y + 0.55,
    w: cw,
    h: h * 0.16,
    fontSize: format === "story" ? 44 : 38,
    bold: true,
    color: COLORS.white,
    valign: "top",
  });
  if (product.description) {
    s1.addText(product.description, {
      x: pad,
      y: y + h * 0.19,
      w: cw,
      h: h * 0.1,
      fontSize: 18,
      color: COLORS.muted,
    });
  }
  s1.addText(`${brl(product.price)}${product.pricePeriod ?? ""}`, {
    x: pad,
    y: h - pad - 2.4,
    w: cw,
    h: 1,
    fontSize: 40,
    bold: true,
    color: COLORS.gold,
  });
  s1.addShape(pptx.ShapeType.roundRect, {
    x: pad,
    y: h - pad - 1.2,
    w: cw,
    h: 1,
    fill: { color: COLORS.orange },
    rectRadius: 0.3,
  });
  s1.addText("QUERO GARANTIR O MEU", {
    x: pad,
    y: h - pad - 1.2,
    w: cw,
    h: 1,
    fontSize: 20,
    bold: true,
    color: COLORS.white,
    align: "center",
    valign: "middle",
  });

  // Slide 2 — benefícios
  const s2 = pptx.addSlide();
  base(s2);
  s2.addText("O QUE VOCÊ RECEBE", {
    x: pad,
    y: h * 0.12,
    w: cw,
    h: 1,
    fontSize: 34,
    bold: true,
    color: COLORS.white,
  });
  product.bullets.slice(0, 6).forEach((b, i) => {
    const by = h * 0.22 + i * (h * 0.09);
    s2.addShape(pptx.ShapeType.roundRect, {
      x: pad,
      y: by,
      w: cw,
      h: h * 0.075,
      fill: { color: COLORS.panel },
      line: { color: COLORS.gold, width: 0.75 },
      rectRadius: 0.2,
    });
    s2.addText(b, {
      x: pad + 0.4,
      y: by,
      w: cw - 0.8,
      h: h * 0.075,
      fontSize: 16,
      color: COLORS.white,
      valign: "middle",
    });
  });
  s2.addText(product.link, {
    x: pad,
    y: h - pad - 0.8,
    w: cw,
    h: 0.6,
    fontSize: 14,
    color: COLORS.gold,
    align: "center",
  });

  // Slide 3 — oferta + link
  const s3 = pptx.addSlide();
  base(s3);
  s3.addText("COMECE HOJE", {
    x: pad,
    y: h * 0.14,
    w: cw,
    h: 1,
    fontSize: 38,
    bold: true,
    color: COLORS.white,
  });
  s3.addText(product.title, {
    x: pad,
    y: h * 0.24,
    w: cw,
    h: h * 0.1,
    fontSize: 22,
    color: COLORS.muted,
  });
  s3.addText(`${brl(product.price)}${product.pricePeriod ?? ""}`, {
    x: pad,
    y: h * 0.36,
    w: cw,
    h: 1.4,
    fontSize: 54,
    bold: true,
    color: COLORS.gold,
  });
  s3.addShape(pptx.ShapeType.roundRect, {
    x: pad,
    y: h * 0.52,
    w: cw,
    h: 1,
    fill: { color: COLORS.orange },
    rectRadius: 0.3,
  });
  s3.addText("ACESSAR AGORA", {
    x: pad,
    y: h * 0.52,
    w: cw,
    h: 1,
    fontSize: 20,
    bold: true,
    color: COLORS.white,
    align: "center",
    valign: "middle",
  });
  s3.addText(product.link, {
    x: pad,
    y: h * 0.63,
    w: cw,
    h: 0.7,
    fontSize: 14,
    color: COLORS.gold,
    align: "center",
  });

  // Slide 4 — copy pronta (texto editável)
  const s4 = pptx.addSlide();
  base(s4);
  s4.addText("COPY PRONTA", {
    x: pad,
    y: h * 0.1,
    w: cw,
    h: 0.9,
    fontSize: 30,
    bold: true,
    color: COLORS.gold,
  });
  s4.addText(
    `WHATSAPP\n${copies.whatsapp}\n\nINSTAGRAM\n${copies.instagram}\n\nBIO\n${copies.bio}`,
    {
      x: pad,
      y: h * 0.18,
      w: cw,
      h: h * 0.72,
      fontSize: 12,
      color: COLORS.white,
      valign: "top",
    },
  );

  const slug = product.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  await pptx.writeFile({ fileName: `kit-${product.type}-${slug}-${format}.pptx` });
}
