import { of, lastValueFrom } from 'rxjs';
import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { ResponseSanitizerInterceptor } from './response-sanitizer.interceptor';

describe('ResponseSanitizerInterceptor', () => {
  it('sanitiza campos sensibles de la respuesta', async () => {
    const interceptor = new ResponseSanitizerInterceptor();

    const context = {} as ExecutionContext;
    const next: CallHandler = {
      handle: () =>
        of({
          post: {
            title: 'Hello',
            user: {
              id: 1,
              password: 'hash',
              emailVerificationToken: 'token',
            },
          },
        }),
    };

    const result = (await lastValueFrom(
      interceptor.intercept(context, next),
    )) as {
      post: { title: string; user: Record<string, unknown> };
    };

    expect(result.post.user.password).toBeUndefined();
    expect(result.post.user.emailVerificationToken).toBeUndefined();
    expect(result.post.title).toBe('Hello');
  });

  it('no altera StreamableFile (PDF, etc.)', async () => {
    const interceptor = new ResponseSanitizerInterceptor();
    const context = {} as ExecutionContext;
    const pdf = new StreamableFile(Buffer.from('%PDF-1.4 test'), {
      type: 'application/pdf',
    });
    const next: CallHandler = { handle: () => of(pdf) };

    const out = await lastValueFrom(interceptor.intercept(context, next));
    expect(out).toBe(pdf);
    expect(out).toBeInstanceOf(StreamableFile);
  });
});
