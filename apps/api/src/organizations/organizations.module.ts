import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { InvitationsService } from './invitations.service';
import { InvitationsController } from './invitations.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [OrganizationsController, InvitationsController],
  providers: [OrganizationsService, InvitationsService],
  exports: [OrganizationsService, InvitationsService],
})
export class OrganizationsModule {}
