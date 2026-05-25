const nodemailer = require('nodemailer');

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

const FROM = process.env.EMAIL_FROM || 'Quizify <noreply@quizify.org>';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';

async function sendVerificationEmail(email, token) {
  const link = `${FRONTEND}/verify-email?token=${token}`;
  const transport = createTransport();

  if (!transport) {
    console.log(`\n[EMAIL] Verification link for ${email}:\n${link}\n`);
    return;
  }

  await transport.sendMail({
    from: FROM,
    to: email,
    subject: 'Подтвердите ваш email — Quizify',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#4f46e5">Подтверждение email</h2>
        <p>Спасибо за регистрацию в Quizify!</p>
        <p>Нажмите кнопку ниже, чтобы подтвердить адрес электронной почты и получить возможность создавать тесты:</p>
        <a href="${link}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Подтвердить email
        </a>
        <p style="color:#6b7280;font-size:13px">Ссылка действительна 24 часа. Если вы не регистрировались — просто проигнорируйте это письмо.</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail };
