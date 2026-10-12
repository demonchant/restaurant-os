ALTER TABLE users ADD COLUMN kind text NOT NULL DEFAULT 'STAFF';
ALTER TABLE users ADD COLUMN phone_verified_at timestamptz;
ALTER TABLE users ADD COLUMN password_changed_at timestamptz;
ALTER TABLE users ADD COLUMN mfa_required boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX users_tenant_phone_unique ON users(tenant_id,phone) WHERE phone IS NOT NULL;

ALTER TABLE sessions ADD COLUMN csrf_token_hash text;
ALTER TABLE sessions ADD COLUMN auth_method text NOT NULL DEFAULT 'BEARER';
ALTER TABLE sessions ADD COLUMN assurance_level integer NOT NULL DEFAULT 1;
ALTER TABLE sessions ADD COLUMN device_label text;
ALTER TABLE sessions ADD COLUMN user_agent_hash text;
ALTER TABLE sessions ADD COLUMN ip_hash text;

CREATE TABLE otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid,
  purpose text NOT NULL, target_phone text NOT NULL, channel text NOT NULL, code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL, resend_after timestamptz NOT NULL, consumed_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'PENDING', created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_user_tenant_fk FOREIGN KEY(user_id,tenant_id) REFERENCES users(id,tenant_id)
);
CREATE INDEX otp_target_purpose_idx ON otp_challenges(tenant_id,target_phone,purpose,created_at);

CREATE TABLE identity_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid,
  purpose text NOT NULL, token_hash text NOT NULL, target text, metadata jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL, consumed_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_tokens_user_tenant_fk FOREIGN KEY(user_id,tenant_id) REFERENCES users(id,tenant_id)
);
CREATE UNIQUE INDEX identity_tokens_hash_unique ON identity_tokens(token_hash);
CREATE INDEX identity_tokens_tenant_purpose_idx ON identity_tokens(tenant_id,purpose,created_at);

CREATE TABLE mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'TOTP', secret_ciphertext text NOT NULL, secret_iv text NOT NULL, secret_tag text NOT NULL,
  verified_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mfa_factors_user_tenant_fk FOREIGN KEY(user_id,tenant_id) REFERENCES users(id,tenant_id)
);
CREATE INDEX mfa_factors_user_idx ON mfa_factors(user_id);

CREATE TABLE mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 5, expires_at timestamptz NOT NULL,
  consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mfa_challenges_user_tenant_fk FOREIGN KEY(user_id,tenant_id) REFERENCES users(id,tenant_id)
);
CREATE INDEX mfa_challenges_user_idx ON mfa_challenges(user_id,created_at);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'restaurant_os_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON otp_challenges, identity_tokens, mfa_factors, mfa_challenges TO restaurant_os_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON users, sessions TO restaurant_os_app';
    EXECUTE 'REVOKE DELETE ON users, sessions, otp_challenges, identity_tokens, mfa_factors, mfa_challenges FROM restaurant_os_app';
  END IF;
END $$;
