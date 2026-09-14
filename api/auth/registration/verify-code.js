import { readJsonBody } from '../../_lib/billing.js';
import { validateSameOrigin } from '../../_lib/community.js';
import { verifyRegistrationCode } from '../../_lib/registration.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  if (!validateSameOrigin(req)) return res.status(403).json({ ok: false, error: 'INVALID_ORIGIN' });
  try {
    const body = await readJsonBody(req);
    const result = await verifyRegistrationCode({ email: body.email, code: body.code, req });
    return res.status(200).json({ ok: true, verificationToken: result.verificationToken });
  } catch (error) {
    if (error.message === 'AUTH_RATE_LIMITED') return res.status(429).json({ ok: false, error: 'AUTH_RATE_LIMITED' });
    return res.status(400).json({ ok: false, error: 'INVALID_VERIFICATION_CODE' });
  }
}
