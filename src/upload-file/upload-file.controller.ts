import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadFileService } from './upload-file.service';
import { HandleExceptionsService } from 'src/common/common.service';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadFileDto } from './dtos/upload-file.dto';

@ApiTags('Upload Files')
@Controller('upload-file')
export class UploadFileController {
  constructor(
    private readonly uploadFileService: UploadFileService,
    private readonly exceptionService: HandleExceptionsService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload a file',
    type: UploadFileDto,
  })
  @ApiOperation({
    summary: 'Subir un archivo',
  })
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      this.exceptionService.handleBadRequestFileException();
    } else {
      const result = await this.uploadFileService.uploadFile(file);
      return {
        url: result?.url,
        key: result?.key,
        message: 'Archivo subido exitosamente',
      };
    }
  }
}
