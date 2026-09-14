import { createInviteCode } from '../api/_lib/registration.js';

const code = process.argv[2] || '';
const maxUses = process.argv[3] || null;
try {
  const result = await createInviteCode({ code, maxUses, createdBy: null });
  console.log(`Invite code created: ${result.codeHint}; max uses: ${result.maxUses ?? 'unlimited'}`);
} catch (error) {
  console.error('Usage: npm run auth:bootstrap-code -- nasmy 20');
  console.error(`Failed to create invite code: ${error.message}`);
  process.exitCode = 1;
}
