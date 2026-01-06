# Análisis de Validación Dinámica por Servicio y Sección

## Resumen
Este documento mapea los campos obligatorios para cada servicio y sección, permitiendo validación dinámica en el backend según el `type` y `currentStepNumber`.

---

## 1. APERTURA LLC (`apertura-llc`)

### Sección 1: Información de la LLC
**Campos obligatorios:**
- `llcName` (string, no vacío)
- `llcNameOption2` (string, no vacío)
- `llcNameOption3` (string, no vacío)
- `incorporationState` (string, no vacío, debe ser un estado válido)
- `businessDescription` (string, no vacío)
- `llcType` (string, debe ser 'single' o 'multi')

**Campos opcionales:**
- `llcPhoneNumber`
- `website`
- `llcEmail`
- `linkedin`

### Sección 2: Información del Propietario/Socios
**Campos obligatorios (por cada miembro en el FormArray `members`):**
- `firstName` (string, no vacío)
- `lastName` (string, no vacío)
- `passportNumber` (string, no vacío)
- `scannedPassportUrl` (string, no vacío - URL del archivo subido)
- `nationality` (string, no vacío)
- `email` (string, formato email válido)
- `phoneNumber` (string, no vacío)
- `percentageOfParticipation` (number, entre 0 y 100)
- `memberAddress.street` (string, no vacío)
- `memberAddress.city` (string, no vacío)
- `memberAddress.stateRegion` (string, no vacío)
- `memberAddress.postalCode` (string, no vacío)
- `memberAddress.country` (string, no vacío)

**Validaciones adicionales:**
- Si `llcType === 'single'`: debe haber exactamente 1 miembro
- Si `llcType === 'multi'`: debe haber al menos 2 miembros
- La suma de `percentageOfParticipation` de todos los miembros debe ser 100% (solo si status != 'pendiente')
- Solo un miembro puede tener `validatesBankAccount === true`

**Campos opcionales:**
- `dateOfBirth` (puede ser null)
- `memberAddress.unit`

### Sección 3: Información para Apertura Bancaria
**Campos obligatorios:**
- `serviceBillUrl` (string, no vacío - URL del archivo subido)
- `bankStatementUrl` (string, no vacío - URL del archivo subido)
- `periodicIncome10k` (string, debe ser 'si' o 'no')
- `bankAccountLinkedEmail` (string, formato email válido)
- `bankAccountLinkedPhone` (string, no vacío)
- `actividadFinancieraEsperada` (string, no vacío)

**Campos opcionales:**
- `projectOrCompanyUrl`

---

## 2. RENOVACIÓN LLC (`renovacion-llc`)

### Sección 1: Información de la LLC
**Campos obligatorios:**
- `llcName` (string, no vacío)
- `state` (string, no vacío, debe ser un estado válido)
- `llcType` (string, debe ser 'single' o 'multi')

**Campos opcionales:**
- `mainActivity`
- `hasPropertyInUSA`
- `almacenaProductosDepositoUSA`
- `contrataServiciosUSA`
- `tieneCuentasBancarias`
- `einNumber`
- `llcCreationDate`
- `countriesWhereLLCDoesBusiness` (array)
- `declaracionInicial`, `declaracionAnoCorriente`, `cambioDireccionRA`, `cambioNombre`, `declaracionAnosAnteriores`, `agregarCambiarSocio`, `declaracionCierre` (booleanos)

### Sección 2: Información del Propietario
**Campos obligatorios (por cada propietario en el FormArray `owners`):**
- `name` (string, no vacío)
- `lastName` (string, no vacío)
- `email` (string, formato email válido)
- `phone` (string, no vacío)
- `fullAddress` (string, no vacío)
- `unit` (string, no vacío)
- `city` (string, no vacío)
- `stateRegion` (string, no vacío)
- `postalCode` (string, no vacío)
- `nationality` (string, no vacío)
- `passportNumber` (string, no vacío)
- `participationPercentage` (number, entre 0 y 100)

**Validaciones adicionales:**
- Si `llcType === 'single'`: debe haber exactamente 1 propietario
- Si `llcType === 'multi'`: debe haber al menos 2 propietarios
- La suma de `participationPercentage` de todos los propietarios debe ser 100% (solo si status != 'pendiente')

**Campos opcionales:**
- `dateOfBirth`
- `country`
- `ssnItin`
- `cuit`
- `capitalContributions2025`
- `loansToLLC2025`
- `loansRepaid2025`
- `capitalWithdrawals2025`
- `hasInvestmentsInUSA`
- `isUSCitizen`
- `taxCountry`
- `wasInUSA31Days2025`

### Sección 3: Información Contable de la LLC
**Todos los campos son opcionales:**
- `llcOpeningCost`
- `paidToFamilyMembers`
- `paidToLocalCompanies`
- `paidForLLCFormation`
- `paidForLLCDissolution`
- `bankAccountBalanceEndOfYear`

