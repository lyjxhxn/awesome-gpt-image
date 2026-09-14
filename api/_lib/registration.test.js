import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hashRegistrationValue,
  isValidDisplayName,
  isValidInviteCode,
  isValidRegistrationEmail,
  isValidRegistrationPassword,
  normalizeDisplayName,
  normalizeInviteCode
} from './registration.js';

test('registration validates email, display name, password and human invite codes', () => {
  assert.equal(isValidRegistrationEmail('user@example.com'), true);
  assert.equal(normalizeDisplayName('  张   三 '), '张 三');
  assert.equal(isValidDisplayName('张三'), true);
  assert.equal(isValidDisplayName('<admin>'), false);
  assert.equal(isValidRegistrationPassword('123456789012'), true);
  assert.equal(isValidRegistrationPassword('short'), false);
  assert.equal(normalizeInviteCode(' NasMy '), 'nasmy');
  assert.equal(isValidInviteCode('nasmy'), true);
  assert.equal(isValidInviteCode('a b'), false);
});

test('registration secrets are purpose separated HMAC hashes', () => {
  const previous = process.env.AUTH_REGISTRATION_HASH_SECRET;
  process.env.AUTH_REGISTRATION_HASH_SECRET = 'test-secret-that-is-at-least-32-characters';
  try {
    const codeHash = hashRegistrationValue('nasmy', 'invite-code');
    assert.match(codeHash, /^[0-9a-f]{64}$/);
    assert.notEqual(codeHash, hashRegistrationValue('nasmy', 'verification-token'));
  } finally {
    if (previous === undefined) delete process.env.AUTH_REGISTRATION_HASH_SECRET;
    else process.env.AUTH_REGISTRATION_HASH_SECRET = previous;
  }
});

test('registration migration enforces email verification and invite usage atomically', () => {
  const sql = readFileSync(
    new URL('../../supabase/migrations/20260914090000_registration_auth.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /registration_email_challenges/i);
  assert.match(sql, /invite_required boolean not null default true/i);
  assert.match(sql, /max_uses integer/i);
  assert.match(sql, /attempts integer not null default 0/i);
  assert.match(sql, /reserve_registration_invite/i);
  assert.match(sql, /use_count = use_count \+ 1/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /revoke all on table public\.registration_invite_codes/i);
});
