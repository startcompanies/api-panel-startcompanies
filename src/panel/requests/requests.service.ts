import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Request } from './entities/request.entity';
import { AperturaLlcRequest } from './entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from './entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from './entities/cuenta-bancaria-request.entity';
import { Member } from './entities/member.entity';
import { BankAccountOwner } from './entities/bank-account-owner.entity';
import { BankAccountValidator } from './entities/bank-account-validator.entity';
import { RequestRequiredDocument } from './entities/request-required-document.entity';
import { User } from '../../shared/user/entities/user.entity';
import { CreateRequestDto } from './dtos/create-request.dto';
import { UpdateRequestDto } from './dtos/update-request.dto';
import { ApproveRequestDto } from './dtos/approve-request.dto';
import { RejectRequestDto } from './dtos/reject-request.dto';
import { CreateMemberDto } from './dtos/create-member.dto';
import { UpdateMemberDto } from './dtos/update-member.dto';
import { CreateOwnerDto } from './dtos/create-owner.dto';
import { UpdateOwnerDto } from './dtos/update-owner.dto';
import { CreateBankAccountValidatorDto } from './dtos/create-bank-account-validator.dto';
import { UpdateBankAccountValidatorDto } from './dtos/update-bank-account-validator.dto';
// ZohoCrmService ya no se usa en findOne - solo se consulta la BD local
// import { ZohoCrmService } from '../../zoho-config/zoho-crm.service';
export type { RequestType } from './types/request-type';

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @InjectRepository(Request)
    private readonly requestRepository: Repository<Request>,
    @InjectRepository(AperturaLlcRequest)
    private readonly aperturaRepo: Repository<AperturaLlcRequest>,
    @InjectRepository(RenovacionLlcRequest)
    private readonly renovacionRepo: Repository<RenovacionLlcRequest>,
    @InjectRepository(CuentaBancariaRequest)
    private readonly cuentaRepo: Repository<CuentaBancariaRequest>,
    @InjectRepository(Member)
    private readonly memberRepo: Repository<Member>,
    @InjectRepository(BankAccountOwner)
    private readonly ownerRepo: Repository<BankAccountOwner>,
    @InjectRepository(BankAccountValidator)
    private readonly validatorRepo: Repository<BankAccountValidator>,
    @InjectRepository(RequestRequiredDocument)
    private readonly requiredDocRepo: Repository<RequestRequiredDocument>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    // ZohoCrmService ya no se usa - solo consultamos BD local
    // private readonly zohoCrmService: ZohoCrmService,
  ) {}

  findAllByUser(userId: number, role: 'client' | 'partner') {
    const where = role === 'client' ? { clientId: userId } : { partnerId: userId };
    return this.requestRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: number) {
    const request = await this.requestRepository.findOne({
      where: { id },
      relations: [
        'client',
        'partner',
        'aperturaLlcRequest',
        'renovacionLlcRequest',
        'cuentaBancariaRequest',
      ],
    });
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    // Cargar Members relacionados si es una solicitud de Apertura LLC
    if (request.aperturaLlcRequest) {
      const members = await this.memberRepo.find({
        where: { requestId: id },
        order: { id: 'ASC' },
      });
      // Agregar members al objeto de respuesta
      (request as any).members = members;
    }

    // No consultamos Zoho - usamos solo datos de la BD local
    // Los datos ya están sincronizados en aperturaLlcRequest/renovacionLlcRequest/cuentaBancariaRequest
    // y en las relaciones con Members, Owners, Validators, etc.
    // El zohoAccountId se mantiene solo como referencia
    
    return request;
  }

  async create(createRequestDto: CreateRequestDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validar que el cliente existe
      const client = await this.userRepo.findOne({
        where: { id: createRequestDto.clientId },
      });
      if (!client) {
        throw new NotFoundException(
          `Cliente con ID ${createRequestDto.clientId} no encontrado`,
        );
      }

      // Validar que el partner existe si se proporciona
      if (createRequestDto.partnerId) {
        const partner = await this.userRepo.findOne({
          where: { id: createRequestDto.partnerId },
        });
        if (!partner) {
          throw new NotFoundException(
            `Partner con ID ${createRequestDto.partnerId} no encontrado`,
          );
        }
      }

      // Validar currentStepNumber según el tipo
      const maxSteps = {
        'apertura-llc': 6,
        'renovacion-llc': 6,
        'cuenta-bancaria': 7,
      };
      if (
        createRequestDto.currentStepNumber < 1 ||
        createRequestDto.currentStepNumber > maxSteps[createRequestDto.type]
      ) {
        throw new BadRequestException(
          `currentStepNumber debe estar entre 1 y ${maxSteps[createRequestDto.type]} para tipo ${createRequestDto.type}`,
        );
      }

      // Crear la solicitud base - estado inicial: solicitud-recibida (pendiente de aprobación)
      const request = this.requestRepository.create({
        type: createRequestDto.type,
        status: 'solicitud-recibida',
        clientId: createRequestDto.clientId,
        partnerId: createRequestDto.partnerId,
        notes: createRequestDto.notes,
      });
      const savedRequest = await queryRunner.manager.save(Request, request);

      // Crear la solicitud específica según el tipo
      if (createRequestDto.type === 'apertura-llc') {
        if (!createRequestDto.aperturaLlcData) {
          throw new BadRequestException(
            'aperturaLlcData es requerido para tipo apertura-llc',
          );
        }

        const { members, ...aperturaDataFields } =
          createRequestDto.aperturaLlcData;

        // Validar miembros según el tipo de LLC
        if (createRequestDto.currentStepNumber >= 6) {
          if (aperturaDataFields.llcType === 'multi') {
            if (!members || members.length < 2) {
              throw new BadRequestException(
                'Una LLC multi-member requiere al menos 2 miembros',
              );
            }
          } else if (aperturaDataFields.llcType === 'single') {
            if (!members || members.length !== 1) {
              throw new BadRequestException(
                'Una LLC single-member requiere exactamente 1 miembro',
              );
            }
          }
        }

        const aperturaData = this.aperturaRepo.create({
          requestId: savedRequest.id,
          currentStepNumber: createRequestDto.currentStepNumber,
          ...aperturaDataFields,
        });
        await queryRunner.manager.save(AperturaLlcRequest, aperturaData);

        // Crear miembros si se proporcionan
        if (members && members.length > 0) {
          // Validar que solo un miembro valide la cuenta bancaria
          const validators = members.filter((m) => m.validatesBankAccount);
          if (validators.length > 1) {
            throw new BadRequestException(
              'Solo un miembro puede validar la cuenta bancaria',
            );
          }

          const membersToSave = members.map((memberDto) => {
            return this.memberRepo.create({
              requestId: savedRequest.id,
              ...memberDto,
              dateOfBirth: new Date(memberDto.dateOfBirth),
            });
          });
          await queryRunner.manager.save(Member, membersToSave);
        }
      } else if (createRequestDto.type === 'renovacion-llc') {
        if (!createRequestDto.renovacionLlcData) {
          throw new BadRequestException(
            'renovacionLlcData es requerido para tipo renovacion-llc',
          );
        }

        const { members, ...renovacionDataFields } =
          createRequestDto.renovacionLlcData;

        // Validar miembros según el tipo de LLC
        if (createRequestDto.currentStepNumber >= 2) {
          if (renovacionDataFields.llcType === 'multi') {
            if (!members || members.length < 2) {
              throw new BadRequestException(
                'Una LLC multi-member requiere al menos 2 miembros',
              );
            }
          } else if (renovacionDataFields.llcType === 'single') {
            if (!members || members.length !== 1) {
              throw new BadRequestException(
                'Una LLC single-member requiere exactamente 1 miembro',
              );
            }
          }
        }

        const renovacionData = this.renovacionRepo.create({
          requestId: savedRequest.id,
          currentStepNumber: createRequestDto.currentStepNumber,
          ...renovacionDataFields,
        });
        await queryRunner.manager.save(RenovacionLlcRequest, renovacionData);

        // Crear miembros si se proporcionan
        if (members && members.length > 0) {
          const membersToSave = members.map((memberDto) => {
            return this.memberRepo.create({
              requestId: savedRequest.id,
              ...memberDto,
              dateOfBirth: new Date(memberDto.dateOfBirth),
            });
          });
          await queryRunner.manager.save(Member, membersToSave);
        }
      } else if (createRequestDto.type === 'cuenta-bancaria') {
        if (!createRequestDto.cuentaBancariaData) {
          throw new BadRequestException(
            'cuentaBancariaData es requerido para tipo cuenta-bancaria',
          );
        }

        const cuentaData = this.cuentaRepo.create({
          requestId: savedRequest.id,
          currentStepNumber: createRequestDto.currentStepNumber,
          ...createRequestDto.cuentaBancariaData,
          firstRegistrationDate: createRequestDto.cuentaBancariaData
            .firstRegistrationDate
            ? new Date(createRequestDto.cuentaBancariaData.firstRegistrationDate)
            : undefined,
        });
        await queryRunner.manager.save(CuentaBancariaRequest, cuentaData);
      }

      await queryRunner.commitTransaction();

      // Retornar la solicitud completa con relaciones
      return this.findOne(savedRequest.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al crear solicitud:', error);
      throw new InternalServerErrorException(
        'Error al crear la solicitud. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async update(id: number, updateRequestDto: UpdateRequestDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Buscar la solicitud existente
      const request = await this.requestRepository.findOne({
        where: { id },
        relations: [
          'aperturaLlcRequest',
          'renovacionLlcRequest',
          'cuentaBancariaRequest',
        ],
      });

      if (!request) {
        throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
      }

      // Actualizar campos básicos de la solicitud
      if (updateRequestDto.status !== undefined) {
        request.status = updateRequestDto.status;
      }
      if (updateRequestDto.notes !== undefined) {
        request.notes = updateRequestDto.notes;
      }
      await queryRunner.manager.save(Request, request);

      // Actualizar la solicitud específica según el tipo
      if (request.type === 'apertura-llc') {
        const aperturaRequest = await this.aperturaRepo.findOne({
          where: { requestId: id },
        });

        if (!aperturaRequest) {
          throw new NotFoundException(
            `Solicitud de Apertura LLC con ID ${id} no encontrada`,
          );
        }

        if (updateRequestDto.currentStepNumber !== undefined) {
          aperturaRequest.currentStepNumber = updateRequestDto.currentStepNumber;
        }

        if (updateRequestDto.aperturaLlcData) {
          Object.assign(aperturaRequest, updateRequestDto.aperturaLlcData);
        }

        await queryRunner.manager.save(AperturaLlcRequest, aperturaRequest);
      } else if (request.type === 'renovacion-llc') {
        const renovacionRequest = await this.renovacionRepo.findOne({
          where: { requestId: id },
        });

        if (!renovacionRequest) {
          throw new NotFoundException(
            `Solicitud de Renovación LLC con ID ${id} no encontrada`,
          );
        }

        if (updateRequestDto.currentStepNumber !== undefined) {
          renovacionRequest.currentStepNumber =
            updateRequestDto.currentStepNumber;
        }

        if (updateRequestDto.renovacionLlcData) {
          Object.assign(renovacionRequest, updateRequestDto.renovacionLlcData);
        }

        await queryRunner.manager.save(
          RenovacionLlcRequest,
          renovacionRequest,
        );
      } else if (request.type === 'cuenta-bancaria') {
        const cuentaRequest = await this.cuentaRepo.findOne({
          where: { requestId: id },
        });

        if (!cuentaRequest) {
          throw new NotFoundException(
            `Solicitud de Cuenta Bancaria con ID ${id} no encontrada`,
          );
        }

        if (updateRequestDto.currentStepNumber !== undefined) {
          cuentaRequest.currentStepNumber = updateRequestDto.currentStepNumber;
        }

        if (updateRequestDto.cuentaBancariaData) {
          const cuentaData = { ...updateRequestDto.cuentaBancariaData };
          // Convertir fecha si viene
          if (cuentaData.firstRegistrationDate) {
            cuentaData.firstRegistrationDate = new Date(
              cuentaData.firstRegistrationDate as any,
            ) as any;
          }
          Object.assign(cuentaRequest, cuentaData);
        }

        await queryRunner.manager.save(CuentaBancariaRequest, cuentaRequest);
      }

      await queryRunner.commitTransaction();

      // Retornar la solicitud actualizada con relaciones
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al actualizar solicitud:', error);
      throw new InternalServerErrorException(
        'Error al actualizar la solicitud. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // ========== MÉTODOS DE MIEMBROS ==========

  async findMembersByRequest(requestId: number) {
    // Verificar que la solicitud existe
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }

    return this.memberRepo.find({
      where: { requestId },
      order: { createdAt: 'ASC' },
    });
  }

  async createMember(requestId: number, createMemberDto: CreateMemberDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que la solicitud existe
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
        relations: ['aperturaLlcRequest', 'renovacionLlcRequest'],
      });
      if (!request) {
        throw new NotFoundException(
          `Solicitud con ID ${requestId} no encontrada`,
        );
      }

      // Verificar que la solicitud es de tipo LLC
      if (
        request.type !== 'apertura-llc' &&
        request.type !== 'renovacion-llc'
      ) {
        throw new BadRequestException(
          'Los miembros solo pueden agregarse a solicitudes de Apertura LLC o Renovación LLC',
        );
      }

      // Si el miembro valida cuenta bancaria, verificar que no haya otro validador
      if (createMemberDto.validatesBankAccount) {
        const existingValidator = await this.memberRepo.findOne({
          where: {
            requestId,
            validatesBankAccount: true,
          },
        });
        if (existingValidator) {
          throw new BadRequestException(
            'Ya existe un miembro que valida la cuenta bancaria. Solo puede haber uno.',
          );
        }
      }

      // Crear el miembro
      const member = this.memberRepo.create({
        requestId,
        ...createMemberDto,
        dateOfBirth: new Date(createMemberDto.dateOfBirth),
      });

      const savedMember = await queryRunner.manager.save(Member, member);

      await queryRunner.commitTransaction();
      return savedMember;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al crear miembro:', error);
      throw new InternalServerErrorException(
        'Error al crear el miembro. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async updateMember(
    requestId: number,
    memberId: number,
    updateMemberDto: UpdateMemberDto,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que la solicitud existe
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException(
          `Solicitud con ID ${requestId} no encontrada`,
        );
      }

      // Buscar el miembro
      const member = await this.memberRepo.findOne({
        where: { id: memberId, requestId },
      });
      if (!member) {
        throw new NotFoundException(
          `Miembro con ID ${memberId} no encontrado en la solicitud ${requestId}`,
        );
      }

      // Si se está actualizando validatesBankAccount a true, verificar que no haya otro validador
      if (
        updateMemberDto.validatesBankAccount === true &&
        !member.validatesBankAccount
      ) {
        const existingValidator = await this.memberRepo.findOne({
          where: {
            requestId,
            validatesBankAccount: true,
            id: memberId, // Excluir el miembro actual
          },
        });
        if (existingValidator) {
          throw new BadRequestException(
            'Ya existe otro miembro que valida la cuenta bancaria. Solo puede haber uno.',
          );
        }
      }

      // Actualizar campos
      if (updateMemberDto.dateOfBirth) {
        updateMemberDto.dateOfBirth = new Date(
          updateMemberDto.dateOfBirth as any,
        ) as any;
      }
      Object.assign(member, updateMemberDto);

      const updatedMember = await queryRunner.manager.save(Member, member);

      await queryRunner.commitTransaction();
      return updatedMember;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al actualizar miembro:', error);
      throw new InternalServerErrorException(
        'Error al actualizar el miembro. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async deleteMember(requestId: number, memberId: number) {
    // Verificar que la solicitud existe
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }

    // Buscar el miembro
    const member = await this.memberRepo.findOne({
      where: { id: memberId, requestId },
    });
    if (!member) {
      throw new NotFoundException(
        `Miembro con ID ${memberId} no encontrado en la solicitud ${requestId}`,
      );
    }

    await this.memberRepo.remove(member);
    return { message: 'Miembro eliminado correctamente' };
  }

  async validateMemberPercentages(requestId: number) {
    const members = await this.memberRepo.find({
      where: { requestId },
    });

    if (members.length === 0) {
      throw new BadRequestException(
        'No hay miembros en esta solicitud para validar',
      );
    }

    const totalPercentage = members.reduce(
      (sum, member) => sum + Number(member.percentageOfParticipation),
      0,
    );

    const isValid = Math.abs(totalPercentage - 100) < 0.01; // Tolerancia para decimales

    return {
      isValid,
      totalPercentage,
      expectedPercentage: 100,
      difference: Math.abs(totalPercentage - 100),
      members: members.map((m) => ({
        id: m.id,
        name: `${m.firstName} ${m.lastName}`,
        percentage: Number(m.percentageOfParticipation),
      })),
    };
  }

  // ========== MÉTODOS DE PROPIETARIOS (CUENTA BANCARIA) ==========

  async findOwnersByRequest(requestId: number) {
    // Verificar que la solicitud existe y es de tipo cuenta-bancaria
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }
    if (request.type !== 'cuenta-bancaria') {
      throw new BadRequestException(
        'Los propietarios solo pueden agregarse a solicitudes de Cuenta Bancaria',
      );
    }

    return this.ownerRepo.find({
      where: { requestId },
      order: { createdAt: 'ASC' },
    });
  }

  async createOwner(requestId: number, createOwnerDto: CreateOwnerDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que la solicitud existe y es de tipo cuenta-bancaria
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException(
          `Solicitud con ID ${requestId} no encontrada`,
        );
      }
      if (request.type !== 'cuenta-bancaria') {
        throw new BadRequestException(
          'Los propietarios solo pueden agregarse a solicitudes de Cuenta Bancaria',
        );
      }

      // Crear el propietario
      const owner = this.ownerRepo.create({
        requestId,
        ...createOwnerDto,
        dateOfBirth: new Date(createOwnerDto.dateOfBirth),
      });

      const savedOwner = await queryRunner.manager.save(
        BankAccountOwner,
        owner,
      );

      await queryRunner.commitTransaction();
      return savedOwner;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al crear propietario:', error);
      throw new InternalServerErrorException(
        'Error al crear el propietario. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async updateOwner(
    requestId: number,
    ownerId: number,
    updateOwnerDto: UpdateOwnerDto,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que la solicitud existe
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException(
          `Solicitud con ID ${requestId} no encontrada`,
        );
      }

      // Buscar el propietario
      const owner = await this.ownerRepo.findOne({
        where: { id: ownerId, requestId },
      });
      if (!owner) {
        throw new NotFoundException(
          `Propietario con ID ${ownerId} no encontrado en la solicitud ${requestId}`,
        );
      }

      // Actualizar campos
      if (updateOwnerDto.dateOfBirth) {
        updateOwnerDto.dateOfBirth = new Date(
          updateOwnerDto.dateOfBirth as any,
        ) as any;
      }
      Object.assign(owner, updateOwnerDto);

      const updatedOwner = await queryRunner.manager.save(
        BankAccountOwner,
        owner,
      );

      await queryRunner.commitTransaction();
      return updatedOwner;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al actualizar propietario:', error);
      throw new InternalServerErrorException(
        'Error al actualizar el propietario. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async deleteOwner(requestId: number, ownerId: number) {
    // Verificar que la solicitud existe
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }

    // Buscar el propietario
    const owner = await this.ownerRepo.findOne({
      where: { id: ownerId, requestId },
    });
    if (!owner) {
      throw new NotFoundException(
        `Propietario con ID ${ownerId} no encontrado en la solicitud ${requestId}`,
      );
    }

    await this.ownerRepo.remove(owner);
    return { message: 'Propietario eliminado correctamente' };
  }

  // ========== MÉTODOS DE VALIDADOR DE CUENTA BANCARIA ==========

  async findBankAccountValidator(requestId: number) {
    // Verificar que la solicitud existe y es de tipo cuenta-bancaria
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }
    if (request.type !== 'cuenta-bancaria') {
      throw new BadRequestException(
        'El validador solo puede agregarse a solicitudes de Cuenta Bancaria',
      );
    }

    return this.validatorRepo.findOne({
      where: { requestId },
    });
  }

  async createOrUpdateBankAccountValidator(
    requestId: number,
    createValidatorDto: CreateBankAccountValidatorDto,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que la solicitud existe y es de tipo cuenta-bancaria
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException(
          `Solicitud con ID ${requestId} no encontrada`,
        );
      }
      if (request.type !== 'cuenta-bancaria') {
        throw new BadRequestException(
          'El validador solo puede agregarse a solicitudes de Cuenta Bancaria',
        );
      }

      // Buscar si ya existe un validador
      let validator = await this.validatorRepo.findOne({
        where: { requestId },
      });

      if (validator) {
        // Actualizar existente
        Object.assign(validator, {
          ...createValidatorDto,
          dateOfBirth: new Date(createValidatorDto.dateOfBirth),
        });
        validator = await queryRunner.manager.save(
          BankAccountValidator,
          validator,
        );
      } else {
        // Crear nuevo
        validator = this.validatorRepo.create({
          requestId,
          ...createValidatorDto,
          dateOfBirth: new Date(createValidatorDto.dateOfBirth),
        });
        validator = await queryRunner.manager.save(
          BankAccountValidator,
          validator,
        );
      }

      await queryRunner.commitTransaction();
      return validator;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al crear/actualizar validador:', error);
      throw new InternalServerErrorException(
        'Error al crear/actualizar el validador. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async updateBankAccountValidator(
    requestId: number,
    updateValidatorDto: UpdateBankAccountValidatorDto,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que la solicitud existe
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException(
          `Solicitud con ID ${requestId} no encontrada`,
        );
      }

      // Buscar el validador
      const validator = await this.validatorRepo.findOne({
        where: { requestId },
      });
      if (!validator) {
        throw new NotFoundException(
          `Validador no encontrado para la solicitud ${requestId}`,
        );
      }

      // Actualizar campos
      if (updateValidatorDto.dateOfBirth) {
        updateValidatorDto.dateOfBirth = new Date(
          updateValidatorDto.dateOfBirth as any,
        ) as any;
      }
      Object.assign(validator, updateValidatorDto);

      const updatedValidator = await queryRunner.manager.save(
        BankAccountValidator,
        validator,
      );

      await queryRunner.commitTransaction();
      return updatedValidator;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al actualizar validador:', error);
      throw new InternalServerErrorException(
        'Error al actualizar el validador. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async deleteBankAccountValidator(requestId: number) {
    // Verificar que la solicitud existe
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }

    // Buscar el validador
    const validator = await this.validatorRepo.findOne({
      where: { requestId },
    });
    if (!validator) {
      throw new NotFoundException(
        `Validador no encontrado para la solicitud ${requestId}`,
      );
    }

    await this.validatorRepo.remove(validator);
    return { message: 'Validador eliminado correctamente' };
  }

  // ========== MÉTODOS ADICIONALES ==========

  async findAll(
    filters?: {
      status?: string;
      type?: string;
      clientId?: number;
      partnerId?: number;
      search?: string;
    },
    page: number = 1,
    limit: number = 10,
  ) {
    const queryBuilder = this.requestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.client', 'client')
      .leftJoinAndSelect('request.partner', 'partner');

    // Aplicar filtros básicos
    if (filters?.status) {
      queryBuilder.andWhere('request.status = :status', { status: filters.status });
    }
    if (filters?.type) {
      queryBuilder.andWhere('request.type = :type', { type: filters.type });
    }
    if (filters?.clientId) {
      queryBuilder.andWhere('request.clientId = :clientId', { clientId: filters.clientId });
    }
    if (filters?.partnerId) {
      queryBuilder.andWhere('request.partnerId = :partnerId', { partnerId: filters.partnerId });
    }

    // Aplicar búsqueda en nombre, email del cliente o partner
    if (filters?.search && filters.search.length > 0) {
      const searchPattern = `%${filters.search}%`;
      queryBuilder.andWhere(
        '(client.email ILIKE :search OR client.username ILIKE :search OR client.first_name ILIKE :search OR client.last_name ILIKE :search OR partner.email ILIKE :search OR partner.username ILIKE :search OR partner.first_name ILIKE :search OR partner.last_name ILIKE :search)',
        { search: searchPattern }
      );
    }

    // Ordenar por fecha de creación descendente
    queryBuilder.orderBy('request.createdAt', 'DESC');

    // Aplicar paginación
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Ejecutar consulta
    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getRequiredDocuments(
    type: 'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria',
    llcType?: 'single' | 'multi',
  ) {
    const where: any = { requestType: type };

    // Si es tipo LLC y se especifica llcType, filtrar por ese tipo
    if (
      (type === 'apertura-llc' || type === 'renovacion-llc') &&
      llcType
    ) {
      where.llcType = llcType;
    } else if (type === 'cuenta-bancaria') {
      // Para cuenta bancaria, llcType debe ser null
      where.llcType = null;
    }

      return this.requiredDocRepo.find({
        where,
        order: { order: 'ASC' },
      });
  }

  async delete(id: number, userId: number, userRole: string) {
    const request = await this.requestRepository.findOne({
      where: { id },
      relations: ['client', 'partner'],
    });

    if (!request) {
      throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
    }

    // Solo admin puede eliminar cualquier solicitud
    // Usuarios normales solo pueden eliminar sus propias solicitudes si están pendientes
    if (userRole !== 'admin') {
      // Verificar que el usuario es el cliente o partner de la solicitud
      const isOwner =
        request.clientId === userId || request.partnerId === userId;

      if (!isOwner) {
        throw new BadRequestException(
          'No tienes permiso para eliminar esta solicitud',
        );
      }

      // Solo se pueden eliminar solicitudes pendientes o solicitud-recibida
      if (request.status !== 'pendiente' && request.status !== 'solicitud-recibida') {
        throw new BadRequestException(
          'Solo se pueden eliminar solicitudes en estado pendiente o solicitud recibida',
        );
      }
    }

    // Eliminar la solicitud (las relaciones en cascada eliminarán los datos relacionados)
    await this.requestRepository.remove(request);

    return { message: 'Solicitud eliminada correctamente' };
  }

  /**
   * Aprobar una solicitud - cambia de 'solicitud-recibida' a 'en-proceso' con etapa inicial del blueprint
   */
  async approveRequest(id: number, approveDto: ApproveRequestDto) {
    const request = await this.requestRepository.findOne({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
    }

    if (request.status !== 'solicitud-recibida') {
      throw new BadRequestException(
        'Solo se pueden aprobar solicitudes en estado "Solicitud Recibida"',
      );
    }

    // Etapa inicial del blueprint según el tipo de solicitud
    let defaultStage = 'Apertura Confirmada';
    if (request.type === 'cuenta-bancaria') {
      defaultStage = 'Cuenta Bancaria Confirmada';
    } else if (request.type === 'renovacion-llc') {
      defaultStage = 'Renovación Confirmada';
    }
    
    const initialStage = approveDto.initialStage || defaultStage;

    // Actualizar estado y etapa
    request.status = 'en-proceso';
    request.stage = initialStage;
    if (approveDto.notes) {
      request.notes = approveDto.notes;
    }

    await this.requestRepository.save(request);

    this.logger.log(
      `Solicitud ${id} aprobada. Etapa inicial: ${initialStage}`,
    );

    return {
      message: 'Solicitud aprobada correctamente',
      request: {
        id: request.id,
        status: request.status,
        stage: request.stage,
      },
    };
  }

  /**
   * Rechazar una solicitud - cambia de 'solicitud-recibida' a 'rechazada'
   */
  async rejectRequest(id: number, rejectDto: RejectRequestDto) {
    const request = await this.requestRepository.findOne({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
    }

    if (request.status !== 'solicitud-recibida') {
      throw new BadRequestException(
        'Solo se pueden rechazar solicitudes en estado "Solicitud Recibida"',
      );
    }

    // Actualizar estado a rechazada
    request.status = 'rechazada';
    if (rejectDto.notes) {
      request.notes = rejectDto.notes;
    }

    await this.requestRepository.save(request);

    this.logger.log(`Solicitud ${id} rechazada`);

    return {
      message: 'Solicitud rechazada correctamente',
      request: {
        id: request.id,
        status: request.status,
      },
    };
  }

  /**
   * Obtener las etapas del blueprint para Apertura LLC
   */
  getBlueprintStages(): string[] {
    return [
      'Apertura Confirmada',
      'Filing Iniciado',
      'EIN Solicitado',
      'Operating Agreement',
      'BOI Enviado',
      'Cuenta Bancaria Confirmada',
      'Confirmación pago',
      'Apertura Activa',
      'Apertura Perdida',
      'Apertura Cuenta Bancaria',
    ];
  }

  /**
   * Obtener las etapas del blueprint para Cuenta Bancaria
   */
  getCuentaBancariaBlueprintStages(): string[] {
    return [
      'Cuenta Bancaria Confirmada',
      'Onboarding',
      // Las siguientes 2 etapas son especiales y se muestran condicionalmente:
      // 'Cuenta Bancaria Finalizada' - Solo se muestra si es el stage actual
      // 'Cuenta Bancaria Perdida' - Solo se muestra si es el stage actual (y ahí se queda)
    ];
  }
}

