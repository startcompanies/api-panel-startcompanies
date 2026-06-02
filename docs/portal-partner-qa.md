# QA — Portal partner

Checklist tras desplegar migraciones `1777600000000` y `1777700000000`.

## Variables de entorno

- `PLATFORM_HOSTS`: hosts extra del portal SC (coma-separados). Por defecto: `panel.startcompanies.io`, `panel-staging.startcompanies.io`, marketing (`startcompanies.io`, `staging.startcompanies.io`), `localhost` y el host de `FRONTEND_URL`.
- `FRONTEND_URL`: URL del portal SC para correos y fallback.
- Partners: `GEMINI_API_KEY_TENANT` / `GEMINI_API_KEY_PLATFORM` si aplica contabilidad IA.

## Aislamiento por dominio

- [ ] Cliente SC no inicia sesión en dominio de partner.
- [ ] Cliente del partner A no entra en dominio del partner B ni en SC.
- [ ] Partner con marca activa no entra en `startcompanies.io` (mensaje de portal de marca).
- [ ] Teammate del owner accede al dominio correcto del partner.
- [ ] Dominio sin `partner_tenants` muestra error en el portal (no fallback SC silencioso).

## Contacto y links

- [ ] Partner guarda WhatsApp en Ajustes → Marca y portal.
- [ ] WhatsApp flotante usa el número del partner en su dominio.
- [ ] Acciones rápidas del dashboard (agendar, llamada, ITIN, Good Standing) abren WA del partner.
- [ ] Chip «Sé partner» no aparece en portal partner.
- [ ] «Volver al sitio» usa `website_url` del partner (oculto si vacío).

## Contenido

- [ ] Video «Solo SC» no aparece en portal partner.
- [ ] Video «Partners» sí aparece en portal partner.
- [ ] Video «Ambos» en ambos contextos.
- [ ] Badge de visibilidad en `/panel/contenido`.

## Settings cliente

- [ ] Pestaña Suscripción oculta en portal partner.
- [ ] Branding (logo, colores, dominio) sigue operativo.

## Comandos

```bash
cd api-panel-startcompanies && npm run migration:run
```
