import { createHmac } from 'node:crypto';
import type { InvitationDeliveryMessage, InvitationDeliveryProvider } from './contracts.js';
export class UnavailableInvitationDeliveryProvider implements InvitationDeliveryProvider { deliver():Promise<void>{return Promise.reject(new Error('Invitation delivery provider is not configured'));} }
export class WebhookInvitationDeliveryProvider implements InvitationDeliveryProvider {
  constructor(private readonly url:string,private readonly secret:string){}
  async deliver(message:InvitationDeliveryMessage){const body=JSON.stringify({invitationId:message.invitationId,tenantId:message.tenantId,email:message.email,invitationUrl:message.invitationUrl,expiresAt:message.expiresAt.toISOString()});const timestamp=Date.now().toString();const signature=createHmac('sha256',this.secret).update(`${timestamp}.${body}`).digest('hex');const response=await fetch(this.url,{method:'POST',headers:{'content-type':'application/json','x-restaurant-os-timestamp':timestamp,'x-restaurant-os-signature':`sha256=${signature}`,'x-request-id':message.requestId},body,signal:AbortSignal.timeout(8_000)});if(!response.ok)throw new Error(`Invitation delivery failed with status ${response.status}`);}
}
