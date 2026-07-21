import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';
import { SkillsService } from './skills.service';
import { AddUserSkillDto } from './dto/add-user-skill.dto';
import { SearchUsersDto } from './dto/search-users.dto';

/**
 * UsersSkillsController — Habilidades por usuario y búsqueda de músicos.
 *
 * Comparte prefijo /users con UsersController (users.module).
 * NestJS fusiona las rutas — las estáticas (/search, /me/skills)
 * se declaran ANTES que las paramétricas (/:id) para evitar conflictos.
 */
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersSkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  // GET /users/search?skill=&city=&orgId=&q=&page=&limit=
  @Get('search')
  search(@Query() query: SearchUsersDto) {
    return this.skillsService.searchUsers(query);
  }

  // GET /users/me/skills
  @Get('me/skills')
  getMySkills(@CurrentUser() user: AuthenticatedUser) {
    return this.skillsService.getUserSkills(user.id);
  }

  // POST /users/me/skills
  @Post('me/skills')
  addSkill(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddUserSkillDto) {
    return this.skillsService.addSkill(user.id, dto);
  }

  // DELETE /users/me/skills/:skillId
  @Delete('me/skills/:skillId')
  @HttpCode(HttpStatus.OK)
  removeSkill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('skillId') skillId: string,
  ) {
    return this.skillsService.removeSkill(user.id, skillId);
  }

  // GET /users/:id — perfil público (sin email ni teléfono)
  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.skillsService.getPublicProfile(id);
  }

  // GET /users/:id/skills
  @Get(':id/skills')
  getUserSkills(@Param('id') id: string) {
    return this.skillsService.getUserSkills(id);
  }
}
