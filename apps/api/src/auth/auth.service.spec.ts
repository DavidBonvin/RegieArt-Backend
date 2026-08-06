import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  InternalServerErrorException,
  ServiceUnavailableException,
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
    return map[key];
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
});
