const { Resend } = require('resend');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173';
const FROM = process.env.EMAIL_FROM || 'Quizify <onboarding@resend.dev>';

async function sendVerificationEmail(email, token) {
  const link = `${FRONTEND}/verify-email?token=${token}`;

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`\n[EMAIL] RESEND_API_KEY not set. Verification link for ${email}:\n${link}\n`);
    return;
  }

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
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

  if (error) {
    console.error('[EMAIL] Resend error:', JSON.stringify(error));
    throw new Error(error.message || 'Email send failed');
  }

  console.log(`[EMAIL] Sent to ${email}, id: ${data?.id}`);
}

module.exports = { sendVerificationEmail };
