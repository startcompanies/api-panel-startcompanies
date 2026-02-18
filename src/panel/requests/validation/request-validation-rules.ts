import { BadRequestException } from '@nestjs/common';

/**
 * Reglas de validación dinámica por servicio y sección
 * Valida solo los campos requeridos según el tipo de servicio y el paso actual
 */

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'email' | 'url' | 'date' | 'boolean' | 'array';
  required: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: string[];
  conditional?: {
    field: string;
    value: any;
  };
  nested?: ValidationRule[]; // Para objetos anidados (ej: memberAddress)
}

export interface SectionValidationRules {
  [section: number]: ValidationRule[];
}

export interface ServiceValidationRules {
  [serviceType: string]: SectionValidationRules;
}

/**
 * Reglas de validación para cada servicio y sección
 */
export const VALIDATION_RULES: ServiceValidationRules = {
  'apertura-llc': {
    1: [
      { field: 'llcName', type: 'string', required: true },
      { field: 'llcNameOption2', type: 'string', required: true },
      { field: 'llcNameOption3', type: 'string', required: true },
      { field: 'incorporationState', type: 'string', required: true },
      { field: 'businessDescription', type: 'string', required: true },
      { field: 'llcType', type: 'string', required: true, enum: ['single', 'multi'] },
    ],
    2: [
      // Validación de miembros se hace de forma especial
      { field: 'members', type: 'array', required: true },
    ],
    3: [
      { field: 'serviceBillUrl', type: 'url', required: true },
      { field: 'bankStatementUrl', type: 'url', required: true },
      { field: 'periodicIncome10k', type: 'string', required: true, enum: ['si', 'no'] },
      { field: 'bankAccountLinkedEmail', type: 'email', required: true },
      { field: 'bankAccountLinkedPhone', type: 'string', required: true },
      { field: 'actividadFinancieraEsperada', type: 'string', required: true },
    ],
  },
  'renovacion-llc': {
    1: [
      { field: 'llcName', type: 'string', required: true },
      { field: 'state', type: 'string', required: true },
      { field: 'llcType', type: 'string', required: true, enum: ['single', 'multi'] },
    ],
    2: [
      // Validación de propietarios se hace de forma especial
      { field: 'owners', type: 'array', required: true },
    ],
    3: [], // Todos los campos son opcionales
    4: [], // Todos los campos son opcionales
    5: [
      // Validación condicional para documentos adicionales
      {
        field: 'form147Or575FileUrl',
        type: 'url',
        required: true,
        conditional: { field: 'wasConstitutedWithStartCompanies', value: 'no' },
      },
      {
        field: 'articlesOfOrganizationAdditionalFileUrl',
        type: 'url',
        required: true,
        conditional: { field: 'wasConstitutedWithStartCompanies', value: 'no' },
      },
    ],
  },
  'cuenta-bancaria': {
    1: [
      { field: 'businessType', type: 'string', required: true, enum: ['llc', 'corporation', 'other'] },
      { field: 'legalBusinessName', type: 'string', required: true },
      { field: 'numberOfEmployees', type: 'string', required: true },
      { field: 'briefDescription', type: 'string', required: true },
      { field: 'einLetterUrl', type: 'url', required: true },
      { field: 'einNumber', type: 'string', required: true, pattern: /^\d{2}-\d{7}$/ },
      { field: 'articlesOrCertificateUrl', type: 'url', required: true },
    ],
    2: [], // Todos los campos son opcionales
    3: [
      { field: 'validatorFirstName', type: 'string', required: true },
      { field: 'validatorLastName', type: 'string', required: true },
      { field: 'validatorDateOfBirth', type: 'string', required: true },
      { field: 'validatorNationality', type: 'string', required: true },
      { field: 'validatorCitizenship', type: 'string', required: true },
      { field: 'validatorPassportNumber', type: 'string', required: true },
      { field: 'validatorPassportUrl', type: 'url', required: true },
    ],
    4: [
      { field: 'ownerPersonalStreet', type: 'string', required: true },
      { field: 'serviceBillUrl', type: 'url', required: true },
    ],
    5: [
      { field: 'isMultiMember', type: 'string', required: true, enum: ['yes', 'no'] },
    ],
    6: [
      // La validación de owners se hace de forma condicional en validateRequestData
      // Solo se valida si isMultiMember === 'yes'
    ],
  },
};

/**
 * Reglas de validación para miembros (apertura-llc sección 2)
 */
