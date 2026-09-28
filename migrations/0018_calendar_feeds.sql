-- The calendar feed (docs/V2.md §6.7): one private link per person, served
-- at /cal/<token>.ics with no cookie. The token is never stored. It's an
-- HMAC of the person's id and `nonce` under a key that lives only in R2
-- (src/server/crypto.ts `keyedHash`), so Settings can show the same link
-- again, while a copy of this table alone can't be turned into one. A
-- request is matched by the token's SHA-256. "Make a new link" draws a new
-- nonce, which changes the token and the hash: the old link stops at once.
CREATE TABLE calendar_feeds (
  user_id         TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,  -- SHA-256 hex of the link's token
  nonce           TEXT NOT NULL,         -- 16 random bytes, base64url; new on every "Make a new link"
  created_at      TEXT NOT NULL,         -- when this link was made (the first ask, or the last new link)
  last_fetched_at TEXT                   -- a calendar's last fetch, to the hour; null until the first
);
