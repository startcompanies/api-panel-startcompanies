export const PARTNER_CLIENT_IMPORT_REQUIRED_COLUMNS = [
  'client_full_name',
  'client_email',
  'apertura_llc_name',
  'apertura_incorporation_state',
  'apertura_llc_type',
] as const;

export const PARTNER_CLIENT_IMPORT_OPTIONAL_COLUMNS = [
  'client_phone',
  'client_company',
  'client_notes',
  'client_invite_to_portal',
  'request_notes',
  'request_status',
  'request_plan',
  'apertura_ein',
  'apertura_llc_address',
  'apertura_business_description',
  'apertura_llc_name_option_2',
  'apertura_llc_name_option_3',
  'apertura_linkedin',
] as const;

export type PartnerClientImportColumn =
  | (typeof PARTNER_CLIENT_IMPORT_REQUIRED_COLUMNS)[number]
  | (typeof PARTNER_CLIENT_IMPORT_OPTIONAL_COLUMNS)[number];

export interface PartnerClientImportRow {
  lineNumber: number;
  clientFullName: string;
  clientEmail: string;
  aperturaLlcName: string;
  aperturaIncorporationState: string;
  aperturaLlcType: 'single' | 'multi';
  clientPhone?: string;
  clientCompany?: string;
  clientNotes?: string;
  clientInviteToPortal: boolean;
  requestNotes?: string;
  requestStatus: RequestImportStatus;
  requestPlan?: string;
  aperturaEin?: string;
  aperturaLlcAddress?: string;
  aperturaBusinessDescription?: string;
  aperturaLlcNameOption2?: string;
  aperturaLlcNameOption3?: string;
  aperturaLinkedin?: string;
}

export type RequestImportStatus =
  | 'solicitud-recibida'
  | 'pendiente'
  | 'en-proceso'
  | 'completada'
  | 'rechazada';

const REQUEST_STATUSES: RequestImportStatus[] = [
  'solicitud-recibida',
  'pendiente',
  'en-proceso',
  'completada',
  'rechazada',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  result.push(current.trim());
  return result;
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase();
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseYesNo(value: string | undefined, defaultValue: boolean): boolean {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return defaultValue;
  if (v === 'yes' || v === 'si' || v === 'sí' || v === 'true' || v === '1') {
    return true;
  }
  if (v === 'no' || v === 'false' || v === '0') {
    return false;
  }
  return defaultValue;
}

export interface ParsedPartnerClientImport {
  headers: string[];
  rows: Array<{ lineNumber: number; raw: Record<string, string> }>;
  headerErrors: string[];
}

export function parsePartnerClientsCsv(content: string): ParsedPartnerClientImport {
  const normalizedContent = content.replace(/^\uFEFF/, '');
  const lines = normalizedContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index, arr) => line.length > 0 || (index === arr.length - 1 && line === ''));

  if (lines.length === 0) {
    return { headers: [], rows: [], headerErrors: ['El archivo CSV está vacío'] };
  }

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeader);
  const headerErrors: string[] = [];

  for (const required of PARTNER_CLIENT_IMPORT_REQUIRED_COLUMNS) {
    if (!headerCells.includes(required)) {
      headerErrors.push(`Falta la columna obligatoria: ${required}`);
    }
  }

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const raw: Record<string, string> = {};
    headerCells.forEach((header, colIndex) => {
      raw[header] = values[colIndex] ?? '';
    });
    return { lineNumber: index + 2, raw };
  });

  return { headers: headerCells, rows, headerErrors };
}

export function validatePartnerClientImportRow(
  lineNumber: number,
  raw: Record<string, string>,
): { row?: PartnerClientImportRow; errors: string[] } {
  const errors: string[] = [];

  const clientFullName = (raw.client_full_name ?? '').trim();
  const clientEmail = (raw.client_email ?? '').trim();
  const aperturaLlcName = (raw.apertura_llc_name ?? '').trim();
  const aperturaIncorporationState = (raw.apertura_incorporation_state ?? '').trim();
  const aperturaLlcTypeRaw = (raw.apertura_llc_type ?? '').trim().toLowerCase();

  if (!clientFullName) errors.push('client_full_name es obligatorio');
  if (!clientEmail) {
    errors.push('client_email es obligatorio');
  } else if (!EMAIL_RE.test(clientEmail)) {
    errors.push('client_email tiene formato inválido');
  }
  if (!aperturaLlcName) errors.push('apertura_llc_name es obligatorio');
  if (!aperturaIncorporationState) {
    errors.push('apertura_incorporation_state es obligatorio');
  }
  if (!aperturaLlcTypeRaw) {
    errors.push('apertura_llc_type es obligatorio');
  } else if (aperturaLlcTypeRaw !== 'single' && aperturaLlcTypeRaw !== 'multi') {
    errors.push('apertura_llc_type debe ser single o multi');
  }

  const requestStatusRaw = emptyToUndefined(raw.request_status)?.toLowerCase();
  let requestStatus: RequestImportStatus = 'completada';
  if (requestStatusRaw) {
    if (!REQUEST_STATUSES.includes(requestStatusRaw as RequestImportStatus)) {
      errors.push(
        `request_status inválido. Valores: ${REQUEST_STATUSES.join(', ')}`,
      );
    } else {
      requestStatus = requestStatusRaw as RequestImportStatus;
    }
  }

  const inviteRaw = emptyToUndefined(raw.client_invite_to_portal);
  if (
    inviteRaw &&
    !['yes', 'no', 'si', 'sí', 'true', 'false', '1', '0'].includes(
      inviteRaw.toLowerCase(),
    )
  ) {
    errors.push('client_invite_to_portal debe ser yes o no');
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    row: {
      lineNumber,
      clientFullName,
      clientEmail: clientEmail.toLowerCase(),
      aperturaLlcName,
      aperturaIncorporationState,
      aperturaLlcType: aperturaLlcTypeRaw as 'single' | 'multi',
      clientPhone: emptyToUndefined(raw.client_phone),
      clientCompany: emptyToUndefined(raw.client_company),
      clientNotes: emptyToUndefined(raw.client_notes),
      clientInviteToPortal: parseYesNo(raw.client_invite_to_portal, false),
      requestNotes: emptyToUndefined(raw.request_notes),
      requestStatus,
      requestPlan: emptyToUndefined(raw.request_plan),
      aperturaEin: emptyToUndefined(raw.apertura_ein),
      aperturaLlcAddress: emptyToUndefined(raw.apertura_llc_address),
      aperturaBusinessDescription: emptyToUndefined(
        raw.apertura_business_description,
      ),
      aperturaLlcNameOption2: emptyToUndefined(raw.apertura_llc_name_option_2),
      aperturaLlcNameOption3: emptyToUndefined(raw.apertura_llc_name_option_3),
      aperturaLinkedin: emptyToUndefined(raw.apertura_linkedin),
    },
  };
}

export function duplicateImportKey(email: string, llcName: string): string {
  return `${email.trim().toLowerCase()}::${llcName.trim().toLowerCase()}`;
}
