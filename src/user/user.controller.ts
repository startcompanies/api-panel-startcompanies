import { Controller, Post, Body } from "@nestjs/common";
import { UserService } from "./user.service";
import { UserDto } from "./dtos/user.dto";

@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService){}

    @Post()
    async createUser(@Body() userDto: UserDto){
        return await this.userService.createUser(userDto);
    }
}