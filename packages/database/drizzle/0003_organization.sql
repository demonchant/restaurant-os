ALTER TABLE restaurants ADD COLUMN legal_name text NOT NULL DEFAULT '';
ALTER TABLE restaurants ADD COLUMN contact_email text;
ALTER TABLE restaurants ADD COLUMN contact_phone text;
ALTER TABLE restaurants ADD COLUMN timezone text NOT NULL DEFAULT 'Africa/Lagos';
ALTER TABLE restaurants ADD COLUMN currency text NOT NULL DEFAULT 'NGN';
ALTER TABLE restaurants ADD COLUMN country_code text NOT NULL DEFAULT 'NG';
ALTER TABLE restaurants ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE restaurants ADD COLUMN settings jsonb NOT NULL DEFAULT '{}';
ALTER TABLE restaurants ADD CONSTRAINT restaurants_status_check CHECK(status IN ('ACTIVE','INACTIVE','SUSPENDED'));
CREATE UNIQUE INDEX restaurants_tenant_unique ON restaurants(tenant_id);

ALTER TABLE locations ADD COLUMN address_line_1 text NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN address_line_2 text;
ALTER TABLE locations ADD COLUMN city text NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN state text NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN postal_code text;
ALTER TABLE locations ADD COLUMN country_code text NOT NULL DEFAULT 'NG';
ALTER TABLE locations ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE locations ADD COLUMN operating_config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE locations ADD CONSTRAINT locations_status_check CHECK(status IN ('ACTIVE','INACTIVE','SUSPENDED'));
CREATE UNIQUE INDEX locations_tenant_name_unique ON locations(tenant_id,name);

ALTER TABLE devices ADD COLUMN status text NOT NULL DEFAULT 'PENDING';
ALTER TABLE devices ADD COLUMN credential_version integer NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN software_version text;
ALTER TABLE devices ADD COLUMN disabled_at timestamptz;
UPDATE devices SET status=CASE WHEN revoked_at IS NOT NULL THEN 'REVOKED' WHEN credential_hash IS NOT NULL THEN 'ACTIVE' ELSE 'PENDING' END;
ALTER TABLE devices ADD CONSTRAINT devices_type_check CHECK(type IN ('POS','FOH_TERMINAL','KITCHEN_TERMINAL','PACKING_TERMINAL','PRINTER','LOCAL_AGENT'));
ALTER TABLE devices ADD CONSTRAINT devices_status_check CHECK(status IN ('PENDING','ACTIVE','REVOKED','DISABLED'));
CREATE UNIQUE INDEX devices_id_tenant_unique ON devices(id,tenant_id);
CREATE UNIQUE INDEX devices_tenant_name_unique ON devices(tenant_id,name);

CREATE TABLE device_enrollment_tokens(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),device_id uuid NOT NULL,purpose text NOT NULL,
  token_hash text NOT NULL,created_by uuid NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_enrollment_purpose_check CHECK(purpose IN ('ENROLL','ROTATE')),
  CONSTRAINT device_enrollment_device_tenant_fk FOREIGN KEY(device_id,tenant_id) REFERENCES devices(id,tenant_id),
  CONSTRAINT device_enrollment_actor_tenant_fk FOREIGN KEY(created_by,tenant_id) REFERENCES users(id,tenant_id)
);
CREATE UNIQUE INDEX device_enrollment_hash_unique ON device_enrollment_tokens(token_hash);
CREATE INDEX device_enrollment_device_idx ON device_enrollment_tokens(tenant_id,device_id);

INSERT INTO permissions(code,description) VALUES
('restaurant:view','View restaurant profile'),('restaurant:update','Update restaurant profile'),('locations:view','View authorized locations'),('locations:create','Create locations'),('locations:update','Update locations'),('staff:locations:assign','Assign staff location access')
ON CONFLICT(code) DO UPDATE SET description=excluded.description;

INSERT INTO role_permissions(tenant_id,role_id,permission_code)
SELECT r.tenant_id,r.id,p.code FROM roles r CROSS JOIN permissions p WHERE
r.code='OWNER' OR
(r.code='ADMIN' AND p.code=ANY(ARRAY['restaurant:view','restaurant:update','locations:view','locations:create','locations:update','staff:locations:assign'])) OR
(r.code='MANAGER' AND p.code=ANY(ARRAY['restaurant:view','locations:view','locations:update','staff:locations:assign','devices:view','devices:manage'])) OR
(r.code IN ('FOH','KITCHEN','PACKING','DELIVERY') AND p.code=ANY(ARRAY['restaurant:view','locations:view']))
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION provision_system_roles_for_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO roles(tenant_id,code,name,description,is_system,rank) VALUES
  (NEW.id,'OWNER','Owner','Highest tenant business authority',true,100),(NEW.id,'ADMIN','Administrator','Privileged tenant administrator',true,80),(NEW.id,'MANAGER','Manager','Operational staff administrator',true,60),(NEW.id,'FOH','Front of house','Front-of-house staff',true,20),(NEW.id,'KITCHEN','Kitchen','Kitchen staff',true,20),(NEW.id,'PACKING','Packing','Packing staff',true,20),(NEW.id,'DELIVERY','Delivery','Delivery staff',true,20)
  ON CONFLICT(tenant_id,code) DO NOTHING;
  INSERT INTO role_permissions(tenant_id,role_id,permission_code)
  SELECT r.tenant_id,r.id,p.code FROM roles r CROSS JOIN permissions p WHERE r.tenant_id=NEW.id AND
  (r.code='OWNER' OR
   (r.code='ADMIN' AND p.code=ANY(ARRAY['tenant:read','staff:view','staff:create','staff:update','staff:suspend','staff:roles:assign','staff:sessions:revoke','roles:view','permissions:view','audit:view','settings:view','settings:update','restaurant:view','restaurant:update','locations:view','locations:create','locations:update','staff:locations:assign','devices:view','devices:manage'])) OR
   (r.code='MANAGER' AND p.code=ANY(ARRAY['tenant:read','staff:view','staff:create','staff:update','staff:suspend','staff:roles:assign','staff:sessions:revoke','roles:view','permissions:view','restaurant:view','locations:view','locations:update','staff:locations:assign','devices:view','devices:manage'])) OR
   (r.code IN ('FOH','KITCHEN','PACKING','DELIVERY') AND p.code=ANY(ARRAY['restaurant:view','locations:view'])))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='restaurant_os_app') THEN
    EXECUTE 'GRANT SELECT,INSERT,UPDATE ON restaurants,locations,devices,device_enrollment_tokens TO restaurant_os_app';
    EXECUTE 'REVOKE DELETE ON restaurants,locations,devices,device_enrollment_tokens FROM restaurant_os_app';
  END IF;
END $$;
