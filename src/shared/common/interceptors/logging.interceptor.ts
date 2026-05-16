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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, body, query, params, headers, ip } = request;
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Omitir logs de healthcheck y rutas estáticas
    if (url.includes('/api/explorer') || url === '/api' || url.includes('/favicon.ico')) {
      return next.handle();
    }

    // Obtener información del usuario si está autenticado
    const user = (request as any).user;
    const userId = user?.id || user?.userId || 'anonymous';
    const userEmail = user?.email || 'N/A';
    const userRole = user?.type || user?.role || 'N/A';

    // Preparar datos de la petición (sin contraseñas)
    const requestData = this.sanitizeRequest(body);

    // Log de Request
    this.logger.log(
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    );
    this.logger.log(`📥 [${timestamp}] ${method} ${url}`);
    this.logger.log(`   IP: ${ip} | User: ${userId} (${userEmail}) | Role: ${userRole}`);
    
    if (Object.keys(query).length > 0) {
      this.logger.log(`   Query: ${JSON.stringify(query)}`);
    }
    
    if (Object.keys(params).length > 0) {
      this.logger.log(`   Params: ${JSON.stringify(params)}`);
    }
    
    if (body && this.hasBody(body)) {
      const bodyStr = this.formatBody(requestData);
      this.logger.log(`   Body: ${bodyStr}`);
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          const responseTimestamp = new Date().toISOString();

          // Preparar datos de la respuesta
          const responseData = this.formatResponse(data);
          const statusEmoji = statusCode >= 200 && statusCode < 300 ? '✅' : '⚠️';

          // Log de Response
          this.logger.log(`📤 [${responseTimestamp}] ${method} ${url}`);
          this.logger.log(`   ${statusEmoji} Status: ${statusCode} | Duration: ${duration}ms`);
          
          if (responseData) {
            this.logger.log(`   Response: ${responseData}`);
          }
          
          this.logger.log(
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;
          const errorTimestamp = new Date().toISOString();

          // Log de Error
          this.logger.error(`❌ [${errorTimestamp}] ${method} ${url}`);
          this.logger.error(`   Status: ${statusCode} | Duration: ${duration}ms`);
          this.logger.error(`   Error: ${error.message || error}`);
          
          if (error.stack) {
            this.logger.error(`   Stack: ${error.stack.substring(0, 500)}...`);
          }
          
          this.logger.error(
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          );
        },
      }),
    );
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

