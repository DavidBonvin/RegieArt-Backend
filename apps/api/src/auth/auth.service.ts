import {
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

interface KeycloakTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly config: ConfigService) {}

  async register(dto: RegisterDto): Promise<void> {
    const adminToken = await this.getServiceAccountToken();
    await this.createKeycloakUser(adminToken, dto);
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const keycloakUrl = this.config.getOrThrow<string>('KEYCLOAK_URL');
    const realm = this.config.getOrThrow<string>('KEYCLOAK_REALM');
    // Use the public mobile client which has directAccessGrantsEnabled: true
    const clientId = this.config.get<string>('KEYCLOAK_PUBLIC_CLIENT_ID', 'regieart-mobile');

    const url = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: clientId,
          username: dto.email,
          password: dto.password,
        }),
      });
    } catch (err) {
      this.logger.error(`Keycloak unreachable on login: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Authentication service unavailable');
    }

    if (res.status === 401) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!res.ok) {
      this.logger.error(`Keycloak login returned ${res.status}`);
      throw new ServiceUnavailableException('Authentication service unavailable');
    }

    const data = (await res.json()) as KeycloakTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      refreshExpiresIn: data.refresh_expires_in,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────

  private async getServiceAccountToken(): Promise<string> {
    const keycloakUrl = this.config.getOrThrow<string>('KEYCLOAK_URL');
    const adminUser = this.config.getOrThrow<string>('KEYCLOAK_ADMIN_USER');
    const adminPassword = this.config.getOrThrow<string>('KEYCLOAK_ADMIN_PASSWORD');

    // Use admin-cli on master realm — works regardless of regieart-api bearerOnly flag
    const url = `${keycloakUrl}/realms/master/protocol/openid-connect/token`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: 'admin-cli',
          username: adminUser,
          password: adminPassword,
        }),
      });
    } catch (err) {
      this.logger.error(`Keycloak unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Authentication service unavailable');
    }

    if (!res.ok) {
      this.logger.error(`Keycloak admin token endpoint returned ${res.status}`);
      throw new ServiceUnavailableException('Authentication service unavailable');
    }

    const data = (await res.json()) as KeycloakTokenResponse;
    return data.access_token;
  }

  private async createKeycloakUser(adminToken: string, dto: RegisterDto): Promise<void> {
    const keycloakUrl = this.config.getOrThrow<string>('KEYCLOAK_URL');
    const realm = this.config.getOrThrow<string>('KEYCLOAK_REALM');

    const url = `${keycloakUrl}/admin/realms/${realm}/users`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          username: dto.email,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          enabled: true,
          emailVerified: false,
          credentials: [
            { type: 'password', value: dto.password, temporary: false },
          ],
        }),
      });
    } catch (err) {
      this.logger.error(`Keycloak Admin API unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Authentication service unavailable');
    }

    if (res.status === 201) return; // user created successfully

    if (res.status === 409) {
      throw new ConflictException('An account with this email already exists');
    }

    // Log body to diagnose permission/config issues without exposing to client
    const errorBody = await res.text().catch(() => '(unreadable)');
    this.logger.error(`Keycloak user creation failed — status: ${res.status}, body: ${errorBody}`);
    throw new InternalServerErrorException('Could not create account. Please try again.');
  }
}
