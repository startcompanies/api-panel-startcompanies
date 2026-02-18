# Validación de Campos - Apertura LLC

## Campos en la Entidad AperturaLlcRequest

### ✅ Campos que SÍ están en el CSV (mapeados a Zoho):
1. `llcName` → CSV línea 2: "Nombre de la LLC - Opción 1"
2. `llcNameOption2` → CSV línea 3: "Nombre de la LLC - Opción 2"
3. `llcNameOption3` → CSV línea 4: "Nombre de la LLC - Opción 3"
4. `incorporationState` → CSV línea 5: "Estado de Registro de la LLC"
5. `businessDescription` → CSV línea 6: "Actividad Principal de la LLC"
6. `llcType` → CSV línea 7: "Estructura Societaria"
7. `linkedin` → CSV línea 8: "LinkedIn (Opcional)"
8. `periodicIncome10k` → CSV línea 9: "¿Tendrá ingresos periódicos que suman USD 10"
9. `bankAccountLinkedEmail` → CSV línea 10: "Correo Electrónico Vinculado a la Cuenta Bancaria"
10. `bankAccountLinkedPhone` → CSV línea 11: "Número de Teléfono Vinculado a la Cuenta Bancaria"
11. `actividadFinancieraEsperada` → CSV línea 12: "Actividad financiera esperada"
12. `projectOrCompanyUrl` → CSV línea 13: "URL del Proyecto o Empresa (Opcional)"

### ⚠️ Campos que NO están en el CSV pero se usan en el frontend:
1. `serviceBillUrl` - URL del archivo de factura de servicio (se sube en el frontend)
2. `bankStatementUrl` - URL del archivo de resumen bancario (se sube en el frontend)

**Nota:** Estos campos son necesarios para el funcionamiento del sistema (subida de archivos), aunque no se mapeen a Zoho.

### 📋 Campos técnicos necesarios:
1. `requestId` - Primary Key (necesario)
2. `currentStepNumber` - Control del flujo del formulario (necesario)
3. `createdAt` - Timestamp de creación (necesario)
4. `updatedAt` - Timestamp de actualización (necesario)

### ❌ Campo que NO se usa y NO está en CSV:
- `einNumber` - No está en el CSV de apertura-llc y no se usa en el formulario HTML (solo se inicializa en TypeScript pero nunca se muestra). **DEBE ELIMINARSE**

**Verificación:**
- ❌ No aparece en el HTML del formulario (`apertura-llc-form.component.html`)
- ✅ Se inicializa en `new-request.component.ts` (línea 1531) pero nunca se usa
- ❌ No está en el CSV de mapeo a Zoho para apertura-llc

## Resumen

**Total de campos en la entidad:** 19
- ✅ Campos mapeados a Zoho (CSV): 12
- ⚠️ Campos de archivos (no en CSV pero necesarios): 2
- 📋 Campos técnicos: 4
- ❌ Campo a eliminar: 1 (`einNumber` - no está en CSV ni se usa en frontend)

## Recomendación

### Campos a mantener:
Los campos `serviceBillUrl` y `bankStatementUrl` deben mantenerse porque:
1. Se usan en el frontend para subir archivos (líneas 259 y 306 del HTML)
2. Son necesarios para el funcionamiento del sistema
3. Aunque no se mapeen a Zoho, son parte del flujo de datos

### Campo a eliminar:
- `einNumber` - Debe eliminarse de la entidad, DTOs, servicios y migración porque:
  1. No está en el CSV de mapeo a Zoho para apertura-llc
  2. No se muestra en el formulario HTML
  3. Solo se inicializa en TypeScript pero nunca se usa

El campo `einNumber` debería verificarse si realmente se usa en el formulario de apertura LLC o si solo se usa en renovación/cuenta bancaria.
