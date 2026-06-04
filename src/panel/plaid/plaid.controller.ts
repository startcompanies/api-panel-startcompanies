import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { PlaidService } from './plaid.service';

@ApiTags('Panel - Plaid')
@Controller('panel/plaid')
@UseGuards(AuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class PlaidController {
  constructor(private readonly plaidService: PlaidService) {}

  @Get('status')
  @Roles('client')
  status(@Req() req: { user: { id: number } }) {
    return this.plaidService.getStatus(req.user.id);
  }

  @Post('link-token')
  @Roles('client')
  linkToken(
    @Req() req: { user: { id: number } },
    @Headers('x-tenant-host') tenantHost: string | undefined,
    @Body() body: { plaidItemId?: number },
  ) {
    return this.plaidService.createLinkToken(
      req.user.id,
      tenantHost,
      body?.plaidItemId,
    );
  }

  @Post('exchange')
  @Roles('client')
  exchange(
    @Req() req: { user: { id: number } },
    @Body()
    body: {
      publicToken: string;
      metadata?: {
        institution?: { institution_id?: string; name?: string };
        accounts?: Array<{ mask?: string }>;
      };
    },
  ) {
    return this.plaidService.exchangePublicToken(
      req.user.id,
      body.publicToken,
      body.metadata,
    );
  }

  @Get('items')
  @Roles('client')
  items(@Req() req: { user: { id: number } }) {
    return this.plaidService.listItems(req.user.id);
  }

  @Post('items/:id/sync')
  @Roles('client')
  sync(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.plaidService.syncItemForUser(req.user.id, id);
  }

  @Post('items/:id/disconnect')
  @Roles('client')
  disconnect(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.plaidService.disconnectItem(req.user.id, id);
  }
}

@ApiTags('Webhooks - Plaid')
@Controller('webhooks')
export class PlaidWebhookController {
  constructor(private readonly plaidService: PlaidService) {}

  @Post('plaid')
  @HttpCode(200)
  async plaidWebhook(@Body() body: Record<string, unknown>) {
    return this.plaidService.handleWebhook(body as Parameters<PlaidService['handleWebhook']>[0]);
  }
}
