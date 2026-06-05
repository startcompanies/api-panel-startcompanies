# Importación CSV — clientes partner

Plantilla: [`partner-clients-import-sample.csv`](./partner-clients-import-sample.csv)

Cada fila del CSV crea tres registros vinculados:

1. **`clients`** — cliente del partner (`partner_id` = tenant autenticado)
2. **`requests`** — solicitud de apertura LLC asociada al cliente
3. **`apertura_llc_requests`** — datos de la LLC constituida (1:1 con el request)

No incluye **`members`**.

---

## Formato del archivo

- Codificación: **UTF-8**
- Separador: **coma** (`,`)
- Primera fila: **encabezados** (nombres exactos de la plantilla)
- Celda vacía = campo omitido / `null` en BD
- Valores con comas: entre **comillas dobles** (ej. dirección completa)
- No incluir `partner_id`: se toma del usuario autenticado

---

## Columnas de la plantilla

| # | Columna CSV | Obligatoria | Tabla | Columna BD |
|---|-------------|:-----------:|-------|------------|
| 1 | `client_full_name` | sí | `clients` | `full_name` |
| 2 | `client_email` | sí | `clients` | `email` |
| 3 | `apertura_llc_name` | sí | `apertura_llc_requests` | `llc_name` |
| 4 | `apertura_incorporation_state` | sí | `apertura_llc_requests` | `incorporation_state` |
| 5 | `apertura_llc_type` | sí | `apertura_llc_requests` | `llc_type` |
| 6 | `client_phone` | | `clients` | `phone` |
| 7 | `client_company` | | `clients` | `company` |
| 8 | `client_notes` | | `clients` | `notes` |
| 9 | `client_invite_to_portal` | | — | `yes` / `no` → invitación al portal |
| 10 | `request_notes` | | `requests` | `notes` |
| 11 | `request_status` | | `requests` | `status` |
| 12 | `request_plan` | | `requests` | `plan` |
| 13 | `apertura_ein` | | `apertura_llc_requests` | `ein` |
| 14 | `apertura_llc_address` | | `apertura_llc_requests` | `llc_address` |
| 15 | `apertura_business_description` | | `apertura_llc_requests` | `business_description` |

---

## Columnas opcionales adicionales (no van en la plantilla)

Puedes **añadirlas al CSV** si tienes esos datos; si no existen en el archivo, la importación funciona igual.

| Columna CSV | Tabla | Columna BD |
|-------------|-------|------------|
| `apertura_llc_name_option_2` | `apertura_llc_requests` | `llc_name_option_2` |
| `apertura_llc_name_option_3` | `apertura_llc_requests` | `llc_name_option_3` |
| `apertura_linkedin` | `apertura_llc_requests` | `linkedin` |

No son obligatorias para importar clientes históricos. Nullable en BD.

---

## Valores permitidos

| Columna | Valores |
|---------|---------|
| `apertura_llc_type` | `single` · `multi` |
| `request_status` | `solicitud-recibida` · `pendiente` · `en-proceso` · `completada` · `rechazada` (default import: `completada`) |
| `client_invite_to_portal` | `yes` · `no` (default: `no`) |
| `apertura_ein` | Texto libre, ej. `12-3456789` |
| `apertura_llc_address` | Texto libre con la dirección completa de la LLC |

---

## Defaults automáticos (no van en el CSV)

| Columna BD | Valor en import |
|------------|-----------------|
| `clients.partner_id` | partner del tenant logueado |
| `clients.status` | `true` |
| `clients.company` | `apertura_llc_name` si la columna viene vacía |
| `requests.type` | `apertura-llc` |
| `requests.partner_id` | partner del tenant logueado |
| `requests.client_id` | cliente creado en la misma fila |
| `requests.status` | `completada` si `request_status` vacío |
| `requests.current_step` | `3` |
| `requests.current_step_number` | `6` |
| `requests.created_from` | `import` |
| `apertura_llc_requests.current_step_number` | `6` |

---

## Sincronización CRM / WorkDrive (automática al importar)

