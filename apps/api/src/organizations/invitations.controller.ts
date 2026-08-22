import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { SendInvitationDto } from './dto/send-invitation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';

@UseGuards(JwtAuthGuard)
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // ═══════════════════════════════════════════════════════════
  // SENDER SIDE — Admin/Owner of the org
  // ═══════════════════════════════════════════════════════════

  // POST /organizations/:orgId/invitations — send targeted invitation
  @Post('organizations/:orgId/invitations')
  sendInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orgId') orgId: string,
    @Body() dto: SendInvitationDto,
  ) {
    return this.invitationsService.sendInvitation(user.id, orgId, dto);
  }

  // GET /organizations/:orgId/invitations — list org invitations (admin view)
  @Get('organizations/:orgId/invitations')
  getOrgInvitations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orgId') orgId: string,
  ) {
    return this.invitationsService.getOrgInvitations(user.id, orgId);
  }

  // DELETE /organizations/:orgId/invitations/:id — revoke
  @Delete('organizations/:orgId/invitations/:id')
  @HttpCode(HttpStatus.OK)
  revokeInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orgId') orgId: string,
    @Param('id') invitationId: string,
  ) {
    return this.invitationsService.revokeInvitation(user.id, orgId, invitationId);
  }

  // ═══════════════════════════════════════════════════════════
  // RECEIVER SIDE — The invited user
  // ═══════════════════════════════════════════════════════════

  // GET /invitations/me — my pending invitations
  @Get('invitations/me')
  getMyInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.invitationsService.getMyInvitations(user.id);
  }

  // GET /invitations/:token — details before accepting (also works for non-members)
  @Get('invitations/:token')
  getInvitationByToken(@Param('token') token: string) {
    return this.invitationsService.getInvitationByToken(token);
  }

  // POST /invitations/:token/accept
  @Post('invitations/:token/accept')
  @HttpCode(HttpStatus.OK)
  acceptInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ) {
    return this.invitationsService.acceptInvitation(user.id, token);
  }

  // POST /invitations/:token/reject
  @Post('invitations/:token/reject')
  @HttpCode(HttpStatus.OK)
  rejectInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ) {
    return this.invitationsService.rejectInvitation(user.id, token);
  }
}
