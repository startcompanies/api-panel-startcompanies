import AdmZip from 'adm-zip';

export interface PartnerDocumentsZipFileEntry {
  /** Ruta dentro de la carpeta LLC (p. ej. `LLC MAIN DOCUMENTS/operating-agreement.pdf`). */
  relativePath: string;
  buffer: Buffer;
}

export interface PartnerDocumentsZipIndex {
  /** Clave normalizada (nombre LLC) → archivos de esa carpeta. */
  foldersByLlcKey: Map<string, PartnerDocumentsZipFileEntry[]>;
  /** Nombres de carpeta raíz tal como aparecen en el ZIP. */
  folderNames: string[];
  totalFiles: number;
}

export interface PartnerDocumentsZipMatchSummary {
  llcFolderCount: number;
  totalFiles: number;
  matchedFolders: number;
  unmatchedFolders: string[];
  rowsWithoutFolder: Array<{ lineNumber: number; aperturaLlcName: string }>;
}

const SKIP_PATH_PARTS = ['__MACOSX', '.DS_Store', 'Thumbs.db', 'desktop.ini'];

export function normalizeLlcFolderKey(name: string): string {
  return name.trim().toLowerCase();
}

function shouldSkipZipEntry(entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, '/');
  if (!normalized || normalized.endsWith('/')) {
    return true;
  }
  const baseName = normalized.split('/').pop() || '';
  if (baseName.startsWith('.')) {
    return true;
  }
  return SKIP_PATH_PARTS.some(
    (part) =>
      normalized.includes(`/${part}/`) ||
      normalized.startsWith(`${part}/`) ||
      baseName === part,
  );
}

/**
 * Si el ZIP tiene una carpeta contenedora única (p. ej. `00. migracion-benja-combined/`)
 * y las LLC están un nivel más abajo, devuelve 1 para omitir ese prefijo.
 */
export function detectZipLlcPathOffset(pathPartsList: string[][]): number {
  const filePaths = pathPartsList.filter((parts) => parts.length >= 2);
  if (filePaths.length === 0) {
    return 0;
  }

  const minDepth = Math.min(...filePaths.map((parts) => parts.length));
  if (minDepth < 3) {
    return 0;
  }

  const firstSegments = new Set(filePaths.map((parts) => parts[0]));
  if (firstSegments.size === 1) {
    return 1;
  }

  return 0;
}

/**
 * Indexa un ZIP con carpetas por LLC (nombre = `apertura_llc_name`).
 * Acepta LLC en la raíz del ZIP o dentro de una carpeta contenedora única.
 */
export function parsePartnerClientsDocumentsZip(
  buffer: Buffer,
): PartnerDocumentsZipIndex {
  const zip = new AdmZip(buffer);
  const foldersByLlcKey = new Map<string, PartnerDocumentsZipFileEntry[]>();
  const folderNameByKey = new Map<string, string>();
  let totalFiles = 0;

  const rawPaths: string[][] = [];
  const fileEntries: Array<{ parts: string[]; buffer: Buffer }> = [];

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }

    const entryPath = entry.entryName.replace(/\\/g, '/');
    if (shouldSkipZipEntry(entryPath)) {
      continue;
    }

    const parts = entryPath.split('/').filter(Boolean);
    if (parts.length < 2) {
      continue;
    }

    rawPaths.push(parts);
    fileEntries.push({ parts, buffer: entry.getData() });
  }

  const pathOffset = detectZipLlcPathOffset(rawPaths);

  for (const { parts, buffer: fileBuffer } of fileEntries) {
    const llcIndex = pathOffset;
    if (parts.length <= llcIndex + 1) {
      continue;
    }

    const llcFolderName = parts[llcIndex];
    const relativePath = parts.slice(llcIndex + 1).join('/');
    if (!relativePath) {
      continue;
    }

    const key = normalizeLlcFolderKey(llcFolderName);
    const list = foldersByLlcKey.get(key) ?? [];
    list.push({
      relativePath,
      buffer: fileBuffer,
    });
    foldersByLlcKey.set(key, list);
    folderNameByKey.set(key, llcFolderName);
    totalFiles++;
  }

  return {
    foldersByLlcKey,
    folderNames: [...folderNameByKey.values()],
    totalFiles,
  };
}

export function summarizeDocumentsZipMatch(
  zipIndex: PartnerDocumentsZipIndex,
  validRows: Array<{ lineNumber: number; aperturaLlcName: string }>,
): PartnerDocumentsZipMatchSummary {
  const csvLlcKeys = new Set(
    validRows.map((r) => normalizeLlcFolderKey(r.aperturaLlcName)),
  );

  const zipKeys = new Set(zipIndex.foldersByLlcKey.keys());
  const unmatchedFolders = zipIndex.folderNames.filter(
    (name) => !csvLlcKeys.has(normalizeLlcFolderKey(name)),
  );

  const rowsWithoutFolder = validRows.filter(
    (r) => !zipKeys.has(normalizeLlcFolderKey(r.aperturaLlcName)),
  );

  let matchedFolders = 0;
  for (const key of zipKeys) {
    if (csvLlcKeys.has(key)) {
      matchedFolders++;
    }
  }

  return {
    llcFolderCount: zipIndex.folderNames.length,
    totalFiles: zipIndex.totalFiles,
    matchedFolders,
    unmatchedFolders,
    rowsWithoutFolder,
  };
}
