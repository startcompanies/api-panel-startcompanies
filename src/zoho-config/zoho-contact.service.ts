import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZohoCrmService } from './zoho-crm.service';
import { Client } from '../panel/clients/entities/client.entity';

/** Valores del pick list Zoho `Tipo_de_Contacto` (ajustar si el CRM usa otros literales). */
const TIPO_CLIENTE = 'Cliente';
const TIPO_PARTNER = 'Partner';

@Injectable()
export class ZohoContactService {
  private readonly logger = new Logger(ZohoContactService.name);

  constructor(
    private readonly zohoCrmService: ZohoCrmService,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  /**
   * Busca Contact en Zoho por email o lo crea.
   * `Tipo_de_Contacto`: Cliente (sin partner) / Partner (cliente de partner).
   * Alta siempre con `fromPortal: true`. Errores: log, no relanza.
   */
  async findOrCreateContact(client: Client, org: string = 'startcompanies'): Promise<void> {
    try {
      const email = (client.email || '').trim();
      if (!email) {
        this.logger.warn(`findOrCreateContact: sin email para client ${client.id}`);
        return;
      }

      const safeEmail = email.replace(/'/g, "\\'");
      const criteria = `(Email:equals:'${safeEmail}')`;
      const searchResult = await this.zohoCrmService.searchRecords(
        'Contacts',
        { criteria },
        org,
      );

      const rows = Array.isArray(searchResult?.data) ? searchResult.data : [];
      if (rows.length > 0) {
        const id = rows[0]?.id ?? rows[0]?.Id;
        if (id) {
          await this.clientRepository.update(
            { id: client.id },
            { zohoContactId: String(id) },
          );
          this.logger.log(`Zoho Contact existente vinculado a client ${client.id}: ${id}`);
          void this.patchFromPortalOnExistingContact(String(id), org);
        }
        return;
      }

      const tipoContacto = this.resolveTipoContacto(client);
      const { firstName, lastName } = this.splitFullName(client.full_name);
      const payload = {
        First_Name: firstName,
        Last_Name: lastName,
        Email: email,
        Mobile: client.phone || '',
        Tipo_de_Contacto: tipoContacto,
        fromPortal: true,
      };

      const createResult = await this.zohoCrmService.createRecords('Contacts', [payload], org);
      const newId =
        createResult?.data?.[0]?.details?.id ?? createResult?.data?.[0]?.id;
      if (newId) {
        await this.clientRepository.update(
          { id: client.id },
          { zohoContactId: String(newId) },
        );
        this.logger.log(`Zoho Contact creado para client ${client.id}: ${newId}`);
      }
    } catch (err: any) {
      this.logger.error(
        `findOrCreateContact falló para client ${client.id}: ${err?.message ?? err}`,
      );
    }
  }

  private resolveTipoContacto(client: Client): string {
    return client.partnerId != null ? TIPO_PARTNER : TIPO_CLIENTE;
  }

  /** Si el Contact ya existía por email, alinear flag en Zoho (no bloqueante). */
  private async patchFromPortalOnExistingContact(
    zohoContactId: string,
    org: string,
  ): Promise<void> {
    try {
      await this.zohoCrmService.updateRecords(
        'Contacts',
        [{ id: zohoContactId, fromPortal: true }],
        org,
      );
    } catch (e: any) {
      this.logger.debug(
        `fromPortal en Contact existente ${zohoContactId}: ${e?.message ?? e}`,
      );
    }
  }

  private splitFullName(fullName: string | undefined): { firstName: string; lastName: string } {
    const t = (fullName || '').trim();
    if (!t) {
      return { firstName: '-', lastName: '-' };
    }
    const parts = t.split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '-' };
    }
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }
}
