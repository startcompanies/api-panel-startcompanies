import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class ChangePasswordDto {
    @IsString()
    @ApiProperty()
    email: string;

    @IsString()
    @ApiProperty()
    oldPassword: string;

    @IsString()
    @ApiProperty()
    newPassword: string;
}