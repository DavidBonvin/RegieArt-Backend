import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // Returns resolved avatar and banner URLs for a user.
  // Used by GET /users/:id/profile-urls and GET /users/me/profile-urls.
  async getProfileUrls(targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, displayName: true, avatarUrl: true, bannerUrl: true },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      userId: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      bannerUrl: user.bannerUrl ?? null,
    };
  }

  // Called after confirming a user-avatar or user-banner upload.
  // Updates the canonical URL on the user record so it's always accessible
  // from GET /users/me without extra storage queries.
  async updateProfileImageUrl(userId: string, field: 'avatarUrl' | 'bannerUrl', url: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { [field]: url },
    });
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: updateUserDto,
    });
  }
}
