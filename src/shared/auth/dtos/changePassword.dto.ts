import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class ChangePasswordDto {
    @ApiProperty({ example: 'john@example.com', description: 'Email del usuario' })
    @IsString()
    email: string;

    @ApiProperty({ example: 'OldPassword123!', description: 'Contraseña actual' })
    @IsString()
    oldPassword: string;

    @ApiProperty({ example: 'NewPassword123!', description: 'Nueva contraseña' })
    @IsString()
    newPassword: string;
}