import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SongsService } from './songs.service';
import { CreateSongDto } from './dto/create-song.dto';
import { UpdateSongDto } from './dto/update-song.dto';
import { SearchSongsDto } from './dto/search-songs.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';

@UseGuards(JwtAuthGuard)
@Controller('songs')
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  // POST /songs
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSongDto) {
    return this.songsService.create(user.id, dto);
  }

  // GET /songs?orgId=&search=&genre=&page=&limit=
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchSongsDto) {
    return this.songsService.findAll(user.id, query);
  }

  // GET /songs/:id — detalle + assets vinculados (partituras, pistas)
  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.songsService.findOne(user.id, id);
  }

  // PATCH /songs/:id
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSongDto,
  ) {
    return this.songsService.update(user.id, id, dto);
  }

  // DELETE /songs/:id — soft delete
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.songsService.remove(user.id, id);
  }
}
