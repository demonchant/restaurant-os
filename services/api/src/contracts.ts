import type { Principal } from '@restaurant-os/types';
import type { AuthenticationController } from './auth/contracts.js';
import type { StaffController } from './staff/contracts.js';
import type { OrganizationController } from './organization/contracts.js';
import type { MenuController } from './menu/contracts.js';

export interface SessionStore { findByTokenHash(hash: string, now: Date): Promise<Principal | null>; }
export interface EventContext { requestId: string; tenantId?: string; actorId?: string; metadata?: Record<string, unknown>; }
export interface EventSink {
  audit(action: string, resourceType: string, resourceId: string | undefined, context: EventContext): Promise<void>;
  security(eventType: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', context: EventContext): Promise<void>;
}
export interface ReadinessProbe { check(): Promise<void>; }
export interface IdempotencyResult { status: number; body: unknown; requestHash: string; }
export interface IdempotencyScope { tenantId: string; actorId: string; action: string; keyHash: string; }
export type IdempotencyClaim =
  | { state: 'acquired' }
  | { state: 'replay'; result: IdempotencyResult }
  | { state: 'conflict' }
  | { state: 'in_progress' };
export interface IdempotencyStore {
  claim(scope: IdempotencyScope, requestHash: string): Promise<IdempotencyClaim>;
  complete(scope: IdempotencyScope, result: IdempotencyResult): Promise<void>;
}
export interface ApiDependencies {
  sessions: SessionStore; events: EventSink; readiness: ReadinessProbe; idempotency: IdempotencyStore; authentication: AuthenticationController;
  staff: StaffController; organization: OrganizationController; menu?: MenuController;
  tokenPepper: string; cookie: { secure: boolean; domain?: string };
}
