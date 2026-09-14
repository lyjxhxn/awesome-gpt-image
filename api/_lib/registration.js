import { createHmac, randomBytes, randomInt } from 'node:crypto';
import nodemailer from 'nodemailer';
import { ensureProfileForUser, getSupabaseAdminClient } from './supabase.js';

export const REGISTRATION_PASSWORD_MIN = 12;
export const REGISTRATION_PASSWORD_MAX = 128;

export function normalizeRegistrationEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidRegistrationEmail(value) {
  const email = normalizeRegistrationEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeDisplayName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function isValidDisplayName(value) {
  const name = normalizeDisplayName(value);
  return name.length >= 2 && name.length <= 30 && !/[\u0000-\u001f\u007f<>]/.test(name);
}

export function isValidRegistrationPassword(value) {
  const length = String(value || '').length;
  return length >= REGISTRATION_PASSWORD_MIN && length <= REGISTRATION_PASSWORD_MAX;
}

export function normalizeInviteCode(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidInviteCode(value) {
  return /^[a-z0-9_-]{4,32}$/.test(normalizeInviteCode(value));
}

function registrationSecret() {
  const value = String(process.env.AUTH_REGISTRATION_HASH_SECRET || '').trim();
  if (value.length < 32) throw new Error('REGISTRATION_NOT_CONFIGURED');
  return value;
}

export function hashRegistrationValue(value, purpose) {
  return createHmac('sha256', registrationSecret())
    .update(`${purpose}:${String(value || '')}`)
    .digest('hex');
}

function requestIp(req) {
  return String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
    || req?.socket?.remoteAddress
    || 'unknown';
}

function smtpTransport() {
  const port = Number(process.env.SMTP_PORT || 0);
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '');
  const from = String(process.env.SMTP_FROM || '').trim();
  if (!host || !port || !user || !pass || !from) throw new Error('SMTP_NOT_CONFIGURED');
  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
      auth: { user, pass }
    }),
    from
  };
}

async function rateLimit(client, scope, value, limit, windowSeconds) {
  if (String(process.env.AUTH_RATE_LIMIT_DISABLED || '').toLowerCase() === 'true') return true;
  const { data, error } = await client.rpc('record_auth_rate_limit_event', {
    p_scope: scope,
    p_key_hash: hashRegistrationValue(value, `rate:${scope}`),
    p_limit: limit,
    p_window_seconds: windowSeconds
  });
  if (error) throw new Error('REGISTRATION_NOT_CONFIGURED');
  return data === true;
}

export async function registrationConfig() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('REGISTRATION_NOT_CONFIGURED');
  const { data, error } = await client
    .from('registration_settings')
    .select('invite_required')
    .eq('id', true)
    .single();
  if (error) throw new Error('REGISTRATION_NOT_CONFIGURED');
  return { inviteRequired: data.invite_required !== false };
}

export async function updateRegistrationConfig(inviteRequired, updatedBy) {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('REGISTRATION_NOT_CONFIGURED');
  const { error } = await client.from('registration_settings').upsert({
    id: true,
    invite_required: inviteRequired === true,
    updated_by: updatedBy,
    updated_at: new Date().toISOString()
  });
  if (error) throw new Error('REGISTRATION_CONFIG_UPDATE_FAILED');
  return { inviteRequired: inviteRequired === true };
}

export async function requestRegistrationCode({ email, req }) {
  const normalizedEmail = normalizeRegistrationEmail(email);
  if (!isValidRegistrationEmail(normalizedEmail)) throw new Error('INVALID_EMAIL');
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('REGISTRATION_NOT_CONFIGURED');
  if (!await rateLimit(client, 'registration-code-ip', requestIp(req), 5, 15 * 60)
      || !await rateLimit(client, 'registration-code-email', normalizedEmail, 3, 60 * 60)) {
    throw new Error('AUTH_RATE_LIMITED');
  }

  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await client.from('registration_email_challenges')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const { data, error } = await client.from('registration_email_challenges').insert({
    email: normalizedEmail,
    code_hash: hashRegistrationValue(code, `email-code:${normalizedEmail}`),
    expires_at: expiresAt
  }).select('id').single();
  if (error || !data) throw new Error('REGISTRATION_CODE_FAILED');

  try {
    const { transporter, from } = smtpTransport();
    await transporter.sendMail({
      from,
      to: normalizedEmail,
      subject: 'GPT Image 注册验证码',
      text: `你的注册验证码是：${code}\n\n验证码 10 分钟内有效。如果不是你本人操作，请忽略本邮件。`,
      html: `<p>你的注册验证码是：</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>验证码 10 分钟内有效。如果不是你本人操作，请忽略本邮件。</p>`
    });
  } catch (mailError) {
    await client.from('registration_email_challenges').delete().eq('id', data.id);
    throw mailError;
  }
  return { email: normalizedEmail, cooldownSeconds: 60 };
}

export async function verifyRegistrationCode({ email, code, req }) {
  const normalizedEmail = normalizeRegistrationEmail(email);
  if (!isValidRegistrationEmail(normalizedEmail) || !/^\d{6}$/.test(String(code || ''))) {
    throw new Error('INVALID_VERIFICATION_CODE');
  }
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('REGISTRATION_NOT_CONFIGURED');
  if (!await rateLimit(client, 'registration-verify-ip', requestIp(req), 10, 15 * 60)) {
    throw new Error('AUTH_RATE_LIMITED');
  }
  const verificationToken = randomBytes(32).toString('base64url');
  const { data, error } = await client.rpc('verify_registration_email_code', {
    p_email: normalizedEmail,
    p_code_hash: hashRegistrationValue(code, `email-code:${normalizedEmail}`),
    p_verification_token_hash: hashRegistrationValue(verificationToken, 'verification-token'),
    p_verification_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  });
  if (error || data !== true) throw new Error('INVALID_VERIFICATION_CODE');
  return { verificationToken };
}

