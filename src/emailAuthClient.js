export const AUTH_RESEND_COOLDOWN_SECONDS = 60;
export const AUTH_MIN_PASSWORD_LENGTH = 12;
export const AUTH_MAX_PASSWORD_LENGTH = 128;

export const AUTH_ERROR_CODES = Object.freeze({
  NOT_CONFIGURED: 'AUTH_NOT_CONFIGURED',
  RATE_LIMITED: 'AUTH_RATE_LIMITED',
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  EMAIL_NOT_CONFIRMED: 'AUTH_EMAIL_NOT_CONFIRMED',
  INVALID_EMAIL: 'AUTH_INVALID_EMAIL',
  WEAK_PASSWORD: 'AUTH_WEAK_PASSWORD',
  PASSWORD_MISMATCH: 'AUTH_PASSWORD_MISMATCH',
  INVALID_OTP: 'AUTH_INVALID_OTP',
  USER_EXISTS: 'AUTH_USER_EXISTS',
  UNKNOWN: 'AUTH_ERROR'
});

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function passwordValidationCode(password, confirmation) {
  const length = String(password || '').length;
  if (length < AUTH_MIN_PASSWORD_LENGTH || length > AUTH_MAX_PASSWORD_LENGTH) {
    return AUTH_ERROR_CODES.WEAK_PASSWORD;
  }
  if (confirmation !== undefined && password !== confirmation) {
    return AUTH_ERROR_CODES.PASSWORD_MISMATCH;
  }
  return '';
}

export function normalizeOtp(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

export function normalizeInvitationTokenInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    return String(url.searchParams.get('invite') || '').trim();
  } catch {
    return text;
  }
}

export function registrationEmailMatches(sentEmail, currentEmail) {
  return Boolean(sentEmail) && normalizeEmail(sentEmail) === normalizeEmail(currentEmail);
}

export function isValidOtp(value) {
  return /^\d{6}$/.test(String(value || ''));
}

export function mapAuthError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  if (status === 429 || code.includes('over_request_rate_limit') || /rate limit|too many/.test(message)) {
    return AUTH_ERROR_CODES.RATE_LIMITED;
  }
  if (/email not confirmed/.test(message)) return AUTH_ERROR_CODES.EMAIL_NOT_CONFIRMED;
  if (/invalid login credentials|invalid credentials/.test(message)) return AUTH_ERROR_CODES.INVALID_CREDENTIALS;
  if (/invalid.*email|email.*invalid/.test(message)) return AUTH_ERROR_CODES.INVALID_EMAIL;
  if (/password/.test(message) && /weak|short|least|characters/.test(message)) return AUTH_ERROR_CODES.WEAK_PASSWORD;
  if (/already registered|already exists|user.*exist/.test(message)) return AUTH_ERROR_CODES.USER_EXISTS;
  if (/otp|token|code/.test(message) && /invalid|expired|already|not found/.test(message)) {
    return AUTH_ERROR_CODES.INVALID_OTP;
  }
  return AUTH_ERROR_CODES.UNKNOWN;
}

function authApi(client) {
  if (!client?.auth) {
    const error = new Error(AUTH_ERROR_CODES.NOT_CONFIGURED);
    error.code = AUTH_ERROR_CODES.NOT_CONFIGURED;
    throw error;
  }
  return client.auth;
}

export function signInWithEmail(client, { email, password }) {
  return authApi(client).signInWithPassword({ email: normalizeEmail(email), password });
}

function isNonEnumeratingRecoveryError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return /user.*not found|email.*not found|no user/.test(message);
}

export async function requestPasswordRecovery(client, { email }) {
  const result = await authApi(client).resetPasswordForEmail(normalizeEmail(email));
  if (result?.error && isNonEnumeratingRecoveryError(result.error)) {
    return { ...result, error: null };
  }
  return result;
}

export function verifyRecoveryCode(client, { email, token }) {
  return authApi(client).verifyOtp({ email: normalizeEmail(email), token: normalizeOtp(token), type: 'recovery' });
}

export function updateRecoveredPassword(client, { password }) {
  return authApi(client).updateUser({ password });
}
