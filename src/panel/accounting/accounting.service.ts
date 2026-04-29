import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { BankImport } from './entities/bank-import.entity';
import { BankTransaction } from './entities/bank-transaction.entity';
import { PlSnapshot } from './entities/pl-snapshot.entity';

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(BankImport)
    private readonly importsRepo: Repository<BankImport>,
    @InjectRepository(BankTransaction)
    private readonly txRepo: Repository<BankTransaction>,
    @InjectRepository(PlSnapshot)
    private readonly snapshotsRepo: Repository<PlSnapshot>,
  ) {}

  async importCsv(body: { bankAccountId: number; importedByUserId: number; fileName: string; csv: string }) {
    const lines = (body.csv || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !!line);
    const dataLines = lines.slice(1);
    const bankImport = await this.importsRepo.save(
      this.importsRepo.create({
        bankAccountId: body.bankAccountId,
        importedByUserId: body.importedByUserId,
        fileName: body.fileName || 'import.csv',
        rowsCount: dataLines.length,
      }),
    );
    let inserted = 0;
    for (const line of dataLines) {
      const [txDate, description, amountRaw] = line.split(',');
      const fingerprint = createHash('sha1').update(`${txDate}|${description}|${amountRaw}`).digest('hex');
      const exists = await this.txRepo.findOne({ where: { fingerprint } });
      if (exists) continue;
      await this.txRepo.save(
        this.txRepo.create({
          bankImportId: bankImport.id,
          txDate,
          description,
          amount: Number(amountRaw || 0),
          fingerprint,
        }),
      );
      inserted += 1;
    }
    return { importId: bankImport.id, rowsParsed: dataLines.length, rowsInserted: inserted };
  }

  async profitAndLoss(fromDate: string, toDate: string) {
    const rows = await this.txRepo
      .createQueryBuilder('tx')
      .where('tx.tx_date BETWEEN :fromDate AND :toDate', { fromDate, toDate })
      .getMany();
    const income = rows.filter((r) => Number(r.amount) > 0).reduce((a, c) => a + Number(c.amount), 0);
    const expense = rows.filter((r) => Number(r.amount) < 0).reduce((a, c) => a + Math.abs(Number(c.amount)), 0);
    const net = income - expense;
    await this.snapshotsRepo.save(
      this.snapshotsRepo.create({
        fromDate,
        toDate,
        incomeTotal: income,
        expenseTotal: expense,
        netTotal: net,
      }),
    );
    return { fromDate, toDate, income, expense, net };
  }
}

