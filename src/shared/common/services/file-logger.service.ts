import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const AR_TZ = 'America/Argentina/Buenos_Aires';

@Injectable()
export class FileLoggerService {
  private readonly dir: string;

  constructor() {
    this.dir = process.env.LOG_DIR?.trim() || path.join(process.cwd(), 'logs');
  }

  /** Fecha calendario Argentina (YYYY-MM-DD) para nombre de archivo. */
  argentinaDateKey(d = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: AR_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  /** Marca de tiempo Argentina para cada línea. */
  argentinaDateTime(d = new Date()): string {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: AR_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  }

  private filePathForDate(dateKey: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new Error('Fecha inválida');
    }
    return path.join(this.dir, `${dateKey}.log`);
  }

  /** Ruta absoluta del archivo de un día (para descarga). */
  resolveFilePath(dateKey: string): string {
    return this.filePathForDate(dateKey);
  }

  fileExists(dateKey: string): boolean {
    return fs.existsSync(this.filePathForDate(dateKey));
  }

  append(level: string, message: string): void {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const file = path.join(this.dir, `${this.argentinaDateKey()}.log`);
      const safe = String(message).replace(/\r?\n/g, '\n');
      const block = `[${this.argentinaDateTime()}] [${level}] ${safe}\n`;
      fs.appendFileSync(file, block, 'utf8');
    } catch {
      /* no bloquear la app si falla el disco */
    }
  }

  listDays(): { date: string; sizeBytes: number; lineCount: number }[] {
    if (!fs.existsSync(this.dir)) return [];
    const files = fs.readdirSync(this.dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.log$/.test(f));
    const rows = files.map((f) => {
      const date = f.replace(/\.log$/, '');
      const full = path.join(this.dir, f);
      const stat = fs.statSync(full);
      const content = fs.readFileSync(full, 'utf8');
      const lineCount = content ? content.split('\n').filter((l) => l.trim()).length : 0;
      return { date, sizeBytes: stat.size, lineCount };
    });
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  readDay(
    dateKey: string,
    opts?: { tail?: number; q?: string },
  ): {
    date: string;
    timezone: string;
    lines: string[];
    totalLines: number;
    truncated: boolean;
  } {
    const file = this.filePathForDate(dateKey);
    if (!fs.existsSync(file)) {
      return {
        date: dateKey,
        timezone: AR_TZ,
        lines: [],
        totalLines: 0,
        truncated: false,
      };
    }
    const raw = fs.readFileSync(file, 'utf8');
    let lines = raw.split('\n').filter((l) => l.length > 0);
    const q = opts?.q?.trim().toLowerCase();
    if (q) {
      lines = lines.filter((l) => l.toLowerCase().includes(q));
    }
    const totalLines = lines.length;
    const tail = Math.min(Math.max(opts?.tail ?? 2000, 1), 10_000);
    let truncated = false;
    if (lines.length > tail) {
      lines = lines.slice(-tail);
      truncated = true;
    }
    return {
      date: dateKey,
      timezone: AR_TZ,
      lines,
      totalLines,
      truncated,
    };
  }
}
