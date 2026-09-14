import { readJsonBody } from '../_lib/billing.js';
import { validateSameOrigin } from '../_lib/community.js';
import { createInviteCode, listInviteCodes } from '../_lib/registration.js';
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
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, inviteCodes: await listInviteCodes() });
    }
    if (!validateSameOrigin(req)) return res.status(403).json({ ok: false, error: 'INVALID_ORIGIN' });
    if (Number(req.headers['content-length'] || 0) > 16 * 1024) {
      return res.status(413).json({ ok: false, error: 'INVALID_INVITE_CODE' });
    }
    const body = await readJsonBody(req);
    const inviteCode = await createInviteCode({
      code: body.code,
      maxUses: body.maxUses,
      createdBy: auth.user.id
    });
    return res.status(201).json({ ok: true, inviteCode });
  } catch (error) {
    const publicErrors = new Set(['INVALID_INVITE_CODE', 'INVALID_MAX_USES', 'INVITE_CODE_EXISTS']);
    return res.status(publicErrors.has(error.message) ? 400 : 500).json({
      ok: false,
      error: publicErrors.has(error.message) ? error.message : 'INVITE_CODE_FAILED'
    });
  }
}
