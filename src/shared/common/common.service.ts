import {
  BadRequestException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
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
      message: 'Correo no registrado',
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

  handleBadRequestFileException() {
    throw new BadRequestException({
      errorDetail: 'No se ha subido ningún archivo.',
      message: 'No se ha subido ningún archivo.',
      code: HttpStatus.BAD_REQUEST,
    });
  }

  /**
   * Maneja errores específicos del SDK de AWS.
   */
  handleAwsS3Exception(error: any) {
    // Error 403: El cliente no tiene los permisos para realizar la acción.
    if (error.Code === 'SignatureDoesNotMatch') {
      throw new UnauthorizedException({
        errorDetail: 'La firma de la solicitud no coincide. Verifique sus credenciales.',
        message: 'Credenciales de AWS S3 incorrectas o expiradas.',
        code: HttpStatus.UNAUTHORIZED,
      });
    }

    // Manejo de otros posibles errores de AWS
    if (error.Code === 'NoSuchBucket' || error.Code === 'NoSuchKey') {
      throw new NotFoundException({
        errorDetail: error.message,
        message: 'El bucket o la clave (archivo) no fue encontrado.',
        code: HttpStatus.NOT_FOUND,
      });
    }

    // Excepción genérica para cualquier otro error de S3
    throw new InternalServerErrorException({
      errorDetail: error,
      message: 'Error en el servicio de S3. Revise los registros del servidor.',
      code: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}
