import { Controller, Get, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.id);
  }

  // Returns avatar and banner URLs for the authenticated user.
  // Use this endpoint to populate the profile header without fetching full membership data.
  @Get('me/profile-urls')
  getMyProfileUrls(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfileUrls(user.id);
  }

  // Returns avatar and banner URLs for any user by ID.
  // Useful for showing other members' profile images inside an organization.
  @Get(':id/profile-urls')
  getProfileUrls(@Param('id') id: string) {
    return this.usersService.getProfileUrls(id);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user.id, updateUserDto);
  }
}
