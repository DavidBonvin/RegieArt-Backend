import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { KeycloakJwtStrategy } from './strategies/keycloak-jwt.strategy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PlatformAdminGuard } from './guards/platform-admin.guard';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AuthController],
  providers: [KeycloakJwtStrategy, AuthService, PlatformAdminGuard],
  exports: [PassportModule, PlatformAdminGuard],
})
export class AuthModule {}
