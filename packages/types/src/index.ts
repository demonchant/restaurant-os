export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type RequestId = Brand<string, 'RequestId'>;

export interface ApiSuccess<T> {
  data: T;
  requestId: string;
}

export interface ApiErrorDetail {
  path?: string;
  message: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: ApiErrorDetail[] };
  requestId: string;
}

export interface Principal {
  userId: string;
  tenantId: string;
  sessionId: string;
  kind: 'CUSTOMER' | 'STAFF';
  assuranceLevel: number;
  csrfTokenHash?: string;
  permissions: ReadonlySet<string>;
  roleCodes: ReadonlySet<string>;
  locationScope: 'TENANT' | 'LOCATIONS' | null;
  locationIds: ReadonlySet<string>;
}
