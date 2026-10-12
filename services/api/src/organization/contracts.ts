import type { Principal } from '@restaurant-os/types';
import type { AuthRateLimiter,AuthRequestContext } from '../auth/contracts.js';
import type { EventSink } from '../contracts.js';

export type OperatingStatus='ACTIVE'|'INACTIVE'|'SUSPENDED';
export type DeviceStatus='PENDING'|'ACTIVE'|'REVOKED'|'DISABLED';
export type DeviceType='POS'|'FOH_TERMINAL'|'KITCHEN_TERMINAL'|'PACKING_TERMINAL'|'PRINTER'|'LOCAL_AGENT';
export interface RestaurantRecord{id:string;tenantId:string;legalName:string;displayName:string;contactEmail:string|null;contactPhone:string|null;timezone:string;currency:string;countryCode:string;status:OperatingStatus;settings:{orderNumberPrefix?:string|undefined;receiptFooter?:string|undefined};createdAt:Date;updatedAt:Date}
export interface LocationRecord{id:string;tenantId:string;restaurantId:string;name:string;addressLine1:string;addressLine2:string|null;city:string;state:string;postalCode:string|null;countryCode:string;timezone:string;status:OperatingStatus;operatingConfig:{acceptingOperations:boolean};createdAt:Date;updatedAt:Date}
export interface DeviceRecord{id:string;tenantId:string;locationId:string;name:string;type:DeviceType;status:DeviceStatus;credentialVersion:number;softwareVersion:string|null;lastSeenAt:Date|null;createdAt:Date;updatedAt:Date}
export interface EnrollmentResult{deviceId:string;token:string;expiresAt:Date;purpose:'ENROLL'|'ROTATE'}
export interface DeviceAuthentication{device:DeviceRecord;credentialVersion:number}
export class OrganizationStoreError extends Error{constructor(public readonly code:'CONFLICT'|'RESTAURANT_REQUIRED'){super(code);this.name='OrganizationStoreError';}}
export type RestaurantInput=Omit<RestaurantRecord,'id'|'tenantId'|'createdAt'|'updatedAt'>;
export type LocationInput=Omit<LocationRecord,'id'|'tenantId'|'restaurantId'|'createdAt'|'updatedAt'>;
export interface OrganizationStore{
  getRestaurant(tenantId:string):Promise<RestaurantRecord|null>;upsertRestaurant(tenantId:string,input:RestaurantInput,now:Date):Promise<{record:RestaurantRecord;created:boolean}>;
  listLocations(tenantId:string):Promise<LocationRecord[]>;getLocation(tenantId:string,id:string):Promise<LocationRecord|null>;createLocation(tenantId:string,input:LocationInput,now:Date):Promise<LocationRecord>;updateLocation(tenantId:string,id:string,input:LocationInput,now:Date):Promise<LocationRecord|null>;
  getStaffLocations(tenantId:string,userId:string):Promise<{accessScope:'TENANT'|'LOCATIONS';locationIds:string[];maximumRoleRank:number}|null>;assignStaffLocation(tenantId:string,userId:string,locationId:string,now:Date):Promise<'ASSIGNED'|'EXISTS'|'NOT_FOUND'>;removeStaffLocation(tenantId:string,userId:string,locationId:string,now:Date):Promise<boolean>;
  listDevices(tenantId:string):Promise<DeviceRecord[]>;getDevice(tenantId:string,id:string):Promise<DeviceRecord|null>;createDevice(input:{tenantId:string;actorId:string;locationId:string;name:string;type:DeviceType;tokenHash:string;expiresAt:Date},now:Date):Promise<{record:DeviceRecord;tokenId:string}>;
  updateDevice(tenantId:string,id:string,input:{name:string;locationId:string;status:'ACTIVE'|'DISABLED'},now:Date):Promise<DeviceRecord|null>;revokeDevice(tenantId:string,id:string,now:Date):Promise<DeviceRecord|null>;
  createRotation(tenantId:string,actorId:string,deviceId:string,tokenHash:string,expiresAt:Date,now:Date):Promise<boolean>;
  consumeEnrollment(tokenHash:string,credentialHash:string,now:Date):Promise<DeviceRecord|null>;consumeRotation(input:{tokenHash:string;deviceId:string;currentCredentialHash:string;newCredentialHash:string;now:Date}):Promise<DeviceRecord|null>;
  authenticateDevice(deviceId:string,credentialHash:string,now:Date):Promise<DeviceAuthentication|null>;heartbeat(deviceId:string,credentialHash:string,softwareVersion:string,now:Date):Promise<DeviceRecord|null>;
}
export interface OrganizationDependencies{store:OrganizationStore;events:EventSink;limiter:AuthRateLimiter;devicePepper:string;enrollmentPepper:string}
export interface OrganizationController{
  restaurant(actor:Principal):Promise<RestaurantRecord>;updateRestaurant(actor:Principal,input:RestaurantInput,context:AuthRequestContext):Promise<RestaurantRecord>;
  locations(actor:Principal):Promise<LocationRecord[]>;location(actor:Principal,id:string):Promise<LocationRecord>;createLocation(actor:Principal,input:LocationInput,context:AuthRequestContext):Promise<LocationRecord>;updateLocation(actor:Principal,id:string,input:LocationInput,context:AuthRequestContext):Promise<LocationRecord>;
  staffLocations(actor:Principal,userId:string):Promise<{accessScope:'TENANT'|'LOCATIONS';locationIds:string[];maximumRoleRank:number}>;assignStaffLocation(actor:Principal,userId:string,locationId:string,context:AuthRequestContext):Promise<void>;removeStaffLocation(actor:Principal,userId:string,locationId:string,context:AuthRequestContext):Promise<void>;
  devices(actor:Principal):Promise<DeviceRecord[]>;device(actor:Principal,id:string):Promise<DeviceRecord>;createDevice(actor:Principal,input:{locationId:string;name:string;type:DeviceType},context:AuthRequestContext):Promise<EnrollmentResult>;updateDevice(actor:Principal,id:string,input:{name:string;locationId:string;status:'ACTIVE'|'DISABLED'},context:AuthRequestContext):Promise<DeviceRecord>;revokeDevice(actor:Principal,id:string,reason:string,context:AuthRequestContext):Promise<void>;rotateDevice(actor:Principal,id:string,context:AuthRequestContext):Promise<EnrollmentResult>;
  enrollDevice(token:string,context:AuthRequestContext):Promise<{deviceId:string;credential:string;credentialVersion:number}>;completeRotation(token:string,currentCredential:string,context:AuthRequestContext):Promise<{deviceId:string;credential:string;credentialVersion:number}>;heartbeat(credential:string,softwareVersion:string,context:AuthRequestContext):Promise<DeviceRecord>;
}
