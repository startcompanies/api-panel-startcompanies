import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/* ----------------------------- Planes ----------------------------- */

export class PricingPlanFeatureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text: string;

  @IsOptional()
  @IsIn(['feature', 'renewal'])
  kind?: 'feature' | 'renewal';

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

export class CreatePricingPlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @IsOptional()
  @IsBoolean()
  recommended?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  subtitle?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  /** Estados habilitados; usar `'*'` para "cualquier estado". */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(70)
  @IsString({ each: true })
  states?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingPlanFeatureDto)
  features?: PricingPlanFeatureDto[];
}

export class UpdatePricingPlanDto {
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsBoolean() recommended?: boolean;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) subtitle?: string | null;
  @IsOptional() @IsInt() @Min(0) orderIndex?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsIn(['single', 'multi', 'both']) memberType?: 'single' | 'multi' | 'both';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(70)
  @IsString({ each: true })
  states?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingPlanFeatureDto)
  features?: PricingPlanFeatureDto[];
}

/* --------------------------- Renovaciones --------------------------- */

export class UpsertRenewalDto {
  @IsString() @MinLength(1) @MaxLength(60) state: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) singlePrice: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) multiPrice: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/* ---------------------------- Overrides ---------------------------- */

export class CreatePricingOverrideDto {
  @IsString() @MinLength(1) @MaxLength(40) serviceType: string;
  @IsOptional() @IsString() @MaxLength(40) planCode?: string | null;
  @IsOptional() @IsString() @MaxLength(60) state?: string | null;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePricingOverrideDto {
  @IsOptional() @IsString() @MaxLength(40) serviceType?: string;
  @IsOptional() @IsString() @MaxLength(40) planCode?: string | null;
  @IsOptional() @IsString() @MaxLength(60) state?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/* ----------------------------- Misc ----------------------------- */

export class UpsertMiscDto {
  @IsString() @MinLength(1) @MaxLength(60) code: string;
  @IsString() @MinLength(1) @MaxLength(120) label: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
