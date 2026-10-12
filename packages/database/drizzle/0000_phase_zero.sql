CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL, status text NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX tenants_slug_unique ON tenants(slug);
CREATE TABLE restaurants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX restaurants_tenant_idx ON restaurants(tenant_id); CREATE UNIQUE INDEX restaurants_id_tenant_unique ON restaurants(id,tenant_id);
CREATE TABLE locations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), restaurant_id uuid NOT NULL, name text NOT NULL, timezone text NOT NULL DEFAULT 'Africa/Lagos', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT locations_restaurant_tenant_fk FOREIGN KEY(restaurant_id,tenant_id) REFERENCES restaurants(id,tenant_id));
CREATE INDEX locations_tenant_idx ON locations(tenant_id); CREATE UNIQUE INDEX locations_id_tenant_unique ON locations(id,tenant_id);
CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), phone text, email text, password_hash text, status text NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX users_tenant_idx ON users(tenant_id); CREATE UNIQUE INDEX users_tenant_email_unique ON users(tenant_id,email); CREATE UNIQUE INDEX users_id_tenant_unique ON users(id,tenant_id);
CREATE TABLE roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), code text NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX roles_tenant_code_unique ON roles(tenant_id,code); CREATE UNIQUE INDEX roles_id_tenant_unique ON roles(id,tenant_id);
CREATE TABLE permissions (code text PRIMARY KEY, description text NOT NULL);
CREATE TABLE user_roles (tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL, role_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,role_id), CONSTRAINT user_roles_user_tenant_fk FOREIGN KEY(user_id,tenant_id) REFERENCES users(id,tenant_id), CONSTRAINT user_roles_role_tenant_fk FOREIGN KEY(role_id,tenant_id) REFERENCES roles(id,tenant_id));
CREATE INDEX user_roles_tenant_idx ON user_roles(tenant_id);
CREATE TABLE role_permissions (tenant_id uuid NOT NULL REFERENCES tenants(id), role_id uuid NOT NULL, permission_code text NOT NULL REFERENCES permissions(code), PRIMARY KEY(role_id,permission_code), CONSTRAINT role_permissions_role_tenant_fk FOREIGN KEY(role_id,tenant_id) REFERENCES roles(id,tenant_id));
CREATE TABLE sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL, token_hash text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, last_seen_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT sessions_user_tenant_fk FOREIGN KEY(user_id,tenant_id) REFERENCES users(id,tenant_id));
CREATE UNIQUE INDEX sessions_token_hash_unique ON sessions(token_hash); CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE devices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), location_id uuid, name text NOT NULL, type text NOT NULL, credential_hash text, last_seen_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT devices_location_tenant_fk FOREIGN KEY(location_id,tenant_id) REFERENCES locations(id,tenant_id));
CREATE INDEX devices_tenant_idx ON devices(tenant_id);
CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), occurred_at timestamptz NOT NULL DEFAULT now(), tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid, action text NOT NULL, resource_type text NOT NULL, resource_id text, request_id text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}');
CREATE INDEX audit_tenant_time_idx ON audit_logs(tenant_id,occurred_at);
CREATE TABLE security_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), occurred_at timestamptz NOT NULL DEFAULT now(), tenant_id uuid REFERENCES tenants(id), actor_id uuid, event_type text NOT NULL, severity text NOT NULL, request_id text NOT NULL, source_ip_hash text, metadata jsonb NOT NULL DEFAULT '{}');
CREATE INDEX security_events_time_idx ON security_events(occurred_at); CREATE INDEX security_events_tenant_idx ON security_events(tenant_id);
CREATE TABLE idempotency_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid NOT NULL, action text NOT NULL, key_hash text NOT NULL, request_hash text NOT NULL, response_status integer, response_body jsonb, locked boolean NOT NULL DEFAULT true, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT idempotency_actor_tenant_fk FOREIGN KEY(actor_id,tenant_id) REFERENCES users(id,tenant_id));
CREATE UNIQUE INDEX idempotency_scope_unique ON idempotency_records(tenant_id,actor_id,action,key_hash); CREATE INDEX idempotency_expiry_idx ON idempotency_records(expires_at);
CREATE TABLE schema_metadata (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

REVOKE UPDATE, DELETE ON audit_logs, security_events FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'restaurant_os_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON audit_logs, security_events TO restaurant_os_app';
    EXECUTE 'REVOKE UPDATE, DELETE ON audit_logs, security_events FROM restaurant_os_app';
  END IF;
END $$;
