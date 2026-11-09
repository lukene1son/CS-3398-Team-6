-- Chosen background color for the initials avatar. NULL = default (based on user id).
ALTER TABLE users ADD COLUMN avatar_color VARCHAR(7) NULL;