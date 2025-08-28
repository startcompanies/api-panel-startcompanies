import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class HandleExceptionsService {
  handleDBExceptions(error: any) {
    if (error.code === '23505') {
      throw new BadRequestException({
        errorDetail: `${error.detail}`,
        message: 'Registro duplicado',
        code: 404,
      });
    }
    if (error.code == '23503') {
      throw new BadRequestException({
        errorDetail: `${error.detail}`,
        message: 'Registro no encontrado',
        code: 404,
      });
    }

    console.log(error);
    throw new InternalServerErrorException({
      errorDetail: error,
      message: `Can't create a new register - Check server logs`,
      code: 500,
    });
  }

  handleNotFoundExceptions(id: any) {
    throw new NotFoundException({
      errorDetail: `Register with id ${id} not found`,
      message: 'Registro no encontrado',
      code: 404,
    });
  }

  handleNotFoundAdminAppExceptions() {
    throw new NotFoundException({
      errorDetail: `Admin app not found`,
      message: 'Registro no encontrado',
      code: 404,
    });
  }

  handleBadRequestExceptions(id: any) {
    throw new BadRequestException(
      `The id value is incorrect ${id} a number is expected`,
    );
  }

  handleErrorLoginException(email: string) {
    return {
      error: 'email',
      errorDetail: `User with email ${email} not found`,
      message: 'Correo electrónico incorrecto',
      code: 200,
    };
  }

  handleErrorPasswordException(email: string) {
    return {
      error: 'pass',
      errorDetail: `User with email ${email} has wrong password `,
      message: 'Contraseña incorrecta',
      code: 200,
    };
  }

  handleErrorStatusUserException(email: string) {
    return {
      error: 'status',
      errorDetail: `User with email ${email} has been deactivated`,
      message: 'Usuario desactivado',
      code: 200,
    };
  }

  handleErrorAppAssignmentException(userId: number) {
    return {
      errorDetail: `Application assignment with userId ${userId} not found`,
      message: 'No se encontraron asignaciones',
      code: 200,
    };
  }

  handleErrorAppException(easxAppId: number) {
    throw new NotFoundException({
      errorDetail: `App with id ${easxAppId} not found `,
      message: 'Aplicación no encontrada',
      code: 404,
    });
  }
}
