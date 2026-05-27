import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { KeycloakJwtStrategy } from './strategies/keycloak-jwt.strategy';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [KeycloakJwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
