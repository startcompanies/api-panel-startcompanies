import { Module } from '@nestjs/common';
import { UploadFileController } from './upload-file.controller';
import { UploadFileService } from './upload-file.service';
import { HandleExceptionsService } from 'src/shared/common/common.service';

@Module({
  controllers: [UploadFileController],
  providers: [UploadFileService, HandleExceptionsService]
})
export class UploadFileModule {}
