import type { Principal } from '@restaurant-os/types';
import type { AuthRateLimiter, AuthRequestContext, SessionRecord } from '../auth/contracts.js';
import type { EventSink } from '../contracts.js';

export type StaffStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'PENDING_INVITATION';
export type AccessScope = 'TENANT' | 'LOCATIONS';
export interface RoleRecord { id: string; tenantId: string; code: string; name: string; description: string; rank: number; permissions: string[]; }
export interface StaffRecord { id: string; tenantId: string; email: string; phone: string | null; displayName: string; status: StaffStatus; mfaRequired: boolean; accessScope: AccessScope; locationIds: string[]; roles: RoleRecord[]; invitationId: string | null; createdAt: Date; }
export interface InvitationRecord { id: string; userId: string; tenantId: string; email: string; displayName: string; expiresAt: Date; }
export interface InvitationAcceptance { userId: string; tenantId: string; mfaEnrollment?: { factorId: string }; }
export class StaffStoreError extends Error { constructor(public readonly code:'EMAIL_EXISTS'|'INVALID_SCOPE'|'INVALID_ROLE'){super(code);this.name='StaffStoreError';} }

export interface StaffStore {
  listStaff(tenantId: string): Promise<StaffRecord[]>; getStaff(tenantId: string, userId: string): Promise<StaffRecord | null>;
  listRoles(tenantId: string): Promise<RoleRecord[]>; listPermissions(): Promise<{ code: string; description: string }[]>;
  createInvitation(input: { tenantId: string; actorId: string; email: string; displayName: string; roleIds: string[]; accessScope: AccessScope; locationIds: string[]; tokenHash: string; expiresAt: Date }): Promise<InvitationRecord>;
  revokeInvitation(tenantId: string, invitationId: string, now: Date): Promise<boolean>;
  acceptInvitation(tokenHash: string, passwordHash: string, encryptedMfa: { ciphertext: string; iv: string; tag: string } | null, now: Date): Promise<InvitationAcceptance | null>;
  verifyInvitationMfa(factorId: string, codeVerifier: (encrypted: { ciphertext: string; iv: string; tag: string }) => boolean, now: Date): Promise<{ userId: string; tenantId: string } | null>;
  createMfaEnrollment(tenantId:string,userId:string,encrypted:{ciphertext:string;iv:string;tag:string},expiresAt:Date):Promise<string>;
  completeMfaEnrollment(tenantId:string,userId:string,factorId:string,codeVerifier:(encrypted:{ciphertext:string;iv:string;tag:string})=>boolean,now:Date):Promise<boolean>;
  updateProfile(tenantId: string, userId: string, displayName: string, accessScope: AccessScope, locationIds: string[], now: Date): Promise<boolean>;
  setStatus(tenantId: string, userId: string, status: 'ACTIVE' | 'SUSPENDED', now: Date): Promise<boolean>;
  assignRole(tenantId: string, userId: string, roleId: string, actorId: string, now: Date): Promise<'ASSIGNED' | 'EXISTS' | 'NOT_FOUND'>;
  removeRole(tenantId: string, userId: string, roleId: string, now: Date): Promise<boolean>;
  revokeAllSessions(tenantId: string, userId: string, now: Date): Promise<number>;
  revokeSession(tenantId: string, userId: string, sessionId: string, now: Date): Promise<boolean>;
  listSessions(tenantId: string, userId: string, now: Date): Promise<SessionRecord[]>;
}
export interface InvitationDeliveryMessage { invitationId: string; tenantId: string; email: string; token: string; invitationUrl: string; expiresAt: Date; requestId: string; }
export interface InvitationDeliveryProvider { deliver(message: InvitationDeliveryMessage): Promise<void>; }
export interface StaffServiceDependencies { store: StaffStore; events: EventSink; limiter: AuthRateLimiter; delivery: InvitationDeliveryProvider; tokenPepper: string; mfaEncryptionKey: string; invitationBaseUrl: string; }

export interface StaffController {
  list(actor: Principal): Promise<StaffRecord[]>; get(actor: Principal, userId: string): Promise<StaffRecord>; roles(actor: Principal): Promise<RoleRecord[]>; permissions(actor: Principal): Promise<{ code: string; description: string }[]>;
  invite(actor: Principal, input: { email: string; displayName: string; roleIds: string[]; accessScope: AccessScope; locationIds: string[] }, context: AuthRequestContext): Promise<{ invitationId: string; expiresAt: Date }>;
  revokeInvitation(actor: Principal, invitationId: string, context: AuthRequestContext): Promise<boolean>;
  acceptInvitation(input: { token: string; password: string }, context: AuthRequestContext): Promise<{ activated: boolean; mfaEnrollment?: { factorId: string; secret: string; otpauthUri: string } }>;
  completeInvitationMfa(input: { factorId: string; code: string }, context: AuthRequestContext): Promise<void>;
  beginMfaEnrollment(actor:Principal,context:AuthRequestContext):Promise<{factorId:string;secret:string;otpauthUri:string}>;
  completeMfaEnrollment(actor:Principal,input:{factorId:string;code:string},context:AuthRequestContext):Promise<void>;
  update(actor: Principal, userId: string, input: { displayName: string; accessScope: AccessScope; locationIds: string[] }, context: AuthRequestContext): Promise<void>;
  suspend(actor: Principal, userId: string, context: AuthRequestContext): Promise<void>; reactivate(actor: Principal, userId: string, context: AuthRequestContext): Promise<void>;
  assignRole(actor: Principal, userId: string, roleId: string, context: AuthRequestContext): Promise<void>; removeRole(actor: Principal, userId: string, roleId: string, context: AuthRequestContext): Promise<void>;
  sessions(actor: Principal, userId: string): Promise<SessionRecord[]>; revokeSession(actor: Principal, userId: string, sessionId: string, context: AuthRequestContext): Promise<boolean>; revokeAllSessions(actor: Principal, userId: string, context: AuthRequestContext): Promise<number>;
}
