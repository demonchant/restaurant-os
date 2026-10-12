import { encryptSecret, hashPassword } from '@restaurant-os/auth';
import type { EventContext, EventSink } from '../src/contracts.js';
import type { AuthRateLimiter, AuthServiceDependencies, AuthStore, IdentityUser, MfaChallengeRecord, MfaFactorRecord, NewSession, OtpDeliveryMessage, OtpRecord, OtpPurpose, SessionRecord, TenantIdentity } from '../src/auth/contracts.js';
import { AuthenticationService } from '../src/auth/service.js';

export class MemoryAuthStore implements AuthStore {
  tenants = new Map<string, TenantIdentity>([['pinchichi', { id: '11111111-1111-4111-8111-111111111111', slug: 'pinchichi', status: 'ACTIVE' }]]);
  users = new Map<string, IdentityUser>(); otps = new Map<string, OtpRecord>(); sessions = new Map<string, NewSession & { revokedAt: Date | null; createdAt: Date; lastSeenAt: Date }>();
  mfaChallenges = new Map<string, MfaChallengeRecord>(); mfaFactors = new Map<string, MfaFactorRecord>();
  async findTenantBySlug(slug: string) { return this.tenants.get(slug) ?? null; }
  async findRecentOtp(tenantId: string, targetPhone: string, purpose: OtpPurpose) { return [...this.otps.values()].filter((item) => item.tenantId === tenantId && item.targetPhone === targetPhone && item.purpose === purpose && !item.consumedAt).sort((a,b) => b.resendAfter.getTime()-a.resendAfter.getTime())[0] ?? null; }
  async createOtp(input: Omit<OtpRecord, 'id' | 'attempts' | 'consumedAt'>) { const id=crypto.randomUUID(); this.otps.set(id,{...input,id,attempts:0,consumedAt:null}); return id; }
  async setOtpDeliveryStatus() { return Promise.resolve(); }
  async getOtp(id: string) { return this.otps.get(id) ?? null; }
  async recordOtpFailure(id: string, now: Date) { const item=this.otps.get(id); if(!item||item.consumedAt||item.expiresAt<=now||item.attempts>=item.maxAttempts)return null; item.attempts+=1; return item.maxAttempts-item.attempts; }
  async consumeOtp(id: string, now: Date) { const item=this.otps.get(id); if(!item||item.consumedAt||item.expiresAt<=now||item.attempts>=item.maxAttempts)return null; item.consumedAt=now; return item; }
  async findOrCreateCustomer(tenantId: string, phone: string) { const existing=[...this.users.values()].find((item)=>item.tenantId===tenantId&&item.phone===phone); if(existing)return existing; const user:IdentityUser={id:crypto.randomUUID(),tenantId,kind:'CUSTOMER',status:'ACTIVE',phone,email:null,passwordHash:null,mfaRequired:false}; this.users.set(user.id,user); return user; }
  async findStaffByEmail(tenantId: string,email:string){return [...this.users.values()].find((item)=>item.tenantId===tenantId&&item.kind==='STAFF'&&item.email===email)??null;}
  async findUserById(tenantId:string,userId:string){const user=this.users.get(userId);return user?.tenantId===tenantId?user:null;}
  async createSession(input:NewSession){this.sessions.set(input.id,{...input,revokedAt:null,createdAt:new Date(),lastSeenAt:new Date()});}
  async revokeSession(tenantId:string,userId:string,sessionId:string,now:Date){const session=this.sessions.get(sessionId);if(!session||session.tenantId!==tenantId||session.userId!==userId||session.revokedAt)return false;session.revokedAt=now;return true;}
  async revokeOtherSessions(tenantId:string,userId:string,currentSessionId:string,now:Date){let count=0;for(const session of this.sessions.values())if(session.tenantId===tenantId&&session.userId===userId&&session.id!==currentSessionId&&!session.revokedAt){session.revokedAt=now;count+=1;}return count;}
  async revokeAllSessions(tenantId:string,userId:string,now:Date){let count=0;for(const session of this.sessions.values())if(session.tenantId===tenantId&&session.userId===userId&&!session.revokedAt){session.revokedAt=now;count+=1;}return count;}
  async listSessions(tenantId:string,userId:string,now:Date):Promise<SessionRecord[]>{return [...this.sessions.values()].filter((item)=>item.tenantId===tenantId&&item.userId===userId&&item.expiresAt>now).map((item)=>({id:item.id,deviceLabel:item.deviceLabel,lastSeenAt:item.lastSeenAt,createdAt:item.createdAt,expiresAt:item.expiresAt,revokedAt:item.revokedAt}));}
  async updateCustomerPhoneAndRevokeOthers(tenantId:string,userId:string,phone:string,currentSessionId:string,now:Date){const user=await this.findUserById(tenantId,userId);if(!user||user.kind!=='CUSTOMER'||user.status!=='ACTIVE')throw new Error('update failed');if([...this.users.values()].some((item)=>item.tenantId===tenantId&&item.phone===phone&&item.id!==userId))throw new Error('phone conflict');user.phone=phone;await this.revokeOtherSessions(tenantId,userId,currentSessionId,now);}
  async updatePasswordAndRevokeSessions(tenantId:string,userId:string,passwordHash:string,now:Date){const user=await this.findUserById(tenantId,userId);if(!user||user.kind!=='STAFF'||user.status!=='ACTIVE')throw new Error('update failed');user.passwordHash=passwordHash;await this.revokeAllSessions(tenantId,userId,now);}
  async createMfaChallenge(tenantId:string,userId:string,expiresAt:Date){const id=crypto.randomUUID();this.mfaChallenges.set(id,{id,tenantId,userId,attempts:0,maxAttempts:5,expiresAt,consumedAt:null});return id;}
  async getMfaChallenge(id:string){return this.mfaChallenges.get(id)??null;}
  async recordMfaFailure(id:string,now:Date){const item=this.mfaChallenges.get(id);if(!item||item.consumedAt||item.expiresAt<=now||item.attempts>=item.maxAttempts)return null;item.attempts+=1;return item.maxAttempts-item.attempts;}
  async consumeMfaChallenge(id:string,now:Date){const item=this.mfaChallenges.get(id);if(!item||item.consumedAt||item.expiresAt<=now||item.attempts>=item.maxAttempts)return null;item.consumedAt=now;return item;}
  async getVerifiedMfaFactor(tenantId:string,userId:string){return this.mfaFactors.get(`${tenantId}:${userId}`)??null;}
}

