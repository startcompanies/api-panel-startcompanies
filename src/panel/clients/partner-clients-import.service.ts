import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from './entities/client.entity';
import { Request } from '../requests/entities/request.entity';
import { AperturaLlcRequest } from '../requests/entities/apertura-llc-request.entity';
import { ClientsService } from './clients.service';
import { ZohoSyncService } from '../../zoho-config/zoho-sync.service';
import { ZohoWorkDriveService } from '../../zoho-config/zoho-workdrive.service';
import {
  duplicateImportKey,
  parsePartnerClientsCsv,
  PartnerClientImportRow,
  validatePartnerClientImportRow,
} from './partner-clients-import.parser';
import {
  normalizeLlcFolderKey,
  parsePartnerClientsDocumentsZip,
  PartnerDocumentsZipMatchSummary,
  PartnerLlcWorkDriveTarget,
  summarizeDocumentsZipAgainstPartnerLlcs,
  summarizeDocumentsZipMatch,
} from './partner-clients-import-documents.parser';

export type PartnerClientImportMode = 'csv' | 'zip' | 'csv_zip';

export type PartnerClientImportRowStatus =
  | 'valid'
  | 'invalid'
  | 'duplicate'
  | 'duplicate_in_file';

export interface PartnerClientImportPreviewRow {
  lineNumber: number;
  status: PartnerClientImportRowStatus;
  errors: string[];
  clientEmail?: string;
  clientFullName?: string;
  aperturaLlcName?: string;
  clientInviteToPortal?: boolean;
  requestId?: number;
  workDriveId?: string;
  fileCount?: number;
}

export interface PartnerClientImportPreviewResult {
  mode: PartnerClientImportMode;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  headerErrors: string[];
  rows: PartnerClientImportPreviewRow[];
  documentsZip?: PartnerDocumentsZipMatchSummary;
}

export interface PartnerClientImportExecuteResult {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  headerErrors: string[];
  rows: Array<{
    lineNumber: number;
    status: 'imported' | 'skipped' | 'failed';
    message: string;
    clientId?: number;
    requestId?: number;
    zohoAccountId?: string;
    workDriveId?: string;
    documentsUploaded?: number;
    documentsFailed?: number;
  }>;
}

