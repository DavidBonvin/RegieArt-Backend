import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser, PlatformRole } from '@regieart/types';
import { PLATFORM_ADMIN_REQUIRED } from '../decorators/platform-admin.decorator';

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN_REQUIRED, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const roles = request.user?.platformRoles ?? [];

    if (!roles.includes(PlatformRole.PLATFORM_ADMIN)) {
      throw new ForbiddenException('Droits administrateur de plateforme requis');
    }

    return true;
  }
}