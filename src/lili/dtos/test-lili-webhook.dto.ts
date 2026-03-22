import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class TestLiliWebhookDto {
  @ApiPropertyOptional({ example: 'onboardingComplete' })
  @IsOptional()
  @IsString()
  event?: string;

  @ApiPropertyOptional({ example: 'onboardingComplete' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    example: {
      email: 'test@example.com',
      customerId: 'mock-customer-id-123',
      personId: 'mock-person-id-123',
      status: 'approved',
    },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
