import { Module } from '@nestjs/common';
import { ReusableElementsController } from './reusable-elements.controller';
import { ReusableElementsService } from './reusable-elements.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReusableElement } from './entities/reusable-element.entity';
import { HandleExceptionsService } from 'src/shared/common/common.service';

@Module({
  controllers: [ReusableElementsController],
  providers: [ReusableElementsService, HandleExceptionsService],
  imports: [TypeOrmModule.forFeature([ReusableElement])],
})
export class ReusableElementsModule {}

