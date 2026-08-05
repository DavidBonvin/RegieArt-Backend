import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '@regieart/types';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser = AuthenticatedUser>(
    err: Error | null,
    user: TUser | false,
    info: Error | null,
  ): TUser {
    if (err || !user) {
      // Log the raw JWT error so we can diagnose
      this.logger.warn(`JWT Validation failed — err: ${err?.message ?? 'none'}, info: ${JSON.stringify(info)}`);
      throw err || new UnauthorizedException('Invalid or missing authentication token');
    }
    return user;
  }
}
