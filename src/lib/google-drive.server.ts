// Google Drive (server-only): base para gravações e materiais das consultorias.

import { googleFetch } from "@/lib/google-oauth.server";
import { getGoogleSettings } from "@/lib/google-calendar.server";

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  createdTime: string | null;
  size: number | null;
};

function mapFile(f: any): DriveFile {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink: f.webViewLink ?? null,
    createdTime: f.createdTime ?? null,
    size: f.size ? Number(f.size) : null,
  };
}

export async function getDriveAbout() {
  const data = await googleFetch<any>(
    "drive.about.get",
    `${DRIVE_BASE}/about?fields=user(displayName,emailAddress),storageQuota(limit,usage)`,
  );
  return {
    email: data?.user?.emailAddress ?? null,
    name: data?.user?.displayName ?? null,
    usage: data?.storageQuota?.usage ? Number(data.storageQuota.usage) : null,
    limit: data?.storageQuota?.limit ? Number(data.storageQuota.limit) : null,
  };
}

/** Cria (ou reaproveita) uma pasta dentro do pai informado. */
export async function ensureFolder(name: string, parentId?: string | null): Promise<DriveFile> {
  const safeName = name.replace(/'/g, "\\'");
  const clauses = [
    `mimeType='${FOLDER_MIME}'`,
    `name='${safeName}'`,
    "trashed=false",
    parentId ? `'${parentId}' in parents` : null,
  ].filter(Boolean);

  const existing = await googleFetch<any>(
    "drive.files.list",
    `${DRIVE_BASE}/files?q=${encodeURIComponent(clauses.join(" and "))}&fields=files(id,name,mimeType,webViewLink,createdTime,size)&pageSize=1`,
  );
  if (existing.files?.[0]) return mapFile(existing.files[0]);

  const created = await googleFetch<any>(
    "drive.files.create",
    `${DRIVE_BASE}/files?fields=id,name,mimeType,webViewLink,createdTime,size`,
    {
      method: "POST",
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: parentId ? [parentId] : undefined,
      }),
    },
  );
  return mapFile(created);
}

/** Lista arquivos de uma pasta (padrão: pasta de gravações configurada). */
export async function listFolderFiles(folderId?: string | null, pageSize = 25): Promise<DriveFile[]> {
  const settings = await getGoogleSettings();
  const target = folderId || settings.drive_recordings_folder_id;
  if (!target) return [];

  const data = await googleFetch<any>(
    "drive.files.list",
    `${DRIVE_BASE}/files?q=${encodeURIComponent(`'${target}' in parents and trashed=false`)}&orderBy=createdTime desc&pageSize=${pageSize}&fields=files(id,name,mimeType,webViewLink,createdTime,size)`,
  );
  return ((data.files ?? []) as any[]).map(mapFile);
}

/**
 * Aceita a URL completa do Drive ou apenas o ID e devolve sempre o ID da pasta.
 * Ex.: https://drive.google.com/drive/folders/<id>?usp=sharing → <id>
 */
export function parseDriveFolderId(input?: string | null): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    const clean = raw.replace(/^\/+|\/+$/g, "");
    return /^[A-Za-z0-9_-]{10,}$/.test(clean) ? clean : null;
  }
  try {
    const url = new URL(raw);
    const byQuery = url.searchParams.get("id");
    if (byQuery && /^[A-Za-z0-9_-]{10,}$/.test(byQuery)) return byQuery;
    const parts = url.pathname.split("/").filter(Boolean);
    const folderIdx = parts.findIndex((p) => p === "folders" || p === "d");
    const candidate = folderIdx >= 0 ? parts[folderIdx + 1] : parts[parts.length - 1];
    return candidate && /^[A-Za-z0-9_-]{10,}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export type DriveFolderCheck = {
  ok: boolean;
  folderId: string | null;
  folderName?: string | null;
  folderLink?: string | null;
  fileCount?: number;
  files?: DriveFile[];
  error?: string;
};

/** Valida o acesso à pasta e faz uma leitura de teste (últimos arquivos). */
export async function checkRecordingsFolder(
  input?: string | null,
  sample = 5,
): Promise<DriveFolderCheck> {
  let folderId = parseDriveFolderId(input);
  if (!folderId) {
    if (input && input.trim()) {
      return { ok: false, folderId: null, error: "Não foi possível identificar o ID da pasta a partir do valor informado." };
    }
    const settings = await getGoogleSettings();
    folderId = settings.drive_recordings_folder_id ?? null;
  }
  if (!folderId) {
    return { ok: false, folderId: null, error: "Nenhuma pasta de gravações configurada." };
  }

  try {
    const meta = await googleFetch<any>(
      "drive.files.get",
      `${DRIVE_BASE}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`,
    );
    if (meta?.mimeType !== FOLDER_MIME) {
      return { ok: false, folderId, error: "O ID informado não é uma pasta do Google Drive." };
    }
    const files = await listFolderFiles(folderId, sample);
    return {
      ok: true,
      folderId,
      folderName: meta?.name ?? null,
      folderLink: meta?.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`,
      fileCount: files.length,
      files,
    };
  } catch (err: any) {
    const msg = String(err?.message ?? "Falha ao acessar a pasta");
    const friendly = /404/.test(msg)
      ? "Pasta não encontrada ou sem acesso pela conta Google conectada."
      : /403/.test(msg)
        ? "A conta Google conectada não tem permissão para ler esta pasta."
        : msg;
    return { ok: false, folderId, error: friendly };
  }
}

/** Link de compartilhamento somente leitura para um arquivo. */
export async function shareFileReadonly(fileId: string) {
  await googleFetch("drive.permissions.create", `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/permissions`, {
    method: "POST",
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  const file = await googleFetch<any>(
    "drive.files.get",
    `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink,createdTime,size`,
  );
  return mapFile(file);
}
