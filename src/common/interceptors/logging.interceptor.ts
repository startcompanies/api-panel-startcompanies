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
    const { method, url, body, query, params } = request;
    const startTime = Date.now();

    // Omitir logs de healthcheck y rutas estáticas
    if (url.includes('/api/explorer') || url === '/api') {
      return next.handle();
    }

    // Preparar datos de la petición (sin contraseñas)
    const requestData = this.sanitizeRequest(body);

    this.logger.log(
      `→ ${method} ${url}${this.formatQuery(query)}${this.formatParams(params)}${this.formatBody(requestData)}`,
    );

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          // Preparar datos de la respuesta (limitado)
          const responseData = this.formatResponse(data);

          this.logger.log(
            `← ${method} ${url} ${statusCode} ${duration}ms${responseData}`,
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;

          this.logger.error(
            `✗ ${method} ${url} ${statusCode} ${duration}ms - ${error.message}`,
          );
        },
      }),
    );
  }

  private sanitizeRequest(body: any): any {
    if (!body || typeof body !== 'object') return body;

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'oldPassword', 'newPassword', 'token'];

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '***';
      }
    });

    return sanitized;
  }

  private formatQuery(query: any): string {
    if (!query || Object.keys(query).length === 0) return '';
    return ` ?${JSON.stringify(query)}`;
  }

  private formatParams(params: any): string {
    if (!params || Object.keys(params).length === 0) return '';
    return ` ${JSON.stringify(params)}`;
  }

  private formatBody(body: any): string {
    if (!body || Object.keys(body).length === 0) return '';
    
    // Limitar el tamaño del body mostrado
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 200) {
      return ` | Body: ${bodyStr.substring(0, 200)}...`;
    }
    return ` | Body: ${bodyStr}`;
  }

  private formatResponse(data: any): string {
    if (!data) return '';

    // Limitar el tamaño de la respuesta mostrada
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    
    if (dataStr.length > 150) {
      return ` | Response: ${dataStr.substring(0, 150)}...`;
    }
    return ` | Response: ${dataStr}`;
  }
}

