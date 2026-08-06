import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

const mockConfig = {
  getOrThrow: (key: string) => {
    const map: Record<string, string> = {
      KEYCLOAK_URL: 'http://keycloak:8090',
      KEYCLOAK_REALM: 'regieart',
      KEYCLOAK_ADMIN_USER: 'admin',
      KEYCLOAK_ADMIN_PASSWORD: 'admin-pass',
    };
    if (!map[key]) throw new Error(`Configuration key "${key}" does not exist`);
    return map[key];
  },
  get: (key: string, defaultValue?: string) => {
    const map: Record<string, string> = { KEYCLOAK_PUBLIC_CLIENT_ID: 'regieart-mobile' };
    return map[key] ?? defaultValue;
  },
};

const validDto = {
  firstName: 'Jean',
  lastName: 'Dupont',
  email: 'jean@example.com',
  password: 'Secure1234',
};

function mockTokenFetch() {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ access_token: 'admin-token-xyz' }),
  });
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── Successful registration ────────────────────────────────

  describe('register — success', () => {
    it('calls Keycloak token endpoint then Admin users endpoint', async () => {
      mockTokenFetch();
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 201 });

      await expect(service.register(validDto)).resolves.toBeUndefined();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(fetchCall).toContain('/realms/master/protocol/openid-connect/token');

      const [usersUrl, usersOpts] = (global.fetch as jest.Mock).mock.calls[1];
      expect(usersUrl).toContain('/admin/realms/regieart/users');
      expect(usersOpts.headers.Authorization).toBe('Bearer admin-token-xyz');

      const body = JSON.parse(usersOpts.body);
      expect(body.email).toBe('jean@example.com');
      expect(body.firstName).toBe('Jean');
      expect(body.credentials[0].type).toBe('password');
    });
  });

  // ─── Duplicate email → 409 ──────────────────────────────────

  describe('register — duplicate email', () => {
    it('throws ConflictException when Keycloak returns 409', async () => {
      mockTokenFetch();
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 409 });

      await expect(service.register(validDto)).rejects.toThrow(ConflictException);
    });
  });

  // ─── Keycloak unreachable ────────────────────────────────────

  describe('register — Keycloak unreachable', () => {
    it('throws ServiceUnavailableException when token fetch throws', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(service.register(validDto)).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws ServiceUnavailableException when admin API fetch throws', async () => {
      mockTokenFetch();
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(service.register(validDto)).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ─── Unexpected Keycloak error ───────────────────────────────

  describe('register — unexpected Keycloak error', () => {
    it('throws InternalServerErrorException on unexpected status (e.g. 500)', async () => {
      mockTokenFetch();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(service.register(validDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ─── Login ───────────────────────────────────────────────────

  const loginDto = { email: 'jean@example.com', password: 'Secure1234' };
  const keycloakTokenBody = {
    access_token: 'eyJaccess',
    refresh_token: 'eyJrefresh',
    expires_in: 300,
    refresh_expires_in: 1800,
    token_type: 'Bearer',
  };

  describe('login — success', () => {
    it('returns accessToken + refreshToken on valid credentials', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => keycloakTokenBody,
      });

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('eyJaccess');
      expect(result.refreshToken).toBe('eyJrefresh');
      expect(result.expiresIn).toBe(300);
      expect(result.refreshExpiresIn).toBe(1800);

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/realms/regieart/protocol/openid-connect/token');
      const body = new URLSearchParams(opts.body as string);
      expect(body.get('client_id')).toBe('regieart-mobile');
      expect(body.get('grant_type')).toBe('password');
    });
  });

  describe('login — wrong credentials', () => {
    it('throws UnauthorizedException when Keycloak returns 401', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login — Keycloak unreachable', () => {
    it('throws ServiceUnavailableException when fetch throws', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(service.login(loginDto)).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ─── Refresh ─────────────────────────────────────────────────

  const refreshDto = { refreshToken: 'eyJrefresh-token-long-enough' };

  describe('refresh — success', () => {
    it('returns new tokens when refresh_token is valid', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => keycloakTokenBody,
      });

      const result = await service.refresh(refreshDto);

      expect(result.accessToken).toBe('eyJaccess');
      expect(result.refreshToken).toBe('eyJrefresh');

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/realms/regieart/protocol/openid-connect/token');
      const body = new URLSearchParams(opts.body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe(refreshDto.refreshToken);
    });
  });

  describe('refresh — expired token', () => {
    it('throws UnauthorizedException when Keycloak returns 400', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 400 });

      await expect(service.refresh(refreshDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh — Keycloak unreachable', () => {
    it('throws ServiceUnavailableException when fetch throws', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(service.refresh(refreshDto)).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
