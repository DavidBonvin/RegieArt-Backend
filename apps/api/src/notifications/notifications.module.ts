import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MessagesService } from './messages.service';
import { NotificationsController } from './notifications.controller';
import { MessagesController } from './messages.controller';
import { EmailService } from './email.service';

@Module({
  controllers: [NotificationsController, MessagesController],
  providers: [NotificationsService, MessagesService, EmailService],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
