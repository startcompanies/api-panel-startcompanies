import {
  sanitizeSensitiveResponseData,
  toPublicUserResponse,
} from './user-response.serializer';

describe('user-response.serializer', () => {
  it('remueve campos sensibles en objetos anidados y arrays', () => {
    const payload = {
      user: {
        id: 10,
        username: 'demo',
        password: 'hash',
        emailVerificationToken: '123456',
      },
      zoho: {
        client_id: 'abc',
        client_secret: 'super-secret',
        refresh_token: 'refresh-secret',
      },
      rows: [
        { id: 1, password: 'x' },
        { id: 2, value: 'ok' },
      ],
    };

    const sanitized = sanitizeSensitiveResponseData(payload) as {
      user: Record<string, unknown>;
      zoho: Record<string, unknown>;
      rows: Array<Record<string, unknown>>;
    };
    const sanitizedUser = sanitized.user as Record<string, unknown>;
    const sanitizedZoho = sanitized.zoho as Record<string, unknown>;
    const sanitizedRows = sanitized.rows as Array<Record<string, unknown>>;

    expect(sanitizedUser.password).toBeUndefined();
    expect(sanitizedUser.emailVerificationToken).toBeUndefined();
    expect(sanitizedZoho.client_id).toBeUndefined();
    expect(sanitizedZoho.client_secret).toBeUndefined();
    expect(sanitizedZoho.refresh_token).toBeUndefined();
    expect(sanitizedRows[0].password).toBeUndefined();
    expect(sanitizedRows[1].value).toBe('ok');
  });

  it('mapea usuario público con campos básicos', () => {
    const mapped = toPublicUserResponse({
      id: 15,
      username: 'abisurDiaz',
      first_name: null,
      last_name: null,
      email: 'private@example.com',
      password: 'hash',
    });

    expect(mapped).toEqual({
      id: 15,
      username: 'abisurDiaz',
      first_name: null,
      last_name: null,
    });
  });
});