export class MemoryDelivery {
  messages: OtpDeliveryMessage[]=[]; fail=false;
  async deliver(message:OtpDeliveryMessage){if(this.fail)throw new Error('delivery unavailable');this.messages.push(message);}
  latest(){const message=this.messages.at(-1);if(!message)throw new Error('No delivered OTP');return message;}
}
export class MemoryLimiter implements AuthRateLimiter {
  counts=new Map<string,number>();
  async consume(bucket:string,subject:string,limit:number){const key=`${bucket}:${subject}`;const count=(this.counts.get(key)??0)+1;this.counts.set(key,count);return count<=limit;}
}
export class MemoryEvents implements EventSink {
  audits:{action:string;context:EventContext}[]=[];securityEvents:{eventType:string;context:EventContext}[]=[];
  async audit(action:string,_resourceType:string,_resourceId:string|undefined,context:EventContext){this.audits.push({action,context});}
  async security(eventType:string,_severity:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL',context:EventContext){this.securityEvents.push({eventType,context});}
}

export async function authFixture() {
  const store=new MemoryAuthStore();const delivery=new MemoryDelivery();const limiter=new MemoryLimiter();const events=new MemoryEvents();const mfaKey=Buffer.alloc(32,9).toString('base64');
  const dependencies:AuthServiceDependencies={store,delivery,limiter,events,otpPepper:'test-otp-pepper-at-least-thirty-two',sessionPepper:'test-session-pepper-at-least-thirty-two',mfaEncryptionKey:mfaKey,defaultCountry:'NG',dummyPasswordHash:await hashPassword('dummy password comparison 7!'),sessionTtlSeconds:3600,privilegedSessionTtlSeconds:1800};
  return {service:new AuthenticationService(dependencies),store,delivery,limiter,events,mfaKey,async addStaff(options?:{status?:string;mfaRequired?:boolean;phone?:string}){const user:IdentityUser={id:crypto.randomUUID(),tenantId:'11111111-1111-4111-8111-111111111111',kind:'STAFF',status:options?.status??'ACTIVE',phone:options?.phone??'+2348012345678',email:'staff@example.com',passwordHash:await hashPassword('staff password secure 7!'),mfaRequired:options?.mfaRequired??false};store.users.set(user.id,user);return user;},addMfa(user:IdentityUser,secret:string){store.mfaFactors.set(`${user.tenantId}:${user.id}`,encryptSecret(secret,mfaKey));}};
}
export const authContext={requestId:'request-test-1',ip:'127.0.0.1',userAgent:'Vitest browser'};
