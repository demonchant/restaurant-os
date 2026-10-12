export class AppError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string, public readonly details?: { path?: string; message: string }[]) { super(message); this.name = 'AppError'; }
}
export class AuthenticationError extends AppError { constructor() { super(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'); } }
export class ConflictError extends AppError { constructor(message: string) { super(409, 'CONFLICT', message); } }
