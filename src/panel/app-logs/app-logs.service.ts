import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { createReadStream } from 'fs';
import { FileLoggerService } from '../../shared/common/services/file-logger.service';

@Injectable()
export class AppLogsService {
  constructor(private readonly fileLogger: FileLoggerService) {}

  listDays() {
    const days = this.fileLogger.listDays();
    return {
      timezone: 'America/Argentina/Buenos_Aires',
      today: this.fileLogger.argentinaDateKey(),
      days,
    };
  }

  readDay(date: string, tail?: number, q?: string) {
    return this.fileLogger.readDay(date, { tail, q });
  }

  downloadDay(date: string): StreamableFile {
    if (!this.fileLogger.fileExists(date)) {
      throw new NotFoundException(`No hay log para ${date}`);
    }
    const filePath = this.fileLogger.resolveFilePath(date);
    return new StreamableFile(createReadStream(filePath), {
      type: 'text/plain; charset=utf-8',
      disposition: `attachment; filename="${date}.log"`,
    });
  }
}
