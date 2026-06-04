import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rutas POST permitidas durante modo vista (salir de la sesión simulada). */
function isViewAsAllowedMutation(req: Request): boolean {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return path.endsWith('/panel/view-as/end') || path.endsWith('/auth/logout');
}

@Injectable()
export class ViewAsReadOnlyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req['user'] as { viewAs?: boolean } | undefined;

    if (!user?.viewAs) {
      return next.handle();
    }

    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return next.handle();
    }

    if (isViewAsAllowedMutation(req)) {
      return next.handle();
    }

    throw new ForbiddenException(
      'Modo vista: solo lectura. Sal del modo vista para realizar cambios.',
    );
  }
}
