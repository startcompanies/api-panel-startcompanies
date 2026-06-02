# Variables de entorno — Gemini (contabilidad)

Las claves de IA **no** se guardan en base de datos. El servidor elige la clave según el tipo de cliente:

| Variable | Uso |
|----------|-----|
| `GEMINI_API_KEY_PLATFORM` | Clientes del portal Start Companies (sin `partnerId`) |
| `GEMINI_API_KEY_TENANT` | Clientes de partners con portal en dominio del tenant |
| `GEMINI_MODEL` | Opcional (default `gemini-2.0-flash`) |
| `AI_BULK_MAX_PER_REQUEST` | Opcional (default `20`) |

## Endpoint de estado

`GET /panel/settings/ai-credentials` devuelve `{ provider: 'gemini', configured: boolean, scope: 'platform' | 'tenant' }` sin secretos.

## Plan

La feature `accountingAi` del plan del cliente debe estar activa; si no, la IA no se usa aunque existan las variables `.env`.
