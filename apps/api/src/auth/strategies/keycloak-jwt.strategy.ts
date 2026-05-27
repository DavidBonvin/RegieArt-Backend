import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { JwtPayload, AuthenticatedUser } from '@regieart/types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class KeycloakJwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const keycloakUrl = configService.get<string>('KEYCLOAK_URL');
    const realm = configService.get<string>('KEYCLOAK_REALM');
    const issuer = `${keycloakUrl}/realms/${realm}`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer: issuer,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
      }),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload) {
      throw new UnauthorizedException();
    }

    // Lazy provisioning: Find or create user
    const user = await this.prisma.user.upsert({
      where: { keycloakId: payload.sub },
      update: {
        // We could sync email/name changes here if we wanted
      },
      create: {
        keycloakId: payload.sub,
        email: payload.email,
        displayName: payload.name || payload.preferred_username || payload.email.split('@')[0],
        firstName: payload.given_name,
        lastName: payload.family_name,
      },
    });

    return {
      id: user.id,
      keycloakId: user.keycloakId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl || undefined,
    };
  }
}
