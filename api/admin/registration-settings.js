import { readJsonBody } from '../_lib/billing.js';
import { validateSameOrigin } from '../_lib/community.js';
import { registrationConfig, updateRegistrationConfig } from '../_lib/registration.js';
import { getAuthContext } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = await getAuthContext(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  if (auth.profile?.role !== 'super_admin') return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  try {
    if (req.method === 'GET') return res.status(200).json({ ok: true, ...await registrationConfig() });
    if (!validateSameOrigin(req)) return res.status(403).json({ ok: false, error: 'INVALID_ORIGIN' });
    const body = await readJsonBody(req);
    if (typeof body.inviteRequired !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'INVALID_REGISTRATION_SETTING' });
    }
    return res.status(200).json({
      ok: true,
      ...await updateRegistrationConfig(body.inviteRequired, auth.user.id)
    });
  } catch {
    return res.status(500).json({ ok: false, error: 'REGISTRATION_CONFIG_UPDATE_FAILED' });
  }
}