export const MEMBER_VALIDATION_RULES: ValidationRule[] = [
  { field: 'firstName', type: 'string', required: true },
  { field: 'lastName', type: 'string', required: true },
  { field: 'passportNumber', type: 'string', required: true },
  { field: 'scannedPassportUrl', type: 'url', required: true },
  { field: 'nationality', type: 'string', required: true },
  { field: 'email', type: 'email', required: true },
  { field: 'phoneNumber', type: 'string', required: true },
  { field: 'percentageOfParticipation', type: 'number', required: true, min: 0, max: 100 },
  { field: 'memberAddress.street', type: 'string', required: true },
  { field: 'memberAddress.city', type: 'string', required: true },
  { field: 'memberAddress.stateRegion', type: 'string', required: true },
  { field: 'memberAddress.postalCode', type: 'string', required: true },
  { field: 'memberAddress.country', type: 'string', required: true },
];

/**
 * Reglas de validación para propietarios (renovacion-llc sección 2)
 */
export const OWNER_RENOVACION_VALIDATION_RULES: ValidationRule[] = [
  { field: 'name', type: 'string', required: true },
  { field: 'lastName', type: 'string', required: true },
  { field: 'email', type: 'email', required: true },
  { field: 'phone', type: 'string', required: true },
  { field: 'fullAddress', type: 'string', required: true },
  { field: 'unit', type: 'string', required: true },
  { field: 'city', type: 'string', required: true },
  { field: 'stateRegion', type: 'string', required: true },
  { field: 'postalCode', type: 'string', required: true },
  { field: 'nationality', type: 'string', required: true },
  { field: 'passportNumber', type: 'string', required: true },
  { field: 'participationPercentage', type: 'number', required: true, min: 0, max: 100 },
];

/**
 * Reglas de validación para propietarios (cuenta-bancaria sección 6)
 */
export const OWNER_CUENTA_BANCARIA_VALIDATION_RULES: ValidationRule[] = [
  { field: 'passportFileUrl', type: 'url', required: true },
];

/**
 * Valida un valor según una regla
 */
function validateValue(value: any, rule: ValidationRule, isDraft: boolean = false): string | null {
  // Si no es requerido y está vacío/null/undefined, es válido
  if (!rule.required && (value === null || value === undefined || value === '')) {
    return null;
  }

  // Si es requerido y está vacío, pero es un borrador, no validar
  if (rule.required && isDraft && (value === null || value === undefined || value === '')) {
    return null; // Permitir campos vacíos en borradores
  }

  // Si es requerido y está vacío (y no es borrador)
  if (rule.required && !isDraft && (value === null || value === undefined || value === '')) {
    return `El campo ${rule.field} es requerido`;
  }

  // Validar tipo
  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string') {
        return `El campo ${rule.field} debe ser un texto`;
      }
      if (rule.required && value.trim() === '') {
        return `El campo ${rule.field} no puede estar vacío`;
      }
      break;

    case 'number':
      if (typeof value !== 'number' && isNaN(Number(value))) {
        return `El campo ${rule.field} debe ser un número`;
      }
      const numValue = Number(value);
      if (rule.min !== undefined && numValue < rule.min) {
        return `El campo ${rule.field} debe ser mayor o igual a ${rule.min}`;
      }
      if (rule.max !== undefined && numValue > rule.max) {
        return `El campo ${rule.field} debe ser menor o igual a ${rule.max}`;
      }
      break;

    case 'email':
      if (typeof value !== 'string') {
        return `El campo ${rule.field} debe ser un texto`;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return `El campo ${rule.field} debe ser un email válido`;
      }
      break;

    case 'url':
      if (typeof value !== 'string') {
        return `El campo ${rule.field} debe ser un texto`;
      }
      try {
        new URL(value);
      } catch {
        return `El campo ${rule.field} debe ser una URL válida`;
      }
      break;

    case 'date':
      if (typeof value !== 'string') {
        return `El campo ${rule.field} debe ser un texto`;
      }
      if (isNaN(Date.parse(value))) {
        return `El campo ${rule.field} debe ser una fecha válida`;
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return `El campo ${rule.field} debe ser un booleano`;
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        return `El campo ${rule.field} debe ser un array`;
      }
      break;
  }

  // Validar enum
  if (rule.enum && !rule.enum.includes(value)) {
    return `El campo ${rule.field} debe ser uno de: ${rule.enum.join(', ')}`;
  }

  // Validar pattern
  if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
    return `El campo ${rule.field} no cumple con el formato requerido`;
  }

  return null;
}

/**
 * Obtiene un valor anidado de un objeto usando notación de punto
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Valida los datos de una solicitud según el tipo y sección
 * Valida solo la sección actual (las secciones anteriores ya fueron validadas antes)
 */
