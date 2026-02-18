# Campos de Zoho que NO se guardan en la Base de Datos

Este documento lista todos los campos que vienen de Zoho CRM pero que NO se están guardando en las entidades de la base de datos.

## Campos del Account Principal (Zoho) que NO se guardan

### Campos generales del Account que no se usan:
- `id` - ID del Account en Zoho (se guarda en `Request.zohoAccountId`)
- `Tipo` - Tipo de solicitud (se usa para determinar el tipo pero no se guarda)
- `Empresa` - Empresa (Start Companies/Partner) (se usa para lógica pero no se guarda)
- `Owner` - Propietario del Account en Zoho (no se guarda)
- `Website` - Sitio web (se usa como fallback pero no se guarda directamente, se usa `P_gina_web_de_la_LLC`)

### Campos de contacto del Account principal que no se guardan en las entidades de Request:
- `Nombre_s` - Nombres del contacto principal (se usa para crear Member pero no se guarda en Request)
- `Apellidos` - Apellidos del contacto principal (se usa para crear Member pero no se guarda en Request)
- `Email_Laboral` - Email laboral (se usa para crear Member pero no se guarda en Request)
- `Correo_electr_nico` - Correo electrónico (se usa como fallback pero no se guarda directamente)
- `Phone` - Teléfono (se usa para crear Member pero no se guarda en Request)
- `Fecha_de_nacimiento` - Fecha de nacimiento (se usa para crear Member pero no se guarda en Request)
- `Nacionalidad1` - Nacionalidad (se usa para crear Member pero no se guarda en Request)
- `N_mero_de_pasaporte` - Número de pasaporte (se usa para crear Member pero no se guarda en Request)
- `Es_ciudadano_de_EE_UU` - Es ciudadano de EE.UU. (se usa para crear Member pero no se guarda en Request)

### Campos de dirección del Account principal que no se guardan directamente:
- `Calle_y_n_mero` - Calle y número (se usa para dirección comercial o personal pero puede no guardarse si hay `Direcci_n_comercial_*`)
- `Suite_Apto` - Suite/Apto (se usa para dirección comercial o personal pero puede no guardarse si hay `Direcci_n_comercial_*`)
- `Ciudad` - Ciudad (se usa para dirección comercial o personal pero puede no guardarse si hay `Direcci_n_comercial_*`)
- `Estado_Provincia` - Estado/Provincia (se usa para dirección comercial o personal pero puede no guardarse si hay `Direcci_n_comercial_*`)
- `Postal_Zip_Code` - Código postal (se usa para dirección comercial o personal pero puede no guardarse si hay `Direcci_n_comercial_*`)
- `Pais` - País (se usa para dirección comercial o personal pero puede no guardarse si hay `Direcci_n_comercial_*`)

## Campos específicos por tipo de Request

### Apertura LLC - Campos que NO se guardan:

1. **`Annual_Revenue`** - Ingresos anuales
   - Se mapea a `apertura.annualRevenue` pero NO está en el CSV del formulario
   - No se usa en el formulario del frontend

2. **`Account_Type`** - Tipo de cuenta
   - Se mapea a `apertura.accountType` pero NO está en el CSV del formulario
   - No se usa en el formulario del frontend

3. **`Estado_de_constituci_n`** - Estado de constitución
   - Se mapea a `apertura.estadoConstitucion` pero NO está en el CSV del formulario
   - No se usa en el formulario del frontend

### Renovación LLC - Campos que NO se guardan:

1. **`Correo_electr_nico`** (del Account principal) - Correo electrónico
   - Se obtiene pero NO se guarda en `RenovacionLlcRequest` (no existe ese campo)
   - Se usa solo para crear Member

2. **`Phone`** (del Account principal) - Teléfono
   - Se obtiene pero NO se guarda en `RenovacionLlcRequest` (no existe ese campo)
   - Se usa solo para crear Member

### Cuenta Bancaria - Campos que NO se guardan:

1. **`Tipo`** - Tipo de solicitud
   - Se mapea a `cuenta.accountType` pero NO está en el CSV del formulario
   - No se usa en el formulario del frontend

2. **`Banco`** - Nombre del banco
   - Se mapea a `cuenta.bankName` pero NO está en el CSV del formulario
   - No se usa en el formulario del frontend

3. **`Fecha_de_Constituci_n`** - Fecha de constitución
   - Se mapea a `cuenta.firstRegistrationDate` pero NO está en el CSV del formulario
   - No se usa en el formulario del frontend

## Campos de Subformularios que NO se guardan en las entidades de Request

### Contacto_Principal_LLC - Campos que se guardan en Member pero NO en Request:
- Todos los campos del subform `Contacto_Principal_LLC` se guardan en la entidad `Member`, NO en las entidades de Request (`AperturaLlcRequest`, `RenovacionLlcRequest`, `CuentaBancariaRequest`)

### Socios_LLC - Campos que se guardan en Member pero NO en Request:
- Todos los campos del subform `Socios_LLC` se guardan en la entidad `Member`, NO en las entidades de Request

## Resumen

### Campos que vienen de Zoho pero NO se guardan en ninguna entidad:

1. **Campos del Account principal:**
   - `id` (solo se guarda `zohoAccountId` en Request)
   - `Tipo`
   - `Empresa`
   - `Owner`
   - `Website` (solo se usa como fallback)

2. **Campos de contacto del Account principal:**
   - `Nombre_s`, `Apellidos`, `Email_Laboral`, `Phone`, etc. (solo se usan para crear Member, no se guardan en Request)

3. **Campos que se mapean pero NO están en los formularios del frontend:**
   - `Annual_Revenue` (Apertura LLC)
   - `Account_Type` (Apertura LLC)
   - `Estado_de_constituci_n` (Apertura LLC)
   - `Tipo` (Cuenta Bancaria)
   - `Banco` (Cuenta Bancaria)
   - `Fecha_de_Constituci_n` (Cuenta Bancaria)

### Nota importante:
Los campos de los subformularios (`Contacto_Principal_LLC` y `Socios_LLC`) SÍ se guardan, pero en la entidad `Member`, no en las entidades de Request. Esto es correcto según el diseño de la base de datos.