@Injectable()
export class PartnerClientsImportService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Request)
    private readonly requestRepository: Repository<Request>,
    @InjectRepository(AperturaLlcRequest)
    private readonly aperturaRepository: Repository<AperturaLlcRequest>,
    private readonly clientsService: ClientsService,
    private readonly zohoSyncService: ZohoSyncService,
    private readonly zohoWorkDriveService: ZohoWorkDriveService,
    private readonly dataSource: DataSource,
  ) {}

  getSampleCsv(): { filename: string; content: Buffer } {
    const candidates = [
      path.join(__dirname, 'assets/partner-clients-import-sample.csv'),
      path.join(process.cwd(), 'docs/partner-clients-import-sample.csv'),
      path.join(process.cwd(), 'src/panel/clients/assets/partner-clients-import-sample.csv'),
    ];
    const filePath = candidates.find((p) => fs.existsSync(p));
    if (!filePath) {
      throw new NotFoundException('Plantilla CSV no encontrada');
    }
    return {
      filename: 'partner-clients-import-sample.csv',
      content: fs.readFileSync(filePath),
    };
  }

  assertImportInputs(
    csvFile?: Express.Multer.File,
    documentsZipFile?: Express.Multer.File,
  ): {
    mode: PartnerClientImportMode;
    csvContent?: string;
    documentsZipBuffer?: Buffer;
  } {
    const csvContent = csvFile?.buffer
      ? this.assertCsvFile(csvFile)
      : undefined;
    const documentsZipBuffer = this.parseOptionalDocumentsZip(documentsZipFile);

    if (!csvContent && !documentsZipBuffer) {
      throw new BadRequestException(
        'Sube un archivo CSV, un ZIP de documentos, o ambos',
      );
    }

    const mode: PartnerClientImportMode =
      csvContent && documentsZipBuffer
        ? 'csv_zip'
        : csvContent
          ? 'csv'
          : 'zip';

    return { mode, csvContent, documentsZipBuffer };
  }

  async previewImport(
    partnerId: number,
    csvFile?: Express.Multer.File,
    documentsZipFile?: Express.Multer.File,
  ): Promise<PartnerClientImportPreviewResult> {
    const { mode, csvContent, documentsZipBuffer } = this.assertImportInputs(
      csvFile,
      documentsZipFile,
    );

    if (mode === 'zip') {
      return this.previewZipOnly(partnerId, documentsZipBuffer!);
    }

    const result = await this.preview(
      csvContent!,
      partnerId,
      documentsZipBuffer,
    );
    return { ...result, mode };
  }

  async executeImport(
    partnerId: number,
    csvFile?: Express.Multer.File,
    documentsZipFile?: Express.Multer.File,
    options?: { tenantHost?: string },
  ): Promise<PartnerClientImportExecuteResult> {
    const { mode, csvContent, documentsZipBuffer } = this.assertImportInputs(
      csvFile,
      documentsZipFile,
    );

    if (mode === 'zip') {
      return this.executeZipOnly(partnerId, documentsZipBuffer!);
    }

    return this.execute(csvContent!, partnerId, {
      tenantHost: options?.tenantHost,
      documentsZipBuffer,
    });
  }

  async previewZipOnly(
    partnerId: number,
    documentsZipBuffer: Buffer,
  ): Promise<PartnerClientImportPreviewResult> {
    const zipIndex = parsePartnerClientsDocumentsZip(documentsZipBuffer);
    if (zipIndex.folderNames.length === 0) {
      return {
        mode: 'zip',
        totalRows: 0,
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        headerErrors: [
          'El ZIP no contiene carpetas LLC con archivos (una carpeta por LLC, nombre = apertura_llc_name)',
        ],
        rows: [],
      };
    }

    const partnerLlcs = await this.loadPartnerLlcTargets(partnerId);
    const targetByKey = new Map(
      partnerLlcs.map((t) => [normalizeLlcFolderKey(t.llcName), t]),
    );

    const rows: PartnerClientImportPreviewRow[] = [];
    let lineNumber = 0;

    for (const folderName of zipIndex.folderNames) {
      lineNumber++;
      const key = normalizeLlcFolderKey(folderName);
      const target = targetByKey.get(key);
      const fileCount = zipIndex.foldersByLlcKey.get(key)?.length ?? 0;

      if (!target) {
        rows.push({
          lineNumber,
          status: 'invalid',
          errors: ['LLC no encontrada en el panel para este partner'],
          aperturaLlcName: folderName,
          fileCount,
        });
        continue;
      }

      if (!target.workDriveId?.trim()) {
        rows.push({
          lineNumber,
          status: 'invalid',
          errors: [
            'Sin carpeta WorkDrive; importe el CSV primero o sincronice la solicitud con CRM',
          ],
          aperturaLlcName: folderName,
          clientEmail: target.clientEmail,
          requestId: target.requestId,
          fileCount,
        });
        continue;
      }

      rows.push({
        lineNumber,
        status: 'valid',
        errors: [],
        aperturaLlcName: folderName,
        clientEmail: target.clientEmail,
        requestId: target.requestId,
        workDriveId: target.workDriveId,
        fileCount,
      });
    }

    return {
      mode: 'zip',
      totalRows: rows.length,
      validCount: rows.filter((r) => r.status === 'valid').length,
      invalidCount: rows.filter((r) => r.status === 'invalid').length,
      duplicateCount: 0,
      headerErrors: [],
      rows,
      documentsZip: summarizeDocumentsZipAgainstPartnerLlcs(
        zipIndex,
        partnerLlcs,
      ),
    };
  }

  async executeZipOnly(
    partnerId: number,
    documentsZipBuffer: Buffer,
  ): Promise<PartnerClientImportExecuteResult> {
    const preview = await this.previewZipOnly(partnerId, documentsZipBuffer);
    if (preview.headerErrors.length > 0) {
      return {
        totalRows: 0,
        importedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        headerErrors: preview.headerErrors,
        rows: [],
      };
    }

    const zipIndex = parsePartnerClientsDocumentsZip(documentsZipBuffer);
    const resultRows: PartnerClientImportExecuteResult['rows'] = [];
    let importedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const row of preview.rows) {
      if (row.status !== 'valid' || !row.aperturaLlcName) {
        skippedCount++;
        resultRows.push({
          lineNumber: row.lineNumber,
          status: 'skipped',
          message: row.errors.join('; ') || 'Carpeta omitida',
        });
        continue;
      }

      let workDriveId = row.workDriveId?.trim();
      if (!workDriveId && row.requestId) {
        try {
          const synced = await this.zohoSyncService.syncImportedRequestToCrm(
            row.requestId,
          );
          workDriveId = synced.workDriveId;
        } catch (syncError: any) {
          failedCount++;
          resultRows.push({
            lineNumber: row.lineNumber,
            status: 'failed',
            message:
              syncError?.message ||
              'No se pudo crear carpeta WorkDrive antes de subir documentos',
            requestId: row.requestId,
          });
          continue;
        }
      }

      if (!workDriveId) {
        failedCount++;
        resultRows.push({
          lineNumber: row.lineNumber,
          status: 'failed',
          message: 'Sin carpeta WorkDrive para subir documentos',
          requestId: row.requestId,
        });
        continue;
      }

      const llcKey = normalizeLlcFolderKey(row.aperturaLlcName);
      const docFiles = zipIndex.foldersByLlcKey.get(llcKey);
      if (!docFiles?.length) {
        skippedCount++;
        resultRows.push({
          lineNumber: row.lineNumber,
          status: 'skipped',
          message: 'Carpeta ZIP sin archivos',
          requestId: row.requestId,
        });
        continue;
      }

      try {
        const uploadResult = await this.zohoWorkDriveService.uploadDocumentTree(
          workDriveId,
          docFiles,
        );
        importedCount++;
        let message = `${uploadResult.uploaded} documento(s) subidos a WorkDrive`;
        if (uploadResult.failed > 0) {
          message += `; ${uploadResult.failed} no subidos`;
        }
        resultRows.push({
          lineNumber: row.lineNumber,
          status: 'imported',
          message,
          requestId: row.requestId,
          workDriveId,
          documentsUploaded: uploadResult.uploaded,
          documentsFailed: uploadResult.failed,
        });
      } catch (uploadError: any) {
        failedCount++;
        resultRows.push({
          lineNumber: row.lineNumber,
          status: 'failed',
          message: uploadError?.message || 'Error al subir documentos',
          requestId: row.requestId,
          workDriveId,
        });
      }
    }

    return {
      totalRows: resultRows.length,
      importedCount,
      skippedCount,
      failedCount,
      headerErrors: [],
      rows: resultRows,
    };
  }

  async preview(
    csvContent: string,
    partnerId: number,
    documentsZipBuffer?: Buffer,
  ): Promise<PartnerClientImportPreviewResult> {
    const parsed = parsePartnerClientsCsv(csvContent);
    if (parsed.headerErrors.length > 0) {
      return {
        mode: documentsZipBuffer ? 'csv_zip' : 'csv',
        totalRows: 0,
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        headerErrors: parsed.headerErrors,
        rows: [],
      };
    }

    const existingKeys = await this.loadExistingDuplicateKeys(partnerId);
    const seenInFile = new Set<string>();
    const rows: PartnerClientImportPreviewRow[] = [];

    for (const { lineNumber, raw } of parsed.rows) {
      const { row, errors } = validatePartnerClientImportRow(lineNumber, raw);

      if (errors.length > 0 || !row) {
        rows.push({
          lineNumber,
          status: 'invalid',
          errors,
          clientEmail: raw.client_email,
          clientFullName: raw.client_full_name,
          aperturaLlcName: raw.apertura_llc_name,
        });
        continue;
      }

      const key = duplicateImportKey(row.clientEmail, row.aperturaLlcName);
      if (seenInFile.has(key)) {
        rows.push({
          lineNumber,
          status: 'duplicate_in_file',
          errors: ['Duplicado en el mismo archivo (email + LLC)'],
          clientEmail: row.clientEmail,
          clientFullName: row.clientFullName,
          aperturaLlcName: row.aperturaLlcName,
          clientInviteToPortal: row.clientInviteToPortal,
        });
        continue;
      }
      seenInFile.add(key);

      if (existingKeys.has(key)) {
        rows.push({
          lineNumber,
          status: 'duplicate',
          errors: ['Ya existe un cliente/solicitud con este email y LLC'],
          clientEmail: row.clientEmail,
          clientFullName: row.clientFullName,
          aperturaLlcName: row.aperturaLlcName,
          clientInviteToPortal: row.clientInviteToPortal,
        });
        continue;
      }

      rows.push({
        lineNumber,
        status: 'valid',
        errors: [],
        clientEmail: row.clientEmail,
        clientFullName: row.clientFullName,
        aperturaLlcName: row.aperturaLlcName,
        clientInviteToPortal: row.clientInviteToPortal,
      });
    }

    return {
      mode: documentsZipBuffer ? 'csv_zip' : 'csv',
      totalRows: rows.length,
      validCount: rows.filter((r) => r.status === 'valid').length,
      invalidCount: rows.filter((r) => r.status === 'invalid').length,
      duplicateCount: rows.filter(
        (r) => r.status === 'duplicate' || r.status === 'duplicate_in_file',
      ).length,
      headerErrors: [],
      rows,
      documentsZip: documentsZipBuffer
        ? summarizeDocumentsZipMatch(
            parsePartnerClientsDocumentsZip(documentsZipBuffer),
            rows
              .filter((r) => r.status === 'valid' && r.aperturaLlcName)
              .map((r) => ({
                lineNumber: r.lineNumber,
                aperturaLlcName: r.aperturaLlcName!,
              })),
          )
        : undefined,
    };
  }

  async execute(
    csvContent: string,
    partnerId: number,
    options?: { tenantHost?: string; documentsZipBuffer?: Buffer },
  ): Promise<PartnerClientImportExecuteResult> {
    const documentsZipIndex = options?.documentsZipBuffer
      ? parsePartnerClientsDocumentsZip(options.documentsZipBuffer)
      : undefined;

    const preview = await this.preview(
      csvContent,
      partnerId,
      options?.documentsZipBuffer,
    );
    if (preview.headerErrors.length > 0) {
      return {
        totalRows: 0,
        importedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        headerErrors: preview.headerErrors,
        rows: [],
      };
    }

    const parsed = parsePartnerClientsCsv(csvContent);
    const resultRows: PartnerClientImportExecuteResult['rows'] = [];
    let importedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const seenInFile = new Set<string>();

    for (const { lineNumber, raw } of parsed.rows) {
      const previewRow = preview.rows.find((r) => r.lineNumber === lineNumber);

      if (
        previewRow &&
        (previewRow.status === 'duplicate' ||
          previewRow.status === 'duplicate_in_file' ||
          previewRow.status === 'invalid')
      ) {
        skippedCount++;
        resultRows.push({
          lineNumber,
          status: 'skipped',
          message:
            previewRow.errors.join('; ') ||
            (previewRow.status === 'invalid'
              ? 'Fila inválida'
              : 'Duplicado omitido'),
        });
        continue;
      }

      const { row, errors } = validatePartnerClientImportRow(lineNumber, raw);
      if (errors.length > 0 || !row) {
        failedCount++;
        resultRows.push({
          lineNumber,
          status: 'failed',
          message: errors.join('; '),
        });
        continue;
      }

      const key = duplicateImportKey(row.clientEmail, row.aperturaLlcName);
      if (seenInFile.has(key)) {
        skippedCount++;
        resultRows.push({
          lineNumber,
          status: 'skipped',
          message: 'Duplicado en el mismo archivo',
        });
        continue;
      }
      seenInFile.add(key);

      try {
        const imported = await this.importRow(row, partnerId, options);
        importedCount++;

        let message = 'Importado correctamente';
        let zohoAccountId: string | undefined;
        let workDriveId: string | undefined;
        let documentsUploaded: number | undefined;
        let documentsFailed: number | undefined;

        try {
          const zoho = await this.zohoSyncService.syncImportedRequestToCrm(
            imported.requestId,
          );
          zohoAccountId = zoho.accountId;
          workDriveId = zoho.workDriveId;
          message = 'Importado y sincronizado con CRM/WorkDrive';

          if (documentsZipIndex && workDriveId) {
            const llcKey = normalizeLlcFolderKey(row.aperturaLlcName);
            const docFiles = documentsZipIndex.foldersByLlcKey.get(llcKey);
            if (docFiles?.length) {
              try {
                const uploadResult =
                  await this.zohoWorkDriveService.uploadDocumentTree(
                    workDriveId,
                    docFiles,
                  );
                documentsUploaded = uploadResult.uploaded;
                documentsFailed = uploadResult.failed;
                if (uploadResult.uploaded > 0) {
                  message += `; ${uploadResult.uploaded} documento(s) en WorkDrive`;
                }
                if (uploadResult.failed > 0) {
                  message += `; ${uploadResult.failed} documento(s) no subidos`;
                }
              } catch (uploadError: any) {
                const uploadMsg =
                  uploadError?.message || 'Error al subir documentos';
                message += `; documentos pendientes: ${uploadMsg}`;
                console.error(
                  `Import fila ${lineNumber}: BD/CRM ok, falló upload docs:`,
                  uploadError,
                );
              }
            }
          }
        } catch (zohoError: any) {
          const zohoMsg =
            (typeof zohoError?.getResponse === 'function'
              ? zohoError.getResponse()
              : null) ||
            zohoError?.response?.message ||
            zohoError?.message ||
            'Error desconocido en CRM';
          const zohoText =
            typeof zohoMsg === 'string' ? zohoMsg : JSON.stringify(zohoMsg);
          message = `Importado en panel; CRM/WorkDrive pendiente: ${zohoText}`;
          console.error(
            `Import fila ${lineNumber}: BD ok, falló sync CRM:`,
            zohoError,
          );
        }

        resultRows.push({
          lineNumber,
          status: 'imported',
          message,
          clientId: imported.clientId,
          requestId: imported.requestId,
          zohoAccountId,
          workDriveId,
          documentsUploaded,
          documentsFailed,
        });
      } catch (error) {
        failedCount++;
        const message =
          error instanceof BadRequestException ||
          error instanceof NotFoundException
            ? error.message
            : 'Error al importar la fila';
        resultRows.push({
          lineNumber,
          status: 'failed',
          message,
        });
      }
    }

    return {
      totalRows: resultRows.length,
      importedCount,
      skippedCount,
      failedCount,
      headerErrors: [],
      rows: resultRows,
    };
  }

  private async loadExistingDuplicateKeys(partnerId: number): Promise<Set<string>> {
    const rows = await this.requestRepository
      .createQueryBuilder('r')
      .innerJoin('r.client', 'c')
      .innerJoin('r.aperturaLlcRequest', 'a')
      .select('c.email', 'email')
      .addSelect('a.llcName', 'llcName')
      .where('c.partner_id = :partnerId', { partnerId })
      .andWhere('r.type = :type', { type: 'apertura-llc' })
      .getRawMany<{ email: string; llcName: string }>();

    const keys = new Set<string>();
    for (const row of rows) {
      if (row.email && row.llcName) {
        keys.add(duplicateImportKey(row.email, row.llcName));
      }
    }
    return keys;
  }

  private async loadPartnerLlcTargets(
    partnerId: number,
  ): Promise<PartnerLlcWorkDriveTarget[]> {
    const rows = await this.requestRepository
      .createQueryBuilder('r')
      .innerJoin('r.client', 'c')
      .innerJoin('r.aperturaLlcRequest', 'a')
      .select('r.id', 'requestId')
      .addSelect('c.id', 'clientId')
      .addSelect('a.llcName', 'llcName')
      .addSelect('r.workDriveId', 'workDriveId')
      .addSelect('c.email', 'clientEmail')
      .where('c.partner_id = :partnerId', { partnerId })
      .andWhere('r.type = :type', { type: 'apertura-llc' })
      .getRawMany<{
        requestId: number;
        clientId: number;
        llcName: string;
        workDriveId: string | null;
        clientEmail: string;
      }>();

    return rows.map((row) => ({
      requestId: Number(row.requestId),
      clientId: Number(row.clientId),
      llcName: row.llcName,
      workDriveId: row.workDriveId,
      clientEmail: row.clientEmail,
    }));
  }

  private async importRow(
    row: PartnerClientImportRow,
    partnerId: number,
    options?: { tenantHost?: string },
  ): Promise<{ clientId: number; requestId: number }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let client = await queryRunner.manager
        .createQueryBuilder(Client, 'c')
        .where('c.partner_id = :partnerId', { partnerId })
        .andWhere('LOWER(TRIM(c.email)) = :email', { email: row.clientEmail })
        .getOne();

      if (!client) {
        client = queryRunner.manager.create(Client, {
          full_name: row.clientFullName,
          email: row.clientEmail,
          phone: row.clientPhone,
          company: row.clientCompany || row.aperturaLlcName,
          notes: row.clientNotes,
          partnerId,
          status: true,
        });
        client = await queryRunner.manager.save(Client, client);
      }

      const duplicateRequest = await queryRunner.manager
        .createQueryBuilder(Request, 'r')
        .innerJoin('r.aperturaLlcRequest', 'a')
        .where('r.client_id = :clientId', { clientId: client.id })
        .andWhere('r.type = :type', { type: 'apertura-llc' })
        .andWhere('LOWER(TRIM(a.llc_name)) = :llcName', {
          llcName: row.aperturaLlcName.trim().toLowerCase(),
        })
        .getOne();

      if (duplicateRequest) {
        throw new BadRequestException(
          'Ya existe una solicitud de apertura para este cliente y LLC',
        );
      }

      const request = queryRunner.manager.create(Request, {
        type: 'apertura-llc',
        status: row.requestStatus,
        currentStep: 3,
        clientId: client.id,
        partnerId,
        notes: row.requestNotes,
        plan: row.requestPlan,
        createdFrom: 'import' as Request['createdFrom'],
        company: row.clientCompany || row.aperturaLlcName,
      });
      const savedRequest = await queryRunner.manager.save(Request, request);

      const apertura = queryRunner.manager.create(AperturaLlcRequest, {
        requestId: savedRequest.id,
        currentStepNumber: 6,
        llcName: row.aperturaLlcName,
        incorporationState: row.aperturaIncorporationState,
        llcType: row.aperturaLlcType,
        ein: row.aperturaEin,
        llcAddress: row.aperturaLlcAddress,
        businessDescription: row.aperturaBusinessDescription,
        llcNameOption2: row.aperturaLlcNameOption2,
        llcNameOption3: row.aperturaLlcNameOption3,
        linkedin: row.aperturaLinkedin,
      });
      await queryRunner.manager.save(AperturaLlcRequest, apertura);

      await queryRunner.commitTransaction();

      if (row.clientInviteToPortal) {
        try {
          await this.clientsService.inviteClientToPortal(client.id, {
            partnerScopeId: partnerId,
            tenantHost: options?.tenantHost,
          });
        } catch (inviteError) {
          console.error(
            `Import fila ${row.lineNumber}: cliente/request creados pero falló invitación:`,
            inviteError,
          );
        }
      }

      return { clientId: client.id, requestId: savedRequest.id };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  assertCsvFile(file?: Express.Multer.File): string {
    if (!file?.buffer) {
      throw new BadRequestException('Archivo CSV requerido (campo file)');
    }
    const name = (file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (
      !name.endsWith('.csv') &&
      mime !== 'text/csv' &&
      mime !== 'application/vnd.ms-excel' &&
      mime !== 'text/plain'
    ) {
      throw new BadRequestException('El archivo debe ser CSV');
    }
    const content = file.buffer.toString('utf8');
    if (!content.trim()) {
      throw new BadRequestException('El archivo CSV está vacío');
    }
    return content;
  }

  assertZipFile(file?: Express.Multer.File): Buffer {
    if (!file?.buffer) {
      throw new BadRequestException(
        'Archivo ZIP requerido (campo documentsZip)',
      );
    }
    const name = (file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (
      !name.endsWith('.zip') &&
      mime !== 'application/zip' &&
      mime !== 'application/x-zip-compressed'
    ) {
      throw new BadRequestException('El archivo de documentos debe ser ZIP');
    }
    if (file.buffer.length === 0) {
      throw new BadRequestException('El archivo ZIP está vacío');
    }
    return file.buffer;
  }

  parseOptionalDocumentsZip(file?: Express.Multer.File): Buffer | undefined {
    if (!file?.buffer?.length) {
      return undefined;
    }
    return this.assertZipFile(file);
  }
}
