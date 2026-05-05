import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { CommonModule } from '../../shared/common/common.module';
import { ClientCompanyProfile } from '../settings/entities/client-company-profile.entity';
import { InvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { Invoice } from './entities/invoice.entity';
import { InvoiceEvent } from './entities/invoice-event.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { InvoicePayment } from './entities/invoice-payment.entity';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      Invoice,
      InvoiceItem,
      InvoicePayment,
      InvoiceEvent,
      ClientCompanyProfile,
    ]),
  ],
  controllers: [InvoicingController],
  providers: [InvoicingService, InvoicePdfService, RolesGuard],
  exports: [InvoicingService],
})
export class InvoicingModule {}
