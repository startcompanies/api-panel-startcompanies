# Variables de entorno — credenciales IA por usuario (contabilidad)

## Obligatoria para guardar API keys de usuarios

```bash
# 32 bytes en base64 (AES-256). Generar una vez por entorno:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
USER_SECRETS_ENCRYPTION_KEY=<pegar_salida>
```

Si falta o no decodifica a exactamente 32 bytes, `PUT /panel/settings/ai-credentials` responderá error y no persistirá la clave.

## Opcionales (modelos y tope de lote)

```bash
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
OPENAI_MODEL=gpt-4o-mini
AI_BULK_MAX_PER_REQUEST=20
```

## Rotación de `USER_SECRETS_ENCRYPTION_KEY`

Cambiar la clave maestra invalida todas las credenciales cifradas existentes hasta que cada usuario vuelva a guardar su API key (operación manual o script de re-cifrado no incluido en v1).