Tras crear cada fila válida en el panel, el backend:

1. **Crea/actualiza el Account** en Zoho CRM (`syncRequestToZoho`) con datos de apertura LLC, incluyendo:
   - `N_mero_de_EIN` ← `apertura_ein` / `ein`
   - `Domicilio_Principal` ← `apertura_llc_address` / `llc_address`
2. **Aprovisiona WorkDrive vía API** (misma lógica que la función Deluge `createFolderWorkDrive`):
   - Carpeta raíz bajo el team folder de Accounts
   - Subcarpetas: PERSONAL DOCUMENTS, LLC MAIN DOCUMENTS, INVOICES, etc.
   - Copia de archivos plantilla
   - Link compartido cliente (`POST /workdrive/api/v1/links`)
   - **Link embebido** para el panel (`generateEmbedPermalink` + `convertPermalinkToEmbedUrl`)
3. **Actualiza Account CRM** con `workDriveId`, `workDriveUrl`, `workDriveUrlExternal`, `personal_folder`, `llc_folder`.
4. **Actualiza la solicitud** con `work_drive_id` y URL embed en `work_drive_url_external`.

Variables de entorno opcionales:

| Variable | Descripción |
|----------|-------------|
| `ZOHO_WORKDRIVE_ACCOUNTS_PARENT_FOLDER` | ID carpeta padre Accounts (default team folder SC) |
| `ZOHO_WORKDRIVE_TEMPLATE_FILE_IDS` | IDs plantilla separados por coma o JSON array |

Si CRM/WorkDrive falla, la fila queda importada en el panel y el resultado indica el error (no se revierte la BD).

---

## ZIP de documentos (opcional)

Además del CSV puedes subir un **ZIP** con los documentos de cada LLC. Se suben a la carpeta WorkDrive de la LLC **después** de crear la estructura en WorkDrive.

### Estructura del ZIP

Formato típico (con carpeta contenedora opcional):

```
documentos.zip
└── 00. migracion-benja-combined/          ← carpeta contenedora (opcional, una sola)
    ├── Zyvra LLC/
    │   ├── operating-agreement.pdf        → carpeta raíz de la LLC en WorkDrive
    │   ├── ein.pdf
    │   └── articles-of-incorporation.pdf
    ├── EXPRESS LLC/
    │   └── 2025 PRESENTATIONS/            → se mapea a `2025 PRESENTATION` en WorkDrive
    │       ├── f5472-v0.pdf
    │       └── f1120-v1.pdf
    └── ...
```

También válido **sin** carpeta contenedora:

```
documentos.zip
├── Zyvra LLC/
│   └── operating-agreement.pdf
└── ...
```

| Regla | Detalle |
|-------|---------|
| Carpeta LLC | Nombre = **`apertura_llc_name`** del CSV (sin distinguir mayúsculas) |
| Carpeta contenedora | Si todas las LLC están dentro de **una** carpeta raíz, se detecta y se omite automáticamente |
| PDFs sueltos en la carpeta LLC | Van a la carpeta principal de la LLC en WorkDrive |
| Subcarpetas | Si coinciden con subcarpetas WorkDrive (`PERSONAL DOCUMENTS`, `LLC MAIN DOCUMENTS`, `2025 PRESENTATION`, etc.), el archivo se sube ahí |
| `2025 PRESENTATIONS` vs `2025 PRESENTATION` | Se resuelve al folder de presentación existente en WorkDrive |
| Campo multipart | `documentsZip` (opcional, máx. ~200 MB) |

En la **vista previa** se muestra cuántas carpetas del ZIP coinciden con filas válidas del CSV, carpetas huérfanas y filas sin carpeta.

Si la subida de algún archivo falla, la importación en panel/CRM no se revierte; el resultado indica cuántos documentos se subieron y cuántos fallaron.

---

## Notas

- **`clients.address`** no se usa: la dirección va en **`apertura_llc_address`** → `llc_address`.
- **`client_email`** único por partner; duplicado a omitir: mismo partner + mismo email + mismo `apertura_llc_name`.
