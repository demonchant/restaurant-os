ALTER TABLE roles ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE roles ADD COLUMN is_system boolean NOT NULL DEFAULT true;
ALTER TABLE roles ADD COLUMN rank integer NOT NULL DEFAULT 0;
ALTER TABLE user_roles ADD COLUMN assigned_by uuid;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_assigner_tenant_fk FOREIGN KEY(assigned_by,tenant_id) REFERENCES users(id,tenant_id);
ALTER TABLE mfa_factors ADD COLUMN enrollment_expires_at timestamptz;

CREATE TABLE staff_profiles (
  user_id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), display_name text NOT NULL,
  access_scope text NOT NULL DEFAULT 'TENANT' CHECK (access_scope IN ('TENANT','LOCATIONS')), invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_profiles_user_tenant_unique UNIQUE(user_id,tenant_id),
  CONSTRAINT staff_profiles_user_tenant_fk FOREIGN KEY(user_id,tenant_id) REFERENCES users(id,tenant_id),
  CONSTRAINT staff_profiles_inviter_tenant_fk FOREIGN KEY(invited_by,tenant_id) REFERENCES users(id,tenant_id)
);
CREATE INDEX staff_profiles_tenant_idx ON staff_profiles(tenant_id);
CREATE TABLE staff_location_access (
  tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL, location_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,location_id),
  CONSTRAINT staff_location_user_tenant_fk FOREIGN KEY(user_id,tenant_id) REFERENCES staff_profiles(user_id,tenant_id),
  CONSTRAINT staff_location_location_tenant_fk FOREIGN KEY(location_id,tenant_id) REFERENCES locations(id,tenant_id)
);
CREATE INDEX staff_location_tenant_idx ON staff_location_access(tenant_id);

INSERT INTO permissions(code,description) VALUES
('tenant:read','Read tenant'),('staff:view','View staff'),('staff:create','Invite staff'),('staff:update','Update staff'),('staff:suspend','Suspend or reactivate staff'),('staff:roles:assign','Assign permitted roles'),('staff:sessions:revoke','Revoke staff sessions'),('roles:view','View roles'),('permissions:view','View permission registry'),
('audit:view','View audit'),('settings:view','View settings'),('settings:update','Update settings'),('devices:view','View devices'),('devices:manage','Manage devices'),('orders:view','View orders'),('orders:create','Create orders'),('orders:update','Update orders'),('orders:cancel','Cancel orders'),('menu:view','View menu'),('menu:create','Create menu'),('menu:update','Update menu'),('menu:publish','Publish menu'),('pricing:view','View pricing'),('pricing:update','Update pricing'),('inventory:view','View inventory'),('inventory:update','Update inventory'),('inventory:adjust','Adjust inventory'),('payments:view','View payments'),('payments:reconcile','Reconcile payments'),('refunds:create','Create refunds'),('refunds:review','Review refunds'),('refunds:approve','Approve refunds'),('discounts:view','View discounts'),('discounts:create','Create discounts'),('discounts:approve','Approve discounts'),('reports:view','View reports'),('delivery:view','View delivery'),('delivery:manage','Manage delivery'),('ai:view','View AI'),('ai:configure','Configure AI'),('system:configure','Configure system')
ON CONFLICT(code) DO UPDATE SET description=excluded.description;

