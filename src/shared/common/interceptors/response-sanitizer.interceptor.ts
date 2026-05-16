import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { sanitizeSensitiveResponseData } from '../../user/serializers/user-response.serializer';

@Injectable()
export class ResponseSanitizerInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        /* StreamableFile tiene buffer interno: el sanitizer lo convertía en JSON con claves "0","1",… */
        if (data instanceof StreamableFile) {
          return data;
        }
        return sanitizeSensitiveResponseData(data);
      }),
    );
  }
}
