export interface ImportSection {
  title: string;
  content: string;
  order_index: number;
  module_title?: string;
}

const MODULE_TITLE_PATTERN = /^\s*(?:(?:\d+[.)-]?\s*)?)(m[oó]dulo|module|parte|part|unidade)\b/i;

export function isModuleTitle(title: string): boolean {
  return MODULE_TITLE_PATTERN.test(title.replace(/\u00a0/g, " "));
}

export function normalizeImportStructure(sections: ImportSection[]): ImportSection[] {
  const hasExplicitModules = sections.some((section) => isModuleTitle(section.title));
  if (!hasExplicitModules) return sections;

  const normalized: ImportSection[] = [];
  let currentModule: string | undefined;

  for (const section of sections) {
    if (isModuleTitle(section.title)) {
      currentModule = section.title.trim();
      continue;
    }

    const plainContent = section.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!currentModule && plainContent.length === 0) continue;

    normalized.push({
      ...section,
      order_index: normalized.length,
      module_title: currentModule ?? section.module_title,
    });
  }

  return normalized;
}