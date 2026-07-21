import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MessagesService } from './messages.service';
import { NotificationsController } from './notifications.controller';
import { MessagesController } from './messages.controller';

@Module({
  controllers: [NotificationsController, MessagesController],
  providers: [NotificationsService, MessagesService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
