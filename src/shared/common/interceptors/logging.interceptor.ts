import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { FileLoggerService } from '../services/file-logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly fileLogger: FileLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, body, query, params, headers, ip } = request;
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Omitir logs de healthcheck y rutas estáticas
    if (
      url.includes('/api/explorer') ||
      url === '/api' ||
      url.includes('/favicon.ico') ||
      url.includes('/panel/admin/logs')
    ) {
      return next.handle();
    }

    // Obtener información del usuario si está autenticado
    const user = (request as any).user;
    const userId = user?.id || user?.userId || 'anonymous';
    const userEmail = user?.email || 'N/A';
    const userRole = user?.type || user?.role || 'N/A';

    // Preparar datos de la petición (sin contraseñas)
    const requestData = this.sanitizeRequest(body);

    const reqLines = [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📥 [${timestamp}] ${method} ${url}`,
      `   IP: ${ip} | User: ${userId} (${userEmail}) | Role: ${userRole}`,
    ];
    if (Object.keys(query).length > 0) {
      reqLines.push(`   Query: ${JSON.stringify(query)}`);
    }
    if (Object.keys(params).length > 0) {
      reqLines.push(`   Params: ${JSON.stringify(params)}`);
    }
    if (body && this.hasBody(body)) {
      reqLines.push(`   Body: ${this.formatBody(requestData)}`);
    }
    this.writeLog('LOG', reqLines.join('\n'));

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          const responseTimestamp = new Date().toISOString();

          // Preparar datos de la respuesta
          const responseData = this.formatResponse(data);
          const statusEmoji = statusCode >= 200 && statusCode < 300 ? '✅' : '⚠️';

          const resLines = [
            `📤 [${responseTimestamp}] ${method} ${url}`,
            `   ${statusEmoji} Status: ${statusCode} | Duration: ${duration}ms`,
          ];
          if (responseData) {
            resLines.push(`   Response: ${responseData}`);
          }
          resLines.push(
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          );
          this.writeLog('LOG', resLines.join('\n'));
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;
          const errorTimestamp = new Date().toISOString();

          const errLines = [
            `❌ [${errorTimestamp}] ${method} ${url}`,
            `   Status: ${statusCode} | Duration: ${duration}ms`,
            `   Error: ${error.message || error}`,
          ];
          if (error.stack) {
            errLines.push(`   Stack: ${error.stack.substring(0, 500)}...`);
          }
          errLines.push(
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          );
          this.writeLog('ERROR', errLines.join('\n'));
        },
      }),
    );
  }

  private writeLog(level: string, message: string): void {
    this.fileLogger.append(level, message);
    if (level === 'ERROR') {
      this.logger.error(message);
    } else {
      this.logger.log(message);
    }
  }

  private sanitizeRequest(body: any): any {
    if (Buffer.isBuffer(body)) {
      return {
        _type: 'Buffer',
        size: body.length,
        preview: body.subarray(0, Math.min(body.length, 80)).toString('utf8'),
      };
    }
    if (!body || typeof body !== 'object') return body;

    const sanitized = { ...body };
    const sensitiveFields = [
      'password',
      'oldPassword',
      'newPassword',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
    ];

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    });

    return sanitized;
  }

  private hasBody(body: any): boolean {
    if (!body) return false;
    if (Buffer.isBuffer(body)) return body.length > 0;
    if (typeof body === 'string') return body.trim().length > 0;
    if (typeof body === 'object') return Object.keys(body).length > 0;
    return true;
  }

  private formatBody(body: any): string {
    if (!body || Object.keys(body).length === 0) return '{}';
    
    try {
      const bodyStr = JSON.stringify(body, null, 2);
      // Limitar el tamaño del body mostrado (500 caracteres)
      if (bodyStr.length > 500) {
        return `${bodyStr.substring(0, 500)}... (truncated)`;
      }
      return bodyStr;
    } catch (e) {
      return '[Unable to stringify body]';
    }
  }

  private formatResponse(data: any): string {
    if (!data) return '';

    try {
      let dataStr: string;
      
      if (typeof data === 'string') {
        dataStr = data;
      } else if (Array.isArray(data)) {
        // Para arrays, mostrar cantidad y primeros elementos
        dataStr = `Array[${data.length}]${data.length > 0 ? `: ${JSON.stringify(data.slice(0, 2))}${data.length > 2 ? '...' : ''}` : ''}`;
      } else if (typeof data === 'object') {
        dataStr = JSON.stringify(data, null, 2);
      } else {
        dataStr = String(data);
      }
      
      // Limitar el tamaño de la respuesta mostrada (800 caracteres)
      if (dataStr.length > 800) {
        return `${dataStr.substring(0, 800)}... (truncated)`;
      }
      
      return dataStr;
    } catch (e) {
      return '[Unable to stringify response]';
    }
  }
}

