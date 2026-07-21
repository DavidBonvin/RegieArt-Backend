import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController, VenuesController } from './events.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [EventsController, VenuesController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
