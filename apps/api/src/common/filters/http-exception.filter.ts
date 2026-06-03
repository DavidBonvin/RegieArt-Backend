import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { ErrorResponse } from '@regieart/types';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const { message, details } = this.extractMessage(exception);

    this.logger.error(
      `${request.method} ${request.url} ${status} - ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    if (status >= 500) {
      Sentry.captureException(exception);
    }

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: status.toString(),
        message,
        ...(details !== undefined && { details }),
      },
    };

    response.status(status).json(errorResponse);
  }

  // ValidationPipe wraps field errors in BadRequestException with a response
  // shaped like `{ message: string[], error, statusCode }`. We surface the
  // array as `details` so clients can render per-field feedback.
  private extractMessage(exception: unknown): { message: string; details?: unknown } {
    if (!(exception instanceof HttpException)) {
      return { message: 'Internal server error' };
    }

    const response = exception.getResponse();

    if (typeof response === 'string') {
      return { message: response };
    }

    if (response && typeof response === 'object') {
      const payload = response as { message?: unknown; error?: unknown };

      if (Array.isArray(payload.message)) {
        return {
          message: 'Validation failed',
          details: payload.message,
        };
      }

      if (typeof payload.message === 'string') {
        return { message: payload.message };
      }
    }

    return { message: exception.message };
  }
}
