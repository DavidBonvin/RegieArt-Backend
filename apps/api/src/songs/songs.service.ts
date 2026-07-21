import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSongDto } from './dto/create-song.dto';
import { UpdateSongDto } from './dto/update-song.dto';
import { SearchSongsDto } from './dto/search-songs.dto';
import { MemberRole } from '@regieart/types';

@Injectable()
export class SongsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateSongDto) {
    await this.requireAdminOrOwner(userId, dto.orgId);

    return this.prisma.song.create({
      data: {
        orgId: dto.orgId,
        title: dto.title,
        composer: dto.composer,
        arranger: dto.arranger,
        genre: dto.genre,
        musicalKey: dto.musicalKey,
        tempo: dto.tempo,
        durationSeconds: dto.durationSeconds,
        notes: dto.notes,
        createdById: userId,
      },
    });
  }

  async findAll(userId: string, query: SearchSongsDto) {
    const { orgId, search, genre, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    // Si viene orgId, verificar membresía
    if (orgId) {
      await this.requireMembership(userId, orgId);
    } else {
      // Sin orgId: devuelve canciones de todas las orgs del usuario
    }

    const where: any = {
      deletedAt: null,
      isActive: true,
      ...(orgId && { orgId }),
      ...(genre && { genre }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { composer: { contains: search, mode: 'insensitive' } },
          { arranger: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [songs, total] = await this.prisma.$transaction([
      this.prisma.song.findMany({
        where,
        skip,
        take: limit,
        orderBy: { title: 'asc' },
      }),
      this.prisma.song.count({ where }),
    ]);

    return { songs, total, page, limit };
  }

  async findOne(userId: string, id: string) {
    const song = await this.prisma.song.findFirst({
      where: { id, deletedAt: null },
      include: {
        assets: {
          where: { deletedAt: null, status: { in: ['CONFIRMED', 'READY'] } },
          select: {
            id: true,
            assetType: true,
            displayName: true,
            originalName: true,
            contentType: true,
            sizeBytes: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!song) throw new NotFoundException('Song not found');
    await this.requireMembership(userId, song.orgId);
    return song;
  }

  async update(userId: string, id: string, dto: UpdateSongDto) {
    const song = await this.prisma.song.findFirst({ where: { id, deletedAt: null } });
    if (!song) throw new NotFoundException('Song not found');
    await this.requireAdminOrOwner(userId, song.orgId);

    return this.prisma.song.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    const song = await this.prisma.song.findFirst({ where: { id, deletedAt: null } });
    if (!song) throw new NotFoundException('Song not found');
    await this.requireAdminOrOwner(userId, song.orgId);

    await this.prisma.song.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return { message: 'Song deleted successfully' };
  }

  // ─── HELPERS ─────────────────────────────────────────────────

  private async requireMembership(userId: string, orgId: string) {
    const m = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!m) throw new ForbiddenException('You are not a member of this organization');
    return m;
  }

  private async requireAdminOrOwner(userId: string, orgId: string) {
    const m = await this.requireMembership(userId, orgId);
    if (m.role !== MemberRole.OWNER && m.role !== MemberRole.ADMIN) {
      throw new ForbiddenException('Admin or Owner role required');
    }
    return m;
  }
}
