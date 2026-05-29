-- fix_passwords.sql
-- Run this against the EXISTING database if you have a live volume with broken password hashes.
-- Password for all demo accounts: SecurePassword123
-- Hash was verified with bcrypt.checkpw() before being written here.
--
-- Usage (while containers are running):
--   docker compose exec db psql -U peripateticware_user -d peripateticware -f /dev/stdin < database/fix_passwords.sql

UPDATE users
SET hashed_password = '$2b$12$5TniPxM.qx2B6jRaywxNv.Z4C/XFkj9H4RKkhwH53N5rFVRg.Gls.'
WHERE email IN (
    'student@example.com',
    'teacher@example.com',
    'parent@example.com',
    'admin@example.com'
);
