# Validación de Campos - Cuenta Bancaria

## Campos en la Entidad CuentaBancariaRequest

### ✅ Campos que SÍ están en el CSV (mapeados a Zoho):
1. `businessType` → CSV línea 38: "Tipo de negocio"
2. `legalBusinessIdentifier` (mapea a `legalBusinessName` en CSV) → CSV línea 39: "Nombre legal del negocio"
3. `industry` → CSV línea 40: "Industria / Rubro"
4. `numberOfEmployees` → CSV línea 41: "Cantidad de empleados"
5. `economicActivity` (mapea a `briefDescription` en CSV) → CSV línea 42: "Descripción breve"
6. `websiteOrSocialMedia` → CSV línea 43: "Sitio web o red social"
7. `ein` (mapea a `einNumber` en CSV) → CSV línea 44: "Numero de EIN"
8. `registeredAgentStreet` → CSV línea 45: "Calle y número (Dirección Registered Agent)" (en `companyAddress` JSONB)
9. `registeredAgentUnit` → CSV línea 46: "Apto / Suite / PO Box (Dirección Registered Agent)" (en `companyAddress` JSONB)
10. `registeredAgentCity` → CSV línea 47: "Ciudad (Dirección Registered Agent)" (en `companyAddress` JSONB)
11. `registeredAgentState` → CSV línea 48: "Estado (Dirección Registered Agent)" (en `companyAddress` JSONB)
12. `registeredAgentZipCode` → CSV línea 49: "Postal / Zip Code (Dirección Registered Agent)" (en `companyAddress` JSONB)
13. `registeredAgentCountry` → CSV línea 50: "Country (Dirección Registered Agent)" (en `companyAddress` JSONB)
14. `incorporationState` → CSV línea 51: "Estado de constitución"
15. `incorporationMonthYear` → CSV línea 52: "Mes y Año de Incorporación"
16. `countriesWhereBusiness` → CSV línea 53: "Países donde haces negocios con tu LLC"
17. `ownerPersonalStreet` → CSV línea 54: "Calle y número (Dirección Personal)" (en `ownerPersonalAddress` JSONB)
18. `ownerPersonalUnit` → CSV línea 55: "Calle y número interior (Dirección Personal)" (en `ownerPersonalAddress` JSONB)
19. `ownerPersonalCity` → CSV línea 56: "Ciudad (Dirección Personal)" (en `ownerPersonalAddress` JSONB)
20. `ownerPersonalState` → CSV línea 57: "Estados / Provincias (Dirección Personal)" (en `ownerPersonalAddress` JSONB)
21. `ownerPersonalCountry` → CSV línea 58: "País y/o Estado (Dirección Personal)" (en `ownerPersonalAddress` JSONB)
22. `ownerPersonalPostalCode` → CSV línea 59: "Código Postal (Dirección Personal)" (en `ownerPersonalAddress` JSONB)
23. `llcType` (mapea a `isMultiMember` en CSV) → CSV línea 60: "¿Tu LLC es Multi-Member?"

### ⚠️ Campos que NO están en el CSV pero se usan en el frontend:
1. `einLetterUrl` - URL del archivo de carta EIN (línea 91 HTML - hidden)
2. `certificateOfConstitutionOrArticlesUrl` - URL del certificado (línea 127 HTML - hidden como `articlesOrCertificateUrl`)
3. `operatingAgreementUrl` - URL del Operating Agreement (no visible en HTML pero se usa)
4. `validatorScannedPassportUrl` - URL del pasaporte escaneado del validador (línea 322 HTML - hidden como `validatorPassportUrl`)
5. `serviceBillUrl` - URL de factura de servicio (línea 503 HTML - hidden)
6. `proofOfAddressUrl` - URL de comprobante de dirección (no visible en HTML pero se usa)

**Nota:** Estos campos son necesarios para el funcionamiento del sistema (subida de archivos), aunque no se mapeen a Zoho.

