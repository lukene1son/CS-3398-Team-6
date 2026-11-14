-- Sign in with Google: the Google account id ("sub" claim) linked to each user.
-- Run with: npm run db:migrate
ALTER TABLE users
    ADD COLUMN google_sub VARCHAR(255) NULL UNIQUE;