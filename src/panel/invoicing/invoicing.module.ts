import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';
import { Invoice } from './entities/invoice.entity';
import { InvoiceEvent } from './entities/invoice-event.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { InvoicePayment } from './entities/invoice-payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, InvoiceItem, InvoicePayment, InvoiceEvent])],
  controllers: [InvoicingController],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}

