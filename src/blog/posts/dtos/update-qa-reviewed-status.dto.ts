import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateQaReviewedStatusDto {
  @ApiProperty({
    example: true,
    description: 'Indica si el post fue validado en QA.',
  })
  @IsBoolean()
  qa_reviewed: boolean;
}
