# Variables de entorno — Plaid (contabilidad)

Sincronización bancaria vía Plaid Link. Una sola app Plaid de Start Companies; cada cliente conecta su banco desde `/contabilidad`.

| Variable | Obligatoria | Descripción |
|----------|:-----------:|-------------|
| `PLAID_CLIENT_ID` | sí | Dashboard Plaid → Developers → Keys |
| `PLAID_SECRET` | sí | Secret de **Sandbox** o **Production** (según `PLAID_ENV`) |
| `PLAID_ENV` | sí | `sandbox` (dev) o `production` |
| `USER_SECRETS_ENCRYPTION_KEY` | sí | 32 bytes en base64 (`openssl rand -base64 32`) — cifra `access_token` |
| `PLAID_WEBHOOK_URL` | recomendada | `{API_PUBLIC_URL}/webhooks/plaid` |
| `PLAID_WEBHOOK_SKIP_VERIFY` | no | `true` solo en dev local sin túnel HTTPS |
| `PLAID_SYNC_CRON_ENABLED` | no | Default activo; `false` desactiva cron 03:00 |
| `PLAID_CONNECT_REMINDER_ENABLED` | no | `true` envía email semanal a clientes con contabilidad sin banco |
| `PLAID_LINK_CLIENT_NAME` | no | Override del nombre en Plaid Link |

## Endpoints

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/panel/plaid/status` | client |
| GET | `/panel/plaid/balance` | client |
| POST | `/panel/plaid/link-token` | client |
| POST | `/panel/plaid/exchange` | client |
| GET | `/panel/plaid/items` | client |
| POST | `/panel/plaid/items/:id/sync` | client |
| POST | `/panel/plaid/items/:id/disconnect` | client |
| POST | `/webhooks/plaid` | público (Plaid, JWT verificado) |

## Feature flag

`accountingPlaid` en `platform_features` / planes de pricing. Si falta en JSON legacy, equivale a `accounting: true`.

## Sandbox

Plaid Link: usuario `user_good`, contraseña `pass_good`.

Tras configurar variables, ejecutar migración:

```bash
npm run migration:run
```

Ver también: [plaid-bank-sync-contabilidad.md](./plaid-bank-sync-contabilidad.md)
