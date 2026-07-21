import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkillsService } from './skills.service';
import { CreateSkillCategoryDto } from './dto/create-skill-category.dto';

/**
 * SkillCategoriesController — Catálogo global de habilidades/instrumentos.
 * Cualquier usuario autenticado puede leer; crear/eliminar categorías
 * está abierto a usuarios autenticados (no hay rol global admin aún).
 */
@UseGuards(JwtAuthGuard)
@Controller('skill-categories')
export class SkillCategoriesController {
  constructor(private readonly skillsService: SkillsService) {}

  // GET /skill-categories
  @Get()
  findAll() {
    return this.skillsService.getCategories();
  }

  // POST /skill-categories
  @Post()
  create(@Body() dto: CreateSkillCategoryDto) {
    return this.skillsService.createCategory(dto);
  }

  // DELETE /skill-categories/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.skillsService.deleteCategory(id);
  }
}

