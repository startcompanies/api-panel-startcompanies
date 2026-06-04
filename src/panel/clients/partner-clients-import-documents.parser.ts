import AdmZip from 'adm-zip';

/** Metadatos de un archivo dentro del ZIP (sin cargar contenido). */
export interface PartnerDocumentsZipFileEntryMeta {
  relativePath: string;
}

/** Archivo listo para subir a WorkDrive. */
export interface PartnerDocumentsZipFileEntry {
  relativePath: string;
  buffer: Buffer;
}

export interface PartnerDocumentsZipIndex {
  /** Clave normalizada (nombre LLC) → archivos de esa carpeta (solo rutas). */
  foldersByLlcKey: Map<string, PartnerDocumentsZipFileEntryMeta[]>;
  /** Nombres de carpeta raíz tal como aparecen en el ZIP. */
  folderNames: string[];
  totalFiles: number;
  pathOffset: number;
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

function collectZipFilePathParts(zip: AdmZip): string[][] {
  const rawPaths: string[][] = [];
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
  }
  return rawPaths;
}

/**
 * Indexa un ZIP sin extraer el contenido de los archivos (rápido; apto para preview).
 */
export function indexPartnerClientsDocumentsZip(
  buffer: Buffer,
): PartnerDocumentsZipIndex {
  const zip = new AdmZip(buffer);
  const foldersByLlcKey = new Map<string, PartnerDocumentsZipFileEntryMeta[]>();
  const folderNameByKey = new Map<string, string>();
  let totalFiles = 0;

  const rawPaths = collectZipFilePathParts(zip);
  const pathOffset = detectZipLlcPathOffset(rawPaths);

  for (const parts of rawPaths) {
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
    list.push({ relativePath });
    foldersByLlcKey.set(key, list);
    folderNameByKey.set(key, llcFolderName);
    totalFiles++;
  }

  return {
    foldersByLlcKey,
    folderNames: [...folderNameByKey.values()],
    totalFiles,
    pathOffset,
  };
}

/**
 * Extrae archivos de una LLC concreta (carga buffers; usar en execute, no en preview).
 */
export function extractLlcDocumentFilesFromZip(
  buffer: Buffer,
  llcFolderName: string,
  pathOffset?: number,
): PartnerDocumentsZipFileEntry[] {
  const zip = new AdmZip(buffer);
  const offset =
    pathOffset ?? detectZipLlcPathOffset(collectZipFilePathParts(zip));
  const targetKey = normalizeLlcFolderKey(llcFolderName);
  const results: PartnerDocumentsZipFileEntry[] = [];

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }

    const entryPath = entry.entryName.replace(/\\/g, '/');
    if (shouldSkipZipEntry(entryPath)) {
      continue;
    }

    const parts = entryPath.split('/').filter(Boolean);
    if (parts.length <= offset + 1) {
      continue;
    }

    const llcNameInPath = parts[offset];
    if (normalizeLlcFolderKey(llcNameInPath) !== targetKey) {
      continue;
    }

    const relativePath = parts.slice(offset + 1).join('/');
    if (!relativePath) {
      continue;
    }

    results.push({
      relativePath,
      buffer: entry.getData(),
    });
  }

  return results;
}

/**
 * @deprecated Usar {@link indexPartnerClientsDocumentsZip} en preview y
 * {@link extractLlcDocumentFilesFromZip} al subir documentos.
 */
export function parsePartnerClientsDocumentsZip(
  buffer: Buffer,
): PartnerDocumentsZipIndex & {
  foldersByLlcKey: Map<string, PartnerDocumentsZipFileEntry[]>;
} {
  const index = indexPartnerClientsDocumentsZip(buffer);
  const withBuffers = new Map<string, PartnerDocumentsZipFileEntry[]>();

  for (const folderName of index.folderNames) {
    withBuffers.set(
      normalizeLlcFolderKey(folderName),
      extractLlcDocumentFilesFromZip(
        buffer,
        folderName,
        index.pathOffset,
      ),
    );
  }

  return {
    ...index,
    foldersByLlcKey: withBuffers,
  };
}

export interface PartnerLlcWorkDriveTarget {
  requestId: number;
  clientId: number;
  llcName: string;
  workDriveId: string | null;
  clientEmail: string;
}

/** Empareja carpetas del ZIP con LLCs ya importadas del partner (modo solo ZIP). */
export function summarizeDocumentsZipAgainstPartnerLlcs(
  zipIndex: PartnerDocumentsZipIndex,
  partnerLlcs: PartnerLlcWorkDriveTarget[],
): PartnerDocumentsZipMatchSummary {
  const panelLlcKeys = new Map(
    partnerLlcs.map((r) => [normalizeLlcFolderKey(r.llcName), r]),
  );
  const zipKeys = new Set(zipIndex.foldersByLlcKey.keys());

  const unmatchedFolders = zipIndex.folderNames.filter(
    (name) => !panelLlcKeys.has(normalizeLlcFolderKey(name)),
  );

  const rowsWithoutFolder = partnerLlcs
    .filter((r) => !zipKeys.has(normalizeLlcFolderKey(r.llcName)))
    .map((r, index) => ({
      lineNumber: index + 1,
      aperturaLlcName: r.llcName,
    }));

  let matchedFolders = 0;
  for (const key of zipKeys) {
    if (panelLlcKeys.has(key)) {
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
