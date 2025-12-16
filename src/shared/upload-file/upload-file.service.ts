import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { awsConfigService } from '../../config/aws.config.service';
import { HandleExceptionsService } from 'src/shared/common/common.service';

@Injectable()
export class UploadFileService {
  private readonly s3Client: S3Client;
  private readonly logger = new Logger(UploadFileService.name);
  private readonly bucketName: string;
  private readonly region: string;

  constructor(private readonly exceptionService: HandleExceptionsService) {
    this.s3Client = new S3Client({
      region: awsConfigService.getRegion(),
      credentials: {
        accessKeyId: awsConfigService.getAccessKeyId(),
        secretAccessKey: awsConfigService.getSecretAccessKey(),
      },
    });
    this.bucketName = awsConfigService.getBucketName();
    this.region = awsConfigService.getRegion();
  }

  async uploadFile(
    file: Express.Multer.File,
  ): Promise<{ url: string; key: string } | undefined> {
    const key = `${Date.now()}-${file.originalname}`;

    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    };

    try {
      const upload = new Upload({
        client: this.s3Client,
        params: params,
      });

      await upload.done();
      //const url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
      const url = `http://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
      this.logger.log(`Archivo subido exitosamente: ${url}`);
      return { url, key };
    } catch (error) {
      //this.logger.error('Error al subir el archivo a S3.', error);
      /*throw new Error('Error al subir el archivo a S3.');*/
      this.exceptionService.handleAwsS3Exception(error);
    }
  }
}