function inviteHint(code) {
  return code.length <= 6 ? `${code.slice(0, 2)}***` : `${code.slice(0, 2)}***${code.slice(-2)}`;
}

export async function createInviteCode({ code, maxUses = null, createdBy = null }) {
  const normalizedCode = normalizeInviteCode(code);
  if (!isValidInviteCode(normalizedCode)) throw new Error('INVALID_INVITE_CODE');
  const parsedMaxUses = maxUses === '' || maxUses == null ? null : Number(maxUses);
  if (parsedMaxUses !== null && (!Number.isInteger(parsedMaxUses) || parsedMaxUses < 1 || parsedMaxUses > 100000)) {
    throw new Error('INVALID_MAX_USES');
  }
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('REGISTRATION_NOT_CONFIGURED');
  const { data, error } = await client.from('registration_invite_codes').insert({
    code_hash: hashRegistrationValue(normalizedCode, 'invite-code'),
    code_hint: inviteHint(normalizedCode),
    max_uses: parsedMaxUses,
    created_by: createdBy
  }).select('id,code_hint,max_uses,use_count,expires_at,revoked_at,created_at').single();
  if (error?.code === '23505') throw new Error('INVITE_CODE_EXISTS');
  if (error || !data) throw new Error('INVITE_CODE_CREATE_FAILED');
  return formatInviteCode(data);
}

function formatInviteCode(row) {
  return {
    id: row.id,
    codeHint: row.code_hint,
    maxUses: row.max_uses == null ? null : Number(row.max_uses),
    useCount: Number(row.use_count || 0),
    expiresAt: row.expires_at || '',
    revokedAt: row.revoked_at || '',
    active: !row.revoked_at && (!row.expires_at || new Date(row.expires_at) > new Date())
      && (row.max_uses == null || Number(row.use_count || 0) < Number(row.max_uses)),
    createdAt: row.created_at
  };
}

export async function listInviteCodes() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('REGISTRATION_NOT_CONFIGURED');
  const { data, error } = await client.from('registration_invite_codes')
    .select('id,code_hint,max_uses,use_count,expires_at,revoked_at,created_at')
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error('INVITE_CODE_LIST_FAILED');
  return (data || []).map(formatInviteCode);
}

export async function revokeInviteCode(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw new Error('INVALID_INVITE_CODE');
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('REGISTRATION_NOT_CONFIGURED');
  const { data, error } = await client.from('registration_invite_codes')
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id).is('revoked_at', null).select('id').maybeSingle();
  if (error) throw new Error('INVITE_CODE_REVOKE_FAILED');
  return Boolean(data);
}

async function releaseReservations(client, session, invite) {
  if (!session) return;
  await client.rpc('release_registration_reservations', {
    p_challenge_id: session.challenge_id,
    p_challenge_reservation_id: session.reservation_id,
    p_invite_reservation_id: invite?.reservation_id || null
  });
}

export async function completeRegistration({ verificationToken, inviteCode, password, fullName }) {
  if (!isValidRegistrationPassword(password)) throw new Error('INVALID_PASSWORD');
  const normalizedName = normalizeDisplayName(fullName);
  if (!isValidDisplayName(normalizedName)) throw new Error('INVALID_DISPLAY_NAME');
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('REGISTRATION_NOT_CONFIGURED');

  const { data: sessionData, error: sessionError } = await client.rpc('reserve_registration_session', {
    p_token_hash: hashRegistrationValue(verificationToken, 'verification-token')
  });
  const session = Array.isArray(sessionData) ? sessionData[0] : sessionData;
  if (sessionError || !session?.challenge_id) throw new Error('REGISTRATION_SESSION_INVALID');

  let invite = null;
  try {
    const config = await registrationConfig();
    if (config.inviteRequired) {
      const normalizedCode = normalizeInviteCode(inviteCode);
      if (!isValidInviteCode(normalizedCode)) throw new Error('INVALID_INVITE_CODE');
      const { data, error } = await client.rpc('reserve_registration_invite', {
        p_code_hash: hashRegistrationValue(normalizedCode, 'invite-code')
      });
      invite = Array.isArray(data) ? data[0] : data;
      if (error || !invite?.invite_code_id) throw new Error('INVALID_INVITE_CODE');
    }

    const { data: userData, error: createError } = await client.auth.admin.createUser({
      email: session.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: normalizedName }
    });
    if (createError || !userData?.user) throw new Error('REGISTRATION_FAILED');

    const { data: completed, error: completeError } = await client.rpc('complete_registration', {
      p_challenge_id: session.challenge_id,
      p_challenge_reservation_id: session.reservation_id,
      p_user_id: userData.user.id,
      p_invite_code_id: invite?.invite_code_id || null,
      p_invite_reservation_id: invite?.reservation_id || null
    });
    if (completeError || completed !== true) {
      await client.auth.admin.deleteUser(userData.user.id).catch(() => undefined);
      throw new Error('REGISTRATION_FAILED');
    }
    await ensureProfileForUser(userData.user).catch(() => undefined);
    return { email: session.email };
  } catch (error) {
    await releaseReservations(client, session, invite);
    throw error;
  }
}
