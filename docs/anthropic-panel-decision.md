# Gemini e IA en contabilidad — arquitectura

## Principios de seguridad

- **Nunca** exponer la API key en el navegador hacia el proveedor de IA.
- Las claves viven **solo en variables de entorno** del servidor (`GEMINI_API_KEY_PLATFORM` / `GEMINI_API_KEY_TENANT`), no en BD.
- El **GET** de estado solo devuelve `provider`, `configured` y `scope`; nunca la clave.

## Alcance de clave

- **platform**: clientes directos de Start Companies.
- **tenant**: clientes asociados a un partner (`clients.partnerId`).

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/panel/settings/ai-credentials` | Estado Gemini (sin secretos) |
| POST | `/panel/accounting/suggest-category` | IA si hay clave `.env` y plan con `accountingAi`; si no, **reglas** |
| POST | `/panel/accounting/transactions/bulk-apply-suggestions` | `{ useAi?: boolean }` — reglas primero; IA con tope `AI_BULK_MAX_PER_REQUEST` |

## Variables de entorno (servidor)

Ver `docs/env-accounting-ai.md`.

## Compliance y coste

- Las descripciones de movimientos se envían a Google Gemini cuando la IA está activa.
- Coste según uso del servidor; el lote IA está acotado por petición.

## Historial

- Fase anterior: BYOK por usuario (Anthropic/OpenAI cifrado en `user_ai_credentials`).
- Fase actual: **Gemini centralizado** por entorno (plataforma vs tenant).
