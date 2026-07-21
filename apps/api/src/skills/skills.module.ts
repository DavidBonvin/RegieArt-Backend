import { Module } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { SkillCategoriesController } from './skills.controller';
import { UsersSkillsController } from './users-skills.controller';

@Module({
  controllers: [
    SkillCategoriesController, // GET POST DELETE /skill-categories
    UsersSkillsController,     // GET /users/search  GET POST DELETE /users/me/skills  GET /users/:id
  ],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
