-- Since schema was changed to include password_hash and created_at fields, 
-- this migration ensures that older databases are updated accordingly.
-- Anyone who created a database with the older schema can run "npm run db:migrate" to apply this migration & update the database schema.
ALTER TABLE users
    ADD COLUMN password_hash VARCHAR(255) NULL,
    ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
