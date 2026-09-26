-- Identity: Sign in with Google, UMD accounts only (docs/V2.md §4.4,
-- docs/AUTH.md, DATA.md §7.4).

-- One row per person, keyed on the UMD directory ID (the email's local part).
-- terp@terpmail.umd.edu and terp@umd.edu are the same person, "terp".
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,         -- directory ID, lowercase: 'jdoe'
  email                 TEXT NOT NULL,            -- lowercase, as Google gave it at the last sign-in
  hd                    TEXT NOT NULL CHECK (hd IN ('terpmail.umd.edu', 'umd.edu')),
  name                  TEXT NOT NULL,            -- Google's name, refreshed at every sign-in
  picture_url           TEXT,                     -- Google's picture URL, refreshed at every sign-in
  picture_key           TEXT,                     -- USER_CONTENT key of our cached copy (avatars/<id>/<hash16>.<ext>), or null
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleting')),
  delete_after          TEXT,                     -- set while 'deleting'; the daily job purges after it
  chat_blocked_until    TEXT,                     -- admin: no posting in Chat until then
  reviews_blocked_until TEXT,                     -- admin: no writing reviews until then
  created_at            TEXT NOT NULL,            -- ISO UTC
  last_sign_in_at       TEXT NOT NULL
);
CREATE INDEX users_deleting ON users (delete_after) WHERE status = 'deleting';

-- Google subjects seen for a user: one per UMD tenant they've signed in
-- with, so two is normal (student workers have TERPmail and UMD Gmail).
CREATE TABLE user_identities (
  provider   TEXT NOT NULL CHECK (provider = 'google'),
  sub        TEXT NOT NULL,
  hd         TEXT NOT NULL CHECK (hd IN ('terpmail.umd.edu', 'umd.edu')),
  email      TEXT NOT NULL,                     -- that tenant's address: both of a person's emails are kept
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, sub)
);
CREATE INDEX user_identities_by_user ON user_identities (user_id);

CREATE TABLE sessions (
  id_hash      TEXT PRIMARY KEY,                  -- hex SHA-256 of the __Host-session token
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,                     -- refreshed at most daily, with a new token
  expires_at   TEXT NOT NULL                      -- last refresh + 30 days
);
CREATE INDEX sessions_by_user ON sessions (user_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);
