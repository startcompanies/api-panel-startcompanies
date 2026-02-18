import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// UserPreferences y ProcessConfig ya no se usan - el frontend usa localStorage
import { User } from '../../shared/user/entities/user.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // Métodos de UserPreferences y ProcessConfig eliminados - no se usan desde el frontend
  // El frontend guarda estas configuraciones en localStorage
}

