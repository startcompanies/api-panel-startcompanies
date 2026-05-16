# Anthropic / OpenAI e IA en contabilidad — arquitectura

## Principios de seguridad

- **Nunca** exponer la API key del usuario en el navegador hacia Anthropic/OpenAI (no BYOK en cliente tipo `anthropic-dangerous-direct-browser-access`).
- Las claves son **por usuario**: se guardan en `user_ai_credentials` **cifradas** (AES-256-GCM) con una clave maestra de aplicación `USER_SECRETS_ENCRYPTION_KEY` (32 bytes, base64). Sin esa variable, **no** se pueden guardar credenciales (`PUT /panel/settings/ai-credentials` fallará con mensaje claro).
- El **GET** de credenciales solo devuelve `provider`, `hasKey` y `keyLast4`, nunca la clave completa.

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/panel/settings/ai-credentials` | Estado (sin secretos) |
| PUT | `/panel/settings/ai-credentials` | `{ provider, apiKey }` — upsert cifrado |
| DELETE | `/panel/settings/ai-credentials` | Borrar credencial |
| POST | `/panel/accounting/suggest-category` | `{ description }` — IA si hay clave y modelo responde; si no, **reglas** |
| POST | `/panel/accounting/transactions/bulk-apply-suggestions` | `{ useAi?: boolean }` — primero reglas; si `useAi !== false` y hay clave, segunda pasada IA con tope `AI_BULK_MAX_PER_REQUEST` (default 20) |

## Variables de entorno (servidor)

- `USER_SECRETS_ENCRYPTION_KEY` — obligatoria para guardar claves de usuario (generar: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
- `ANTHROPIC_MODEL` — opcional (default `claude-3-5-haiku-20241022`).
- `OPENAI_MODEL` — opcional (default `gpt-4o-mini`).
- `AI_BULK_MAX_PER_REQUEST` — opcional (default `20`).

## Compliance y coste

- Las **descripciones** de movimientos se envían al proveedor elegido por el usuario; debe informarse en UI (portal → Ajustes → IA contabilidad).
- Coste variable según uso; el lote IA está **acotado** por petición; el usuario puede revocar la clave en la consola del proveedor.

## Historial

- Fase anterior: solo reglas en servidor, sin Anthropic/OpenAI.
- Fase actual: **BYOK por usuario** en backend + fallback a reglas.
