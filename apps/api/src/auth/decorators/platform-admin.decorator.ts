import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ADMIN_REQUIRED = 'platform_admin_required';

export const PlatformAdmin = () => SetMetadata(PLATFORM_ADMIN_REQUIRED, true);