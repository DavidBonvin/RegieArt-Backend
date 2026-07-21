import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CreateInviteLinkDto } from './dto/create-invite-link.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';

@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // ═══════════════════════════════════════════════════════════
  // ORGANIZACIONES CRUD
  // ═══════════════════════════════════════════════════════════

  // POST /organizations
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createOrganizationDto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(user.id, createOrganizationDto);
  }

  // GET /organizations — mis organizaciones
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.findAll(user.id);
  }

  // GET /organizations/:id
  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizationsService.findOne(user.id, id);
  }

  // PATCH /organizations/:id
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(user.id, id, updateOrganizationDto);
  }

  // DELETE /organizations/:id — soft delete (OWNER only)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizationsService.remove(user.id, id);
  }

  // ═══════════════════════════════════════════════════════════
  // MEMBERS
  // ═══════════════════════════════════════════════════════════

  // GET /organizations/:id/members
  @Get(':id/members')
  getMembers(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizationsService.getMembers(user.id, id);
  }

  // PATCH /organizations/:orgId/members/:memberId/role
  @Patch(':orgId/members/:memberId/role')
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
    @Body() updateMemberRoleDto: UpdateMemberRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(user.id, orgId, memberId, updateMemberRoleDto);
  }

  // DELETE /organizations/:orgId/members/:userId — expulsar o salir
  @Delete(':orgId/members/:userId')
  @HttpCode(HttpStatus.OK)
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
  ) {
    return this.organizationsService.removeMember(user.id, orgId, userId);
  }

  // ═══════════════════════════════════════════════════════════
  // INVITE LINKS
  // ═══════════════════════════════════════════════════════════

  // POST /organizations/:id/invite-links
  @Post(':id/invite-links')
  createInviteLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() createInviteLinkDto: CreateInviteLinkDto,
  ) {
    return this.organizationsService.createInviteLink(user.id, id, createInviteLinkDto);
  }

  // GET /organizations/:id/invite-links
  @Get(':id/invite-links')
  getInviteLinks(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.organizationsService.getInviteLinks(user.id, id);
  }

  // DELETE /organizations/:id/invite-links/:linkId
  @Delete(':id/invite-links/:linkId')
  @HttpCode(HttpStatus.OK)
  revokeInviteLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ) {
    return this.organizationsService.revokeInviteLink(user.id, id, linkId);
  }

  // POST /organizations/join/:token — cualquier miembro autenticado puede usar el link
  @Post('join/:token')
  @HttpCode(HttpStatus.OK)
  joinByToken(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.organizationsService.joinByToken(user.id, token);
  }
}
