# Validación de Estructura de Base de Datos - Apertura LLC Request

## Análisis Completo de Campos

### 1. Campos en la Entidad TypeORM (`apertura-llc-request.entity.ts`)

#### Campos Base (existentes desde creación):
1. `request_id` (PK) - `int` - NOT NULL
2. `current_step_number` - `int` - NOT NULL
3. `llc_name` - `varchar(255)` - nullable
4. `business_type` - `varchar(255)` - nullable
5. `business_description` - `text` - nullable
6. `llc_phone_number` - `varchar(50)` - nullable
7. `llc_website` - `varchar(500)` - nullable
8. `llc_email` - `varchar(255)` - nullable
9. `incorporation_state` - `varchar(100)` - nullable
10. `incorporation_date` - `date` - nullable
11. `has_ein` - `boolean` - nullable
12. `ein_number` - `varchar(50)` - nullable
13. `ein_document_url` - `text` - nullable
14. `no_ein_reason` - `text` - nullable
15. `certificate_of_formation_url` - `text` - nullable
16. `registered_agent_address` - `jsonb` - nullable
17. `registered_agent_name` - `varchar(255)` - nullable
18. `registered_agent_email` - `varchar(255)` - nullable
19. `registered_agent_phone` - `varchar(50)` - nullable
20. `registered_agent_type` - `varchar(20)` - nullable
21. `needs_bank_verification_help` - `boolean` - nullable
22. `bank_account_type` - `varchar(50)` - nullable
23. `bank_name` - `varchar(255)` - nullable
24. `bank_account_number` - `varchar(100)` - nullable
25. `bank_routing_number` - `varchar(100)` - nullable
26. `bank_statement_url` - `text` - nullable
27. `owner_nationality` - `varchar(100)` - nullable
28. `owner_country_of_residence` - `varchar(100)` - nullable
29. `owner_personal_address` - `jsonb` - nullable
30. `owner_phone_number` - `varchar(50)` - nullable
31. `owner_email` - `varchar(255)` - nullable
32. `llc_type` - `varchar(20)` - nullable
33. `created_at` - `timestamp with time zone` - NOT NULL (default)
34. `updated_at` - `timestamp with time zone` - NOT NULL (default)

#### Campos Nuevos (agregados en migración 1766176000000):
35. `llc_name_option_2` - `varchar(255)` - nullable
36. `llc_name_option_3` - `varchar(255)` - nullable
37. `annual_revenue` - `decimal(15,2)` - nullable
38. `account_type` - `varchar(50)` - nullable
39. `estado_constitucion` - `varchar(100)` - nullable
40. `website` - `varchar(500)` - nullable
41. `linkedin` - `varchar(255)` - nullable
42. `actividad_financiera_esperada` - `text` - nullable
43. `almacena_productos_deposito_usa` - `boolean` - nullable
44. `declaro_impuestos_antes` - `boolean` - nullable
45. `llc_con_start_companies` - `boolean` - nullable
46. `ingresos_mayor_250k` - `boolean` - nullable
47. `activos_en_usa` - `boolean` - nullable
48. `ingresos_periodicos_10k` - `boolean` - nullable
49. `contrata_servicios_usa` - `boolean` - nullable
50. `propiedad_en_usa` - `boolean` - nullable
51. `tiene_cuentas_bancarias` - `boolean` - nullable

**Total: 51 campos en la entidad**

### 2. Campos en la Migración (1766176000000-AddZohoFieldsToAperturaLlcRequest.ts)

La migración agrega exactamente 17 campos nuevos:
1. `llc_name_option_2`
2. `llc_name_option_3`
3. `annual_revenue`
4. `account_type`
5. `estado_constitucion`
6. `website`
7. `linkedin`
8. `actividad_financiera_esperada`
9. `almacena_productos_deposito_usa`
10. `declaro_impuestos_antes`
11. `llc_con_start_companies`
12. `ingresos_mayor_250k`
13. `activos_en_usa`
14. `ingresos_periodicos_10k`
15. `contrata_servicios_usa`
16. `propiedad_en_usa`
17. `tiene_cuentas_bancarias`

**✅ Todos los campos de la migración están en la entidad**

### 3. Campos Mapeados en `zoho-sync.service.ts` (mapAccountToAperturaRequest)

