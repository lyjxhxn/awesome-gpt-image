import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTH_ERROR_CODES,
  isValidEmail,
  isValidOtp,
  mapAuthError,
  normalizeEmail,
  normalizeInvitationTokenInput,
  normalizeOtp,
  passwordValidationCode,
  registrationEmailMatches,
  requestPasswordRecovery,
  signInWithEmail,
  updateRecoveredPassword,
  verifyRecoveryCode
} from './emailAuthClient.js';

function authMock(method, result = { data: {}, error: null }) {
  const calls = [];
  return {
    calls,
    client: {
      auth: {
        [method]: async (...args) => {
          calls.push(args);
          return result;
        }
      }
    }
  };
}

test('normalizes and validates email addresses', () => {
  assert.equal(normalizeEmail('  Person@Example.COM '), 'person@example.com');
  assert.equal(isValidEmail('person@example.com'), true);
  assert.equal(isValidEmail('invalid-address'), false);
});

test('enforces twelve-character matching passwords', () => {
  assert.equal(passwordValidationCode('12345678901', '12345678901'), AUTH_ERROR_CODES.WEAK_PASSWORD);
  assert.equal(passwordValidationCode('123456789012', '210987654321'), AUTH_ERROR_CODES.PASSWORD_MISMATCH);
  assert.equal(passwordValidationCode('123456789012', '123456789012'), '');
  assert.equal(passwordValidationCode('x'.repeat(129), 'x'.repeat(129)), AUTH_ERROR_CODES.WEAK_PASSWORD);
});

test('normalizes and validates six-digit OTP codes', () => {
  assert.equal(normalizeOtp('12 34-56x'), '123456');
  assert.equal(isValidOtp('123456'), true);
  assert.equal(isValidOtp('12345'), false);
});

test('maps common Supabase errors without exposing raw messages', () => {
  assert.equal(mapAuthError({ status: 429, message: 'custom response' }), AUTH_ERROR_CODES.RATE_LIMITED);
  assert.equal(mapAuthError({ message: 'Invalid login credentials' }), AUTH_ERROR_CODES.INVALID_CREDENTIALS);
  assert.equal(mapAuthError({ message: 'Email not confirmed' }), AUTH_ERROR_CODES.EMAIL_NOT_CONFIRMED);
  assert.equal(mapAuthError({ message: 'Token has expired or is invalid' }), AUTH_ERROR_CODES.INVALID_OTP);
  assert.equal(mapAuthError({ message: 'Unexpected server detail' }), AUTH_ERROR_CODES.UNKNOWN);
});

test('login uses the email password API', async () => {
  const login = authMock('signInWithPassword');
  await signInWithEmail(login.client, { email: ' Test@Example.com ', password: 'password1' });
  assert.deepEqual(login.calls[0][0], { email: 'test@example.com', password: 'password1' });
});

test('accepts either a raw invitation token or a complete invitation link', () => {
  assert.equal(normalizeInvitationTokenInput('  abc_123-xyz  '), 'abc_123-xyz');
  assert.equal(
    normalizeInvitationTokenInput('https://example.com/?invite=abc_123-xyz&utm_source=email'),
    'abc_123-xyz'
  );
  assert.equal(normalizeInvitationTokenInput('https://example.com/without-token'), '');
});

test('registration codes stay valid only while the normalized email is unchanged', () => {
  assert.equal(registrationEmailMatches('User@example.com', ' user@example.com '), true);
  assert.equal(registrationEmailMatches('first@example.com', 'second@example.com'), false);
  assert.equal(registrationEmailMatches('', 'user@example.com'), false);
});

test('recovery uses recovery OTP and updates the current recovery session', async () => {
  const request = authMock('resetPasswordForEmail');
  await requestPasswordRecovery(request.client, { email: 'A@example.com' });
  assert.equal(request.calls[0][0], 'a@example.com');

  const verification = authMock('verifyOtp');
  await verifyRecoveryCode(verification.client, { email: 'a@example.com', token: '123456' });
  assert.deepEqual(verification.calls[0][0], { email: 'a@example.com', token: '123456', type: 'recovery' });

  const update = authMock('updateUser');
  await updateRecoveredPassword(update.client, { password: 'new-password' });
  assert.deepEqual(update.calls[0][0], { password: 'new-password' });
});

test('password recovery does not disclose whether an email exists', async () => {
  const missing = authMock('resetPasswordForEmail', {
    data: null,
    error: new Error('User not found')
  });
  const result = await requestPasswordRecovery(missing.client, { email: 'missing@example.com' });
  assert.equal(result.error, null);
});
