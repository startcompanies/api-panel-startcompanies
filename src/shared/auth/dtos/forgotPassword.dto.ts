import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class ForgotPasswordDto {
    @ApiProperty({ example: 'john@example.com', description: 'Email del usuario para restablecer contraseña' })
    @IsString()
    email: string;
}