Campos mapeados desde Zoho:
1. `requestId` - (no viene de Zoho, es el ID del request)
2. `currentStepNumber` - (valor por defecto: 1)
3. `llcName` ← `Account_Name`
4. `incorporationState` ← `Estado_de_Registro`
5. `incorporationDate` ← `Fecha_de_Constituci_n`
6. `einNumber` ← `N_mero_de_EIN`
7. `businessDescription` ← `Actividad_Principal_de_la_LLC`
8. `llcWebsite` ← `P_gina_web_de_la_LLC` o `Website`
9. `llcEmail` ← `Correo_electr_nico`
10. `llcPhoneNumber` ← `Phone`
11. `llcType` ← `Estructura_Societaria` (mapeado)
12. `llcNameOption2` ← `Nombre_de_la_LLC_Opci_n_2`
13. `llcNameOption3` ← `Nombre_de_la_LLC_Opci_n_3`
14. `annualRevenue` ← `Annual_Revenue`
15. `accountType` ← `Account_Type`
16. `estadoConstitucion` ← `Estado_de_constituci_n`
17. `website` ← `Website` o `P_gina_web_de_la_LLC`
18. `linkedin` ← `LinkedIn`
19. `actividadFinancieraEsperada` ← `Actividad_financiera_esperada`
20. `almacenaProductosDepositoUSA` ← `Almacena_productos_en_un_dep_sito_en_EE_UU`
21. `declaroImpuestosAntes` ← `La_LLC_declar_impuestos_anteriormente`
22. `llcConStartCompanies` ← `La_LLC_se_constituy_con_Start_Companies`
23. `ingresosMayor250k` ← `Los_ingresos_brutos_o_activos_superan_250_000`
24. `activosEnUSA` ← `Posee_la_LLC_inversiones_o_activos_en_EE_UU`
25. `ingresosPeriodicos10k` ← `Tendr_ingresos_peri_dicos_que_sumen_USD_10_000`
26. `contrataServiciosUSA` ← `Tu_empresa_contrata_servicios_en_EE_UU`
27. `propiedadEnUSA` ← `Tu_empresa_posee_o_renta_una_propiedad_en_EE_UU`
28. `tieneCuentasBancarias` ← `Tu_LLC_tiene_cuentas_bancarias_a_su_nombre`

**Total: 28 campos mapeados (26 desde Zoho + 2 internos)**

### 4. Validación de Consistencia

#### ✅ Campos en Entidad que NO están en Migración (Esperado - son campos base):
- Todos los campos del 1-34 (campos base existentes antes de la migración)

#### ✅ Campos en Migración que SÍ están en Entidad:
- Todos los 17 campos nuevos están correctamente definidos en la entidad

#### ✅ Campos Mapeados que SÍ están en Entidad:
- Todos los 28 campos mapeados existen en la entidad

#### ⚠️ Campos en Entidad que NO están Mapeados (Pueden ser usados por el formulario):
- `business_type` - No se mapea desde Zoho (puede ser usado por formulario)
- `has_ein` - No se mapea directamente (se infiere de `ein_number`)
- `ein_document_url` - No se mapea desde Zoho
- `no_ein_reason` - No se mapea desde Zoho
- `certificate_of_formation_url` - No se mapea desde Zoho
- `registered_agent_address` - No se mapea desde Zoho
- `registered_agent_name` - No se mapea desde Zoho
- `registered_agent_email` - No se mapea desde Zoho
- `registered_agent_phone` - No se mapea desde Zoho
- `registered_agent_type` - No se mapea desde Zoho
- `needs_bank_verification_help` - No se mapea desde Zoho
- `bank_account_type` - No se mapea desde Zoho
- `bank_name` - No se mapea desde Zoho
- `bank_account_number` - No se mapea desde Zoho
- `bank_routing_number` - No se mapea desde Zoho
- `bank_statement_url` - No se mapea desde Zoho
- `owner_nationality` - No se mapea desde Zoho (está en Members)
- `owner_country_of_residence` - No se mapea desde Zoho (está en Members)
- `owner_personal_address` - No se mapea desde Zoho (está en Members)
- `owner_phone_number` - No se mapea desde Zoho (está en Members)
- `owner_email` - No se mapea desde Zoho (está en Members)

**Nota:** Estos campos no mapeados son normales porque:
- Algunos se llenan desde el formulario del frontend
- Algunos están relacionados con Members (contacto principal y socios)
- Algunos son documentos/URLs que se suben después

### 5. Verificación de Duplicados

#### ⚠️ POSIBLE DUPLICADO DETECTADO:

**`llc_website` vs `website`:**
- `llc_website` (campo base) - mapeado desde `P_gina_web_de_la_LLC` o `Website`
- `website` (campo nuevo) - mapeado desde `Website` o `P_gina_web_de_la_LLC`

**Análisis:**
- Ambos campos pueden contener el mismo valor
- En el mapeo: `llcWebsite: account.P_gina_web_de_la_LLC || account.Website || ''`
- En el mapeo: `website: account.Website || account.P_gina_web_de_la_LLC || null`

**Recomendación:** 
- Si `P_gina_web_de_la_LLC` y `Website` son campos diferentes en Zoho, mantener ambos
- Si son el mismo campo, considerar consolidar en uno solo
- Por ahora, ambos se mantienen ya que pueden tener propósitos diferentes

### 6. Resumen de Validación

✅ **Estructura Correcta:**
- Todos los campos de la migración existen en la entidad
- Todos los campos mapeados existen en la entidad
- No hay campos en la migración que no existan en la entidad
- No hay campos mapeados que no existan en la entidad

⚠️ **Observaciones:**
- Hay un posible duplicado funcional entre `llc_website` y `website` (ambos pueden contener la misma información)
- Hay campos en la entidad que no se mapean desde Zoho (normal, se usan desde formularios)

✅ **Conclusión:**
La estructura está correcta y lista para usar. La migración puede ejecutarse sin problemas.