### ⚠️ Campos del Validador que se usan en el frontend pero NO están en el CSV:
1. `validatorFirstName` - Se usa en HTML (línea 237) → Se transforma en `firstName` del primer Member
2. `validatorLastName` - Se usa en HTML (línea 247) → Se transforma en `lastName` del primer Member
3. `validatorDateOfBirth` - Se usa en HTML (línea 257) → Se transforma en `dateOfBirth` del primer Member
4. `validatorNationality` - Se usa en HTML (línea 267) → Se transforma en `nationality` del primer Member
5. `validatorCitizenship` - Se usa en HTML (línea 280) → **NO se transforma a Member** (no existe en Member)
6. `validatorPassportNumber` - Se usa en HTML (línea 289) → Se transforma en `passportNumber` del primer Member
7. `validatorWorkEmail` - Se usa en HTML (línea 328) → Se transforma en `email` del primer Member
8. `validatorPhone` - Se usa en HTML (línea 342) → Se transforma en `phoneNumber` del primer Member
9. `validatorCanReceiveSMS` - Se usa en HTML (línea 350 como `canReceiveSMS`) → **NO se transforma a Member**
10. `validatorIsUSResident` - Se usa en HTML (línea 359 como `isUSResident`) → Se transforma en `isUSCitizen` del primer Member (línea 2550)
11. `validatorTitle` - Se usa en HTML (línea 371) → **NO se transforma a Member**
12. `validatorIncomeSource` - Se usa en HTML (línea 389) → **NO se transforma a Member**
13. `validatorAnnualIncome` - Se usa en HTML (línea 402) → **NO se transforma a Member**

**Nota:** Según el código en `new-request.component.ts` (líneas 2522-2551), el validador se transforma en el primer Member. Los campos que NO se transforman (`validatorCitizenship`, `validatorCanReceiveSMS`, `validatorTitle`, `validatorIncomeSource`, `validatorAnnualIncome`) podrían eliminarse si no se usan para otra cosa o para sincronización con Zoho.

### ❌ Campos que NO están en el CSV y NO se usan en el frontend:
1. `applicantEmail` - No está en CSV (se usa Member)
2. `applicantFirstName` - No está en CSV (se usa Member)
3. `applicantPaternalLastName` - No está en CSV (se usa Member)
4. `applicantMaternalLastName` - No está en CSV (se usa Member)
5. `applicantPhone` - No está en CSV (se usa Member)
6. `accountType` - **MANTENER** - Se usa para calcular monto de pago (gratuita/premium)
7. `isRegisteredAgentInUSA` - No está en CSV
8. `registeredAgentName` - No está en CSV
9. `registeredAgentAddress` - No está en CSV (se usa `companyAddress` JSONB)
10. `swiftBicAba` - No está en CSV
11. `accountNumber` - No está en CSV
12. `bankAccountType` - No está en CSV
13. `hasLitigatedCurrentFiscalYear` - No está en CSV
14. `litigationDetails` - No está en CSV
15. `isSameAddressAsBusiness` - No está en CSV
16. `validatorUseEmailForRelayLogin` - No está en CSV
17. `documentCertification` - No está en CSV
18. `acceptsTermsAndConditions` - No está en CSV

### 📋 Campos técnicos necesarios:
1. `requestId` - Primary Key (necesario)
2. `currentStepNumber` - Control del flujo del formulario (necesario)
3. `createdAt` - Timestamp de creación (necesario)
4. `updatedAt` - Timestamp de actualización (necesario)

## Resumen

**Total de campos en la entidad:** 58
- ✅ Campos mapeados a Zoho (CSV): 23
- ⚠️ Campos de archivos (no en CSV pero necesarios): 6
- ⚠️ Campos del validador (no en CSV pero se usan): 13
- ❌ Campos a eliminar (no en CSV ni se usan): 18
- 📋 Campos técnicos: 4
- ⚠️ Campo especial: 1 (`accountType` - se mantiene para cálculo de pago)

## Recomendación

### Campos a mantener:
1. **`accountType`** - Se mantiene porque se usa para calcular el monto de pago (gratuita=0, premium=99)
2. **Campos de archivos** - Se mantienen porque se usan en el frontend
3. **Campos del validador** - Se mantienen porque se usan en el frontend (aunque el validador se guarda como Member, estos campos pueden ser necesarios para el flujo)

### Campos a eliminar:
Todos los campos marcados como ❌ que no están en CSV ni se usan en el frontend.