export function validateRequestData(
  data: any,
  serviceType: string,
  currentStepNumber: number,
  status: string = 'pendiente',
): void {
  const serviceRules = VALIDATION_RULES[serviceType];
  if (!serviceRules) {
    throw new BadRequestException(`Tipo de servicio desconocido: ${serviceType}`);
  }

  const sectionRules = serviceRules[currentStepNumber];
  if (!sectionRules || sectionRules.length === 0) {
    // Si no hay reglas para esta sección, no validamos (puede ser una sección opcional)
    return;
  }

  const errors: string[] = [];
  
  // Determinar si es un borrador (status 'pendiente')
  const isDraft = status === 'pendiente';

  // Validar solo la sección actual (las anteriores ya fueron validadas)
  for (const rule of sectionRules) {
    // Verificar condición si existe
    if (rule.conditional) {
      const conditionalValue = getNestedValue(data, rule.conditional.field);
      if (conditionalValue !== rule.conditional.value) {
        continue; // No validar este campo si no se cumple la condición
      }
    }

    const value = getNestedValue(data, rule.field);
    const error = validateValue(value, rule, isDraft);

    if (error) {
      errors.push(error);
    }
  }

  // Validaciones especiales para arrays (members, owners)
  // Estas validaciones se aplican solo en la sección correspondiente
  if (serviceType === 'apertura-llc' && currentStepNumber === 2) {
    const members = data.members || [];
    const llcType = data.llcType;

    if (!Array.isArray(members) || members.length === 0) {
      errors.push('Debe haber al menos un miembro');
    } else {
      // Validar cantidad de miembros según tipo de LLC
      if (llcType === 'single' && members.length !== 1) {
        errors.push('Una LLC single-member requiere exactamente 1 miembro');
      }
      if (llcType === 'multi' && members.length < 2) {
        errors.push('Una LLC multi-member requiere al menos 2 miembros');
      }

      // Validar cada miembro
      const isDraft = status === 'pendiente';
      members.forEach((member: any, index: number) => {
        MEMBER_VALIDATION_RULES.forEach((rule) => {
          const value = getNestedValue(member, rule.field);
          const error = validateValue(value, rule, isDraft);
          if (error) {
            errors.push(`Miembro ${index + 1}: ${error}`);
          }
        });
      });

      // Validar porcentajes siempre (deben sumar 100% para avanzar)
      const totalPercentage = members.reduce(
        (sum: number, m: any) => sum + (Number(m.percentageOfParticipation) || 0),
        0,
      );
      if (Math.abs(totalPercentage - 100) > 0.01) {
        errors.push(`La suma de porcentajes de participación debe ser 100%. Actual: ${totalPercentage.toFixed(2)}%`);
      }

      // Validar que solo un miembro valide la cuenta bancaria
      const validators = members.filter((m: any) => m.validatesBankAccount === true);
      if (validators.length > 1) {
        errors.push('Solo un miembro puede validar la cuenta bancaria');
      }
    }
  }

  if (serviceType === 'renovacion-llc' && currentStepNumber === 2) {
    const owners = data.owners || [];
    const llcType = data.llcType;

    if (!Array.isArray(owners) || owners.length === 0) {
      errors.push('Debe haber al menos un propietario');
    } else {
      // Validar cantidad de propietarios según tipo de LLC
      if (llcType === 'single' && owners.length !== 1) {
        errors.push('Una LLC single-member requiere exactamente 1 propietario');
      }
      if (llcType === 'multi' && owners.length < 2) {
        errors.push('Una LLC multi-member requiere al menos 2 propietarios');
      }

      // Validar cada propietario
      owners.forEach((owner: any, index: number) => {
        OWNER_RENOVACION_VALIDATION_RULES.forEach((rule) => {
          const value = getNestedValue(owner, rule.field);
          const error = validateValue(value, rule);
          if (error) {
            errors.push(`Propietario ${index + 1}: ${error}`);
          }
        });
      });

      // Validar porcentajes siempre (deben sumar 100% para avanzar)
      const totalPercentage = owners.reduce(
        (sum: number, o: any) => sum + (Number(o.participationPercentage) || 0),
        0,
      );
      if (Math.abs(totalPercentage - 100) > 0.01) {
        errors.push(`La suma de porcentajes de participación debe ser 100%. Actual: ${totalPercentage.toFixed(2)}%`);
      }
    }
  }

  if (serviceType === 'cuenta-bancaria' && currentStepNumber === 6) {
    const owners = data.owners || [];
    const isMultiMember = data.isMultiMember === 'yes';

    if (isMultiMember) {
      if (!Array.isArray(owners) || owners.length === 0) {
        errors.push('Debe haber al menos un propietario para LLC Multi-Member');
      } else {
        // Validar cada propietario
        const isDraft = status === 'pendiente';
        owners.forEach((owner: any, index: number) => {
          OWNER_CUENTA_BANCARIA_VALIDATION_RULES.forEach((rule) => {
            const value = getNestedValue(owner, rule.field);
            const error = validateValue(value, rule, isDraft);
            if (error) {
              errors.push(`Propietario ${index + 1}: ${error}`);
            }
          });
        });
      }
    }
  }

  if (errors.length > 0) {
    throw new BadRequestException(errors.join('; '));
  }
}


