# Validación de Campos - Renovación LLC

## Campos en la Entidad RenovacionLlcRequest

### ✅ Campos que SÍ están en el CSV (mapeados a Zoho):
1. `llcName` → CSV línea 14: "Nombre de la LLC"
2. `state` → CSV línea 15: "Estado de Registro de la LLC"
3. `llcType` → CSV línea 16: "Estructura Societaria"
4. `mainActivity` → CSV línea 17: "Actividad Principal de la LLC"
5. `hasPropertyInUSA` → CSV línea 18: "¿Tu empresa posee o renta alguna propiedad inmobiliaria en Estados Unidos?"
6. `almacenaProductosDepositoUSA` → CSV línea 19: "¿Tu empresa almacena productos físicos en un depósito en Estados Unidos?"
7. `contrataServiciosUSA` → CSV línea 20: "¿Tu empresa contrata servicios de personas o empresas de Estados Unidos regularmente?"
8. `tieneCuentasBancarias` → CSV línea 21: "¿Tu LLC tiene cuentas bancarias a su nombre?"
9. `einNumber` → CSV línea 22: "Número de EIN"
10. `llcCreationDate` → CSV línea 23: "Fecha de creación de la LLC"
11. `countriesWhereLLCDoesBusiness` → CSV línea 24: "Países donde la LLC realiza negocios"
12. `hasFinancialInvestmentsInUSA` → CSV línea 25: "¿Posee la LLC inversiones financieras o activos dentro de Estados Unidos?"
13. `hasFiledTaxesBefore` → CSV línea 26: "¿La LLC declaró impuestos anteriormente?"
14. `wasConstitutedWithStartCompanies` → CSV línea 27: "¿La LLC se constituyó con Start Companies?"
15. `declaracionAnoCorriente` → CSV línea 28: "Declaración del año corriente (2025)"
16. `cambioNombre` → CSV línea 29: "Cambio de nombre"
17. `declaracionAnosAnteriores` → CSV línea 30: "Declaración de años anteriores"
18. `llcOpeningCost` → CSV línea 31: "¿Cuánto costó abrir la LLC en Estados Unidos?"
19. `paidToFamilyMembers` → CSV línea 32: "¿Cuánto pagó la LLC a familiares del dueño por trabajos o servicios?"
20. `paidToLocalCompanies` → CSV línea 33: "¿Cuánto pagó la LLC a empresas locales (En otro Pais) del dueño por bienes o servicios?"
21. `paidForLLCFormation` → CSV línea 34: "¿Cuánto se pagó por la formación de la LLC (Incorporation/State fees)?"
22. `paidForLLCDissolution` → CSV línea 35: "¿Cuánto se pagó por la disolución de la LLC (si aplica)?"
23. `bankAccountBalanceEndOfYear` → CSV línea 36: "Saldo Al fin de año de las cuentas bancarias de la LLC"
24. `totalRevenue` → CSV línea 37: "Facturación total de la LLC en {año}"

### ⚠️ Campos que NO están en el CSV pero se usan en el frontend (archivos):
1. `partnersPassportsFileUrl` - URL del archivo de pasaportes de socios (línea 467 HTML - hidden)
2. `operatingAgreementAdditionalFileUrl` - URL del archivo de Operating Agreement adicional (línea 496 HTML - hidden)
3. `form147Or575FileUrl` - URL del archivo Form 147 o 575 (línea 525 HTML - hidden)
4. `articlesOfOrganizationAdditionalFileUrl` - URL del archivo de Articles of Organization adicional (línea 554 HTML - hidden)
5. `boiReportFileUrl` - URL del archivo BOI Report (línea 583 HTML - hidden)
6. `bankStatementsFileUrl` - URL del archivo de estados bancarios (línea 613 HTML - hidden)

**Nota:** Estos campos son necesarios para el funcionamiento del sistema (subida de archivos), aunque no se mapeen a Zoho.

### ❌ Campos que NO están en el CSV y NO se usan en el frontend:
1. `declaracionInicial` - No está en CSV (línea 115 HTML - checkbox, pero no mapeado a Zoho)
2. `cambioDireccionRA` - No está en CSV (línea 123 HTML - checkbox, pero no mapeado a Zoho)
3. `agregarCambiarSocio` - No está en CSV (línea 135 HTML - checkbox, pero no mapeado a Zoho)
4. `declaracionCierre` - No está en CSV (línea 139 HTML - checkbox, pero no mapeado a Zoho)

**Verificación:**
- ✅ Aparecen en el HTML del formulario (checkboxes)
- ❌ No están en el CSV de mapeo a Zoho
- ⚠️ Se usan en el frontend pero no se mapean a Zoho

### 📋 Campos técnicos necesarios:
1. `requestId` - Primary Key (necesario)
2. `currentStepNumber` - Control del flujo del formulario (necesario)
3. `createdAt` - Timestamp de creación (necesario)
4. `updatedAt` - Timestamp de actualización (necesario)

## Resumen

**Total de campos en la entidad:** 38
- ✅ Campos mapeados a Zoho (CSV): 24
- ⚠️ Campos de archivos (no en CSV pero necesarios): 6
- ❌ Campos a eliminar (no en CSV): 4
- 📋 Campos técnicos: 4

## Recomendación

### Campos a mantener:
Los campos de archivos (`partnersPassportsFileUrl`, `operatingAgreementAdditionalFileUrl`, etc.) deben mantenerse porque:
1. Se usan en el frontend para subir archivos
2. Son necesarios para el funcionamiento del sistema
3. Aunque no se mapeen a Zoho, son parte del flujo de datos

### Campos a eliminar:
- `declaracionInicial` - Debe eliminarse porque no está en CSV
- `cambioDireccionRA` - Debe eliminarse porque no está en CSV
- `agregarCambiarSocio` - Debe eliminarse porque no está en CSV
- `declaracionCierre` - Debe eliminarse porque no está en CSV

**Nota:** Aunque estos campos aparecen como checkboxes en el HTML, no están en el CSV de mapeo a Zoho, por lo que no deberían guardarse en la BD si el objetivo es solo mantener los campos mapeados.
