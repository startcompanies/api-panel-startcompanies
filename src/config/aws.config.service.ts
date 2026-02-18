import * as dotenv from 'dotenv';

dotenv.config();

class AwsConfigService {
  constructor(private env: { [k: string]: string | undefined }) {}

  private getValue(key: string, throwOnMissing = true): string {
    const value = this.env[key];
    if (!value && throwOnMissing) {
      throw new Error(`config error - missing env.${key}`);
    }
    return value as string;
  }

  public ensureValues(keys: string[]) {
    keys.forEach((k) => this.getValue(k, true));
    return this;
  }

  public getAccessKeyId(): string {
    return this.getValue('AWS_ACCESS_KEY_ID');
  }

  public getSecretAccessKey(): string {
    return this.getValue('AWS_SECRET_ACCESS_KEY');
  }

  public getRegion(): string {
    return this.getValue('AWS_REGION');
  }

  public getBucketName(): string {
    return this.getValue('AWS_S3_BUCKET_NAME');
  }

  public getMediaDomain(): string {
    // Si existe la variable de entorno, usarla; si no, usar el dominio por defecto
    return this.getValue('MEDIA_DOMAIN', false) || 'https://media.startcompanies.us';
  }
}

const awsConfigService = new AwsConfigService(process.env).ensureValues([
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'AWS_S3_BUCKET_NAME',
]);

export { awsConfigService };