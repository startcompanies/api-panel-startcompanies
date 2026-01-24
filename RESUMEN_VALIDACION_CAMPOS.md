# Resumen de Validación de Campos

## Apertura LLC

### Campos a eliminar:
- ❌ `einNumber` - No está en CSV ni se usa en frontend

### Campos a mantener:
- ✅ Todos los campos del CSV (12 campos)
- ⚠️ `serviceBillUrl` y `bankStatementUrl` (archivos, se usan en frontend)

---

## Renovación LLC

### Campos a eliminar:
- ❌ `declaracionInicial` - No está en CSV
- ❌ `cambioDireccionRA` - No está en CSV
- ❌ `agregarCambiarSocio` - No está en CSV
- ❌ `declaracionCierre` - No está en CSV

### Campos a mantener:
- ✅ Todos los campos del CSV (24 campos)
- ⚠️ Campos de archivos (6 campos: `partnersPassportsFileUrl`, `operatingAgreementAdditionalFileUrl`, `form147Or575FileUrl`, `articlesOfOrganizationAdditionalFileUrl`, `boiReportFileUrl`, `bankStatementsFileUrl`)

---

## Cuenta Bancaria

### Campos a eliminar:
- ❌ `applicantEmail` - No está en CSV (se usa Member)
- ❌ `applicantFirstName` - No está en CSV (se usa Member)
- ❌ `applicantPaternalLastName` - No está en CSV (se usa Member)
- ❌ `applicantMaternalLastName` - No está en CSV (se usa Member)
- ❌ `applicantPhone` - No está en CSV (se usa Member)
- ❌ `isRegisteredAgentInUSA` - No está en CSV
- ❌ `registeredAgentName` - No está en CSV
- ❌ `registeredAgentAddress` - No está en CSV (se usa `companyAddress` JSONB)
- ❌ `swiftBicAba` - No está en CSV
- ❌ `accountNumber` - No está en CSV
- ❌ `bankAccountType` - No está en CSV
- ❌ `hasLitigatedCurrentFiscalYear` - No está en CSV
- ❌ `litigationDetails` - No está en CSV
- ❌ `isSameAddressAsBusiness` - No está en CSV
- ❌ `validatorUseEmailForRelayLogin` - No está en CSV
- ❌ `documentCertification` - No está en CSV
- ❌ `acceptsTermsAndConditions` - No está en CSV
- ❌ `validatorCitizenship` - No está en CSV (no se transforma a Member)
- ❌ `validatorCanReceiveSMS` - No está en CSV (no se transforma a Member)
- ❌ `validatorTitle` - No está en CSV (no se transforma a Member)
- ❌ `validatorIncomeSource` - No está en CSV (no se transforma a Member)
- ❌ `validatorAnnualIncome` - No está en CSV (no se transforma a Member)

### Campos a mantener:
- ✅ Todos los campos del CSV (23 campos)
- ⚠️ Campos de archivos (6 campos)
- ⚠️ Campos del validador que se transforman a Member (8 campos: `validatorFirstName`, `validatorLastName`, `validatorDateOfBirth`, `validatorNationality`, `validatorPassportNumber`, `validatorWorkEmail`, `validatorPhone`, `validatorIsUSResident`)
- ⚠️ `accountType` - Se mantiene porque se usa para calcular monto de pago

---

## Total de campos a eliminar

- **Apertura LLC:** 1 campo
- **Renovación LLC:** 4 campos
- **Cuenta Bancaria:** 21 campos

**Total:** 26 campos a eliminar