INSERT INTO roles(tenant_id,code,name,description,is_system,rank)
SELECT t.id,v.code,v.name,v.description,true,v.rank FROM tenants t CROSS JOIN (VALUES
('OWNER','Owner','Highest tenant business authority',100),('ADMIN','Administrator','Privileged tenant administrator',80),('MANAGER','Manager','Operational staff administrator',60),('FOH','Front of house','Front-of-house staff',20),('KITCHEN','Kitchen','Kitchen staff',20),('PACKING','Packing','Packing staff',20),('DELIVERY','Delivery','Delivery staff',20)
) v(code,name,description,rank) ON CONFLICT(tenant_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,is_system=true,rank=excluded.rank;

INSERT INTO role_permissions(tenant_id,role_id,permission_code)
SELECT r.tenant_id,r.id,p.code FROM roles r CROSS JOIN permissions p
WHERE r.code='OWNER' OR (r.code='ADMIN' AND p.code=ANY(ARRAY['tenant:read','staff:view','staff:create','staff:update','staff:suspend','staff:roles:assign','staff:sessions:revoke','roles:view','permissions:view','audit:view','settings:view','settings:update','devices:view','devices:manage'])) OR (r.code='MANAGER' AND p.code=ANY(ARRAY['tenant:read','staff:view','staff:create','staff:update','staff:suspend','staff:roles:assign','staff:sessions:revoke','roles:view','permissions:view']))
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION provision_system_roles_for_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO roles(tenant_id,code,name,description,is_system,rank) VALUES
  (NEW.id,'OWNER','Owner','Highest tenant business authority',true,100),(NEW.id,'ADMIN','Administrator','Privileged tenant administrator',true,80),(NEW.id,'MANAGER','Manager','Operational staff administrator',true,60),(NEW.id,'FOH','Front of house','Front-of-house staff',true,20),(NEW.id,'KITCHEN','Kitchen','Kitchen staff',true,20),(NEW.id,'PACKING','Packing','Packing staff',true,20),(NEW.id,'DELIVERY','Delivery','Delivery staff',true,20);
  INSERT INTO role_permissions(tenant_id,role_id,permission_code)
  SELECT r.tenant_id,r.id,p.code FROM roles r CROSS JOIN permissions p WHERE r.tenant_id=NEW.id AND (r.code='OWNER' OR (r.code='ADMIN' AND p.code=ANY(ARRAY['tenant:read','staff:view','staff:create','staff:update','staff:suspend','staff:roles:assign','staff:sessions:revoke','roles:view','permissions:view','audit:view','settings:view','settings:update','devices:view','devices:manage'])) OR (r.code='MANAGER' AND p.code=ANY(ARRAY['tenant:read','staff:view','staff:create','staff:update','staff:suspend','staff:roles:assign','staff:sessions:revoke','roles:view','permissions:view'])));
  RETURN NEW;
END $$;
CREATE TRIGGER tenants_system_roles AFTER INSERT ON tenants FOR EACH ROW EXECUTE FUNCTION provision_system_roles_for_tenant();

  CREATE OR REPLACE FUNCTION protect_last_active_owner() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE owner_role uuid; remaining integer; lock_tenant uuid;
  BEGIN
    IF TG_OP='DELETE' THEN lock_tenant:=OLD.tenant_id; ELSE lock_tenant:=NEW.tenant_id; END IF; PERFORM pg_advisory_xact_lock(hashtextextended(lock_tenant::text,0));
    SELECT id INTO owner_role FROM roles WHERE tenant_id=lock_tenant AND code='OWNER';
    IF TG_TABLE_NAME='user_roles' THEN
      IF TG_OP='DELETE' AND OLD.role_id=owner_role AND EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id AND tenant_id=lock_tenant AND status='ACTIVE') THEN
        SELECT count(*) INTO remaining FROM user_roles ur JOIN users u ON u.id=ur.user_id AND u.tenant_id=ur.tenant_id WHERE ur.tenant_id=lock_tenant AND ur.role_id=owner_role AND ur.user_id<>OLD.user_id AND u.status='ACTIVE';
        IF remaining<1 THEN RAISE EXCEPTION 'cannot remove last active owner' USING ERRCODE='23514'; END IF;
      END IF;
    ELSIF TG_TABLE_NAME='users' THEN
      IF OLD.status='ACTIVE' AND NEW.status<>'ACTIVE' AND EXISTS(SELECT 1 FROM user_roles WHERE tenant_id=lock_tenant AND user_id=OLD.id AND role_id=owner_role) THEN
        SELECT count(*) INTO remaining FROM user_roles ur JOIN users u ON u.id=ur.user_id AND u.tenant_id=ur.tenant_id WHERE ur.tenant_id=lock_tenant AND ur.role_id=owner_role AND u.status='ACTIVE';
        IF remaining<=1 THEN RAISE EXCEPTION 'cannot suspend last active owner' USING ERRCODE='23514'; END IF;
      END IF;
    END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER user_roles_last_owner_guard BEFORE DELETE ON user_roles FOR EACH ROW EXECUTE FUNCTION protect_last_active_owner();
CREATE TRIGGER users_last_owner_guard BEFORE UPDATE OF status ON users FOR EACH ROW EXECUTE FUNCTION protect_last_active_owner();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='restaurant_os_app') THEN
    EXECUTE 'GRANT SELECT ON permissions, roles TO restaurant_os_app';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON user_roles, staff_location_access TO restaurant_os_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON staff_profiles TO restaurant_os_app';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON permissions, roles, role_permissions FROM restaurant_os_app';
    EXECUTE 'REVOKE DELETE ON staff_profiles FROM restaurant_os_app';
  END IF;
END $$;
