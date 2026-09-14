import { readJsonBody } from '../../_lib/billing.js';
import { validateSameOrigin } from '../../_lib/community.js';
import { revokeInviteCode } from '../../_lib/registration.js';
import { getAuthContext } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = await getAuthContext(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  if (auth.profile?.role !== 'super_admin') return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  if (!validateSameOrigin(req)) return res.status(403).json({ ok: false, error: 'INVALID_ORIGIN' });
  try {
    const body = await readJsonBody(req);
    const revoked = await revokeInviteCode(body.id);
    return res.status(revoked ? 200 : 409).json({ ok: revoked, error: revoked ? undefined : 'INVALID_INVITE_CODE' });
  } catch {
    return res.status(500).json({ ok: false, error: 'INVITE_CODE_FAILED' });
  }
}
