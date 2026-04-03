import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Structured error payload returned by the HTTP API.
 */
export interface ApiErrorBody {
  message: string;
  hint: string;
  details?: string;
}

/**
 * Formats a developer-facing error message for startup and non-HTTP failures.
 */
export function formatDeveloperError(
  message: string,
  hint: string,
  details?: string,
): string {
  const detailText = details ? ` Details: ${details}` : '';
  return `${message} Hint: ${hint}${detailText}`;
}

/**
 * Creates the normalized API error payload.
 */
export function createApiErrorBody(
  message: string,
  hint: string,
  details?: string,
): ApiErrorBody {
  return {
    message,
    hint,
    ...(details ? { details } : {}),
  };
}

/**
 * Creates a `400 Bad Request` with a developer hint.
 */
export function badRequest(
  message: string,
  hint: string,
  details?: string,
): BadRequestException {
  return new BadRequestException(createApiErrorBody(message, hint, details));
}

/**
 * Creates a `404 Not Found` with a developer hint.
 */
export function notFound(
  message: string,
  hint: string,
  details?: string,
): NotFoundException {
  return new NotFoundException(createApiErrorBody(message, hint, details));
}

/**
 * Creates a `409 Conflict` with a developer hint.
 */
export function conflict(
  message: string,
  hint: string,
  details?: string,
): ConflictException {
  return new ConflictException(createApiErrorBody(message, hint, details));
}

/**
 * Creates a `501 Not Implemented` with a developer hint.
 */
export function notImplemented(
  message: string,
  hint: string,
  details?: string,
): NotImplementedException {
  return new NotImplementedException(
    createApiErrorBody(message, hint, details),
  );
}

/**
 * Creates a `503 Service Unavailable` with a developer hint.
 */
export function serviceUnavailable(
  message: string,
  hint: string,
  details?: string,
): ServiceUnavailableException {
  return new ServiceUnavailableException(
    createApiErrorBody(message, hint, details),
  );
}

/**
 * Creates a `500 Internal Server Error` with a developer hint.
 */
export function internalServerError(
  message: string,
  hint: string,
  details?: string,
): InternalServerErrorException {
  return new InternalServerErrorException(
    createApiErrorBody(message, hint, details),
  );
}

/**
 * Returns a fallback hint for exceptions that did not provide one explicitly.
 */
export function defaultHintForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'Check the request shape, route parameters, and JSON payload for invalid or missing values.';
    case HttpStatus.NOT_FOUND:
      return 'Verify that the referenced table, record, or route exists before retrying the request.';
    case HttpStatus.CONFLICT:
      return 'Check for duplicate unique values or broken relationships in the submitted data.';
    case HttpStatus.NOT_IMPLEMENTED:
      return 'Use a database engine that supports this capability, or avoid this endpoint for the current engine.';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'Verify that the database driver is installed and that the configured database server is reachable.';
    default:
      return 'Check the server logs for more detail and retry with a validated request payload.';
  }
}
