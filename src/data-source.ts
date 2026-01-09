import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { User } from './shared/user/entities/user.entity';
import { Post } from './blog/posts/entities/post.entity';
import { Category } from './blog/categories/entities/category.entity';
import { Tag } from './blog/tags/entities/tag.entity';
import { ReusableElement } from './blog/reusable-elements/entities/reusable-element.entity';

// Cargar variables de entorno
dotenv.config();

// Importar entidades nuevas del Panel
import { Request } from './panel/requests/entities/request.entity';
import { AperturaLlcRequest } from './panel/requests/entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from './panel/requests/entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from './panel/requests/entities/cuenta-bancaria-request.entity';
import { Member } from './panel/requests/entities/member.entity';
// BankAccountValidator y BankAccountOwner ya no se usan - consolidados en Member y CuentaBancariaRequest
// RequestRequiredDocument ya no se usa - eliminado
// ProcessStep ya no se usa - eliminado
// Document ya no se usa - URLs se guardan directamente en campos de request
import { Notification } from './panel/notifications/entities/notification.entity';
import { UserPreferences } from './panel/settings/entities/user-preferences.entity';
import { ProcessConfig } from './panel/settings/entities/process-config.entity';
import { Client } from './panel/clients/entities/client.entity';
import { ZohoConfig } from './zoho-config/zoho-config.entity';

// Validar que existan las variables de entorno requeridas
const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  console.warn(
    `⚠️  Advertencia: Faltan variables de entorno: ${missingVars.join(', ')}. Usando valores por defecto.`,
  );
}

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'startcompanies',
  entities: [
    // Entidades existentes (Blog)
    User,
    Post,
    Category,
    Tag,
    ReusableElement,
    // Nuevas entidades del Panel
    Request,
    AperturaLlcRequest,
    RenovacionLlcRequest,
    CuentaBancariaRequest,
    Member,
    // BankAccountValidator y BankAccountOwner ya no se usan - consolidados en Member y CuentaBancariaRequest
    // RequestRequiredDocument, Document, ProcessStep, UserPreferences y ProcessConfig eliminados - no se usan
    Notification,
    Client,
    ZohoConfig,
  ],
  migrations: [
    // Ruta relativa desde el directorio raíz del proyecto
    'migrations/*.ts',
    'migrations/*.js',
  ],
  migrationsTableName: 'migrations',
  synchronize: false, // NUNCA usar synchronize en producción
  logging: process.env.NODE_ENV === 'development' || process.env.MODE === 'DEV',
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
