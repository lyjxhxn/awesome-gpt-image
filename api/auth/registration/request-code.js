import { readJsonBody } from '../../_lib/billing.js';
import { validateSameOrigin } from '../../_lib/community.js';
import { requestRegistrationCode } from '../../_lib/registration.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  if (!validateSameOrigin(req)) return res.status(403).json({ ok: false, error: 'INVALID_ORIGIN' });
  if (Number(req.headers['content-length'] || 0) > 16 * 1024) {
    return res.status(413).json({ ok: false, error: 'INVALID_EMAIL' });
  }
  try {
    const body = await readJsonBody(req);
    return res.status(200).json({ ok: true, ...await requestRegistrationCode({ email: body.email, req }) });
  } catch (error) {
    if (error.message === 'INVALID_EMAIL') return res.status(400).json({ ok: false, error: 'INVALID_EMAIL' });
    if (error.message === 'AUTH_RATE_LIMITED') return res.status(429).json({ ok: false, error: 'AUTH_RATE_LIMITED' });
    return res.status(500).json({ ok: false, error: 'REGISTRATION_CODE_FAILED' });
  }
}