### Sección 4: Movimientos Financieros de la LLC en 2025
**Todos los campos son opcionales:**
- `totalRevenue2025`

### Sección 5: Información Adicional de la LLC
**Campos obligatorios condicionales:**
- Si `wasConstitutedWithStartCompanies === 'no'`:
  - `form147Or575FileUrl` (string, no vacío - URL del archivo subido)
  - `articlesOfOrganizationAdditionalFileUrl` (string, no vacío - URL del archivo subido)

**Campos opcionales:**
- `hasFinancialInvestmentsInUSA`
- `hasFiledTaxesBefore`
- `wasConstitutedWithStartCompanies`
- `partnersPassportsFileUrl` (solo si `wasConstitutedWithStartCompanies === 'no'`)
- `operatingAgreementAdditionalFileUrl` (solo si `wasConstitutedWithStartCompanies === 'no'`)
- `boiReportFileUrl` (solo si `wasConstitutedWithStartCompanies === 'no'`)
- `bankStatementsFileUrl` (siempre visible, pero opcional)

---

## 3. CUENTA BANCARIA (`cuenta-bancaria`)

### Sección 1: Información de la LLC
**Campos obligatorios:**
- `businessType` (string, debe ser 'llc', 'corporation' o 'other')
- `legalBusinessName` (string, no vacío)
- `numberOfEmployees` (string, no vacío)
- `briefDescription` (string, no vacío)
- `einLetterUrl` (string, no vacío - URL del archivo subido)
- `einNumber` (string, formato XX-XXXXXXX)
- `articlesOrCertificateUrl` (string, no vacío - URL del archivo subido)

**Campos opcionales:**
- `industry`
- `websiteOrSocialMedia`

### Sección 2: Dirección del Registered Agent
**Todos los campos son opcionales** (aunque hay un subtítulo que dice "Dirección de tu empresa en USA *", no hay campos específicos marcados como obligatorios):
- `registeredAgentStreet`
- `registeredAgentUnit`
- `registeredAgentCity`
- `registeredAgentState`
- `registeredAgentZipCode`
- `registeredAgentCountry`
- `incorporationState`
- `incorporationMonthYear`
- `countriesWhereBusiness` (array)

### Sección 3: Información de la persona que verificará la cuenta bancaria
**Campos obligatorios:**
- `validatorFirstName` (string, no vacío)
- `validatorLastName` (string, no vacío)
- `validatorDateOfBirth` (string, formato dd-MMM-yyyy)
- `validatorNationality` (string, no vacío)
- `validatorCitizenship` (string, no vacío)
- `validatorPassportNumber` (string, no vacío)
- `validatorPassportUrl` (string, no vacío - URL del archivo subido)

**Campos opcionales:**
- `validatorWorkEmail`
- `validatorPhone`
- `canReceiveSMS`
- `isUSResident`
- `validatorTitle`
- `validatorIncomeSource`
- `validatorAnnualIncome`

### Sección 4: Dirección personal del propietario
**Campos obligatorios:**
- `ownerPersonalStreet` (string, no vacío)
- `serviceBillUrl` (string, no vacío - URL del archivo subido)

**Campos opcionales:**
- `ownerPersonalUnit`
- `ownerPersonalCity`
- `ownerPersonalState`
- `ownerPersonalCountry`
- `ownerPersonalPostalCode`

### Sección 5: Tipo de LLC
**Campos obligatorios:**
- `isMultiMember` (string, debe ser 'yes' o 'no')

### Sección 6: Información de los propietarios (solo si `isMultiMember === 'yes'`)
**Campos obligatorios (por cada propietario en el FormArray `owners`):**
- `passportFileUrl` (string, no vacío - URL del archivo subido)

**Campos opcionales:**
- `firstName`
- `lastName`
- `dateOfBirth`
- `nationality`
- `passportNumber`
- `ssnItin`
- `cuit`
- `participationPercentage`

---

## Notas de Implementación

1. **Validación de porcentajes**: La validación de que los porcentajes sumen 100% solo debe aplicarse cuando `status !== 'pendiente'` (es decir, cuando se finaliza la solicitud).

2. **Validación condicional**: Algunos campos son obligatorios solo bajo ciertas condiciones (ej: documentos adicionales en Renovación LLC si `wasConstitutedWithStartCompanies === 'no'`).

3. **FormArrays**: Para validar FormArrays (members, owners), se debe validar que:
   - El array no esté vacío cuando es requerido
   - Cada elemento del array cumpla con los campos obligatorios
   - Se cumplan las validaciones de cantidad mínima/máxima según el tipo de LLC

4. **Tipos de datos**:
   - Strings: no vacíos (trim() !== '')
   - Numbers: validar rangos cuando aplique
   - Emails: formato válido
   - URLs: formato válido (para archivos subidos)
   - Dates: formato válido según el campo

5. **Archivos**: Los campos que terminan en `Url` representan archivos subidos. Deben ser URLs válidas y no vacías cuando son obligatorios.

