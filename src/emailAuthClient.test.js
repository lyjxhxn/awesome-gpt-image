import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTH_ERROR_CODES,
  isValidEmail,
  isValidOtp,
  mapAuthError,
  normalizeEmail,
  normalizeOtp,
  passwordValidationCode,
  requestPasswordRecovery,
  resendSignupCode,
  signInWithEmail,
  signUpWithEmail,
  updateRecoveredPassword,
  verifyRecoveryCode,
  verifySignupCode
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

test('enforces eight-character matching passwords', () => {
  assert.equal(passwordValidationCode('1234567', '1234567'), AUTH_ERROR_CODES.WEAK_PASSWORD);
  assert.equal(passwordValidationCode('12345678', '87654321'), AUTH_ERROR_CODES.PASSWORD_MISMATCH);
  assert.equal(passwordValidationCode('12345678', '12345678'), '');
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

test('login and signup use email password APIs', async () => {
  const login = authMock('signInWithPassword');
  await signInWithEmail(login.client, { email: ' Test@Example.com ', password: 'password1' });
  assert.deepEqual(login.calls[0][0], { email: 'test@example.com', password: 'password1' });

  const signup = authMock('signUp');
  await signUpWithEmail(signup.client, { email: ' Test@Example.com ', password: 'password1' });
  assert.deepEqual(signup.calls[0][0], { email: 'test@example.com', password: 'password1' });
});

test('signup verification and resend use signup OTP type', async () => {
  const verification = authMock('verifyOtp');
  await verifySignupCode(verification.client, { email: 'a@example.com', token: '12 34 56' });
  assert.deepEqual(verification.calls[0][0], { email: 'a@example.com', token: '123456', type: 'signup' });

  const resend = authMock('resend');
  await resendSignupCode(resend.client, { email: 'a@example.com' });
  assert.deepEqual(resend.calls[0][0], { email: 'a@example.com', type: 'signup' });
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
