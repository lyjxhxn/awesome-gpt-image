import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./main.jsx', import.meta.url), 'utf8');

test('registration uses one form with the requested field order and inline email sender', () => {
  const modalStart = source.indexOf('function AuthModal(');
  const submitLabels = source.indexOf('const submitLabels =', modalStart);
  const sendHandler = source.indexOf('async function handleSendRegistrationCode()', modalStart);
  assert.ok(sendHandler > modalStart && sendHandler < submitLabels, 'email sender must be defined inside AuthModal');
  const start = source.indexOf("{mode === 'register' ? (");
  const end = source.indexOf('{showsEmail ? (', start);
  assert.ok(start > 0 && end > start);
  const form = source.slice(start, end);
  const fields = [
    'inviteDisplayNameLabel',
    'passwordLabel',
    'confirmPasswordLabel',
    'emailLabel',
    'verificationCodeLabel',
    'inviteCodeLabel'
  ];
  let previous = -1;
  for (const field of fields) {
    const index = form.indexOf(field);
    assert.ok(index > previous, `${field} should appear after the previous registration field`);
    previous = index;
  }
  assert.match(form, /className="authEmailRow"/);
  assert.match(form, /onClick=\{handleSendRegistrationCode\}/);
});

test('registration submit verifies the email code before creating the account', () => {
  const registrationStart = source.indexOf("if (mode === 'register')");
  const registrationEnd = source.indexOf("if (mode === 'forgot')", registrationStart);
  const flow = source.slice(registrationStart, registrationEnd);
  const verifyIndex = flow.indexOf('/api/auth/registration/verify-code');
  const completeIndex = flow.indexOf('/api/auth/registration/complete');
  assert.ok(verifyIndex > 0);
  assert.ok(completeIndex > verifyIndex);
  assert.match(flow, /registrationEmailMatches\(sentRegistrationEmail, email\)/);
});
