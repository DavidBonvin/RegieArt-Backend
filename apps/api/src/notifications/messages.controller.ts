import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  // POST /messages
  @Post()
  send(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMessageDto) {
    return this.messagesService.send(user.id, dto);
  }

  // GET /messages/conversations
  @Get('conversations')
  getConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.getConversations(user.id);
  }

  // GET /messages/conversations/:userId?page=&limit=
  @Get('conversations/:userId')
  getConversationWith(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') partnerId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getConversationWith(
      user.id,
      partnerId,
      page ? +page : 1,
      limit ? +limit : 30,
    );
  }

  // PATCH /messages/:id/read
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.messagesService.markRead(user.id, id);
  }
}
