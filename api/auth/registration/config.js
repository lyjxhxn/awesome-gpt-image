import { registrationConfig } from '../../_lib/registration.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  try {
    return res.status(200).json({ ok: true, ...await registrationConfig() });
  } catch {
    return res.status(500).json({ ok: false, error: 'REGISTRATION_NOT_CONFIGURED' });
  }
}
