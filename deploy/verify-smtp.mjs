import nodemailer from 'nodemailer';

const port = Number(process.env.SMTP_PORT);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true' || port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000
});

try {
  await transporter.verify();
  console.log('SMTP_VERIFY_OK');
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    code: error?.code || null,
    command: error?.command || null,
    responseCode: error?.responseCode || null
  }));
  process.exitCode = 2;
}
