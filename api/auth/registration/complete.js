import { readJsonBody } from '../../_lib/billing.js';
import { validateSameOrigin } from '../../_lib/community.js';
import { completeRegistration } from '../../_lib/registration.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  if (!validateSameOrigin(req)) return res.status(403).json({ ok: false, error: 'INVALID_ORIGIN' });
  if (Number(req.headers['content-length'] || 0) > 16 * 1024) {
    return res.status(413).json({ ok: false, error: 'REGISTRATION_FAILED' });
  }
  try {
    const body = await readJsonBody(req);
    const result = await completeRegistration({
      verificationToken: body.verificationToken,
      inviteCode: body.inviteCode,
      password: body.password,
      fullName: body.fullName
    });
    return res.status(201).json({ ok: true, email: result.email });
  } catch (error) {
    const publicErrors = new Set([
      'INVALID_PASSWORD', 'INVALID_DISPLAY_NAME', 'INVALID_INVITE_CODE', 'REGISTRATION_SESSION_INVALID'
    ]);
    return res.status(400).json({
      ok: false,
      error: publicErrors.has(error.message) ? error.message : 'REGISTRATION_FAILED'
    });
  }
}
