CREATE ROLE restaurant_os_app LOGIN PASSWORD 'local-runtime-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
SELECT format('GRANT CONNECT ON DATABASE %I TO restaurant_os_app', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO restaurant_os_app;
ALTER DEFAULT PRIVILEGES FOR ROLE restaurant_os IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO restaurant_os_app;
