/**
 * Quick email diagnostic — run with:
 *   node test-email.js
 * from the haledlena/ directory
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

async function test() {
  console.log('\n=== EMAIL CONFIG ===');
  console.log('HOST :', process.env.EMAIL_HOST);
  console.log('PORT :', process.env.EMAIL_PORT, '(type:', typeof process.env.EMAIL_PORT, ')');
  console.log('USER :', process.env.EMAIL_USER);
  console.log('PASS :', process.env.EMAIL_PASS ? `[${process.env.EMAIL_PASS.length} chars]` : 'MISSING');
  console.log('FROM :', process.env.EMAIL_FROM);
  console.log('ADMIN:', process.env.ADMIN_EMAIL);
  console.log('===================\n');

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // Step 1: verify the SMTP connection & credentials
  console.log('Step 1: Verifying SMTP connection...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection OK — credentials accepted by Gmail\n');
  } catch (err) {
    console.error('❌ SMTP verify FAILED:');
    console.error('   Code   :', err.code);
    console.error('   Message:', err.message);
    console.error('\nCommon causes:');
    console.error('  EAUTH      → Wrong app password or 2FA not enabled');
    console.error('  ECONNECTION → Firewall/network blocking port 587');
    console.error('  ETIMEDOUT  → No internet / port blocked by ISP');
    process.exit(1);
  }

  // Step 2: send the actual test email
  console.log('Step 2: Sending test email to', process.env.ADMIN_EMAIL, '...');
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.ADMIN_EMAIL,
      subject: '✅ Haled&Lena — Email test',
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px;">
          <h2>✅ Email is working!</h2>
          <p>Sent at: <strong>${new Date().toISOString()}</strong></p>
          <p>If you see this, admin notifications will work when orders are placed.</p>
        </div>
      `,
    });
    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('\nCheck your inbox (and spam folder) at:', process.env.ADMIN_EMAIL);
  } catch (err) {
    console.error('❌ Send FAILED:');
    console.error('   Code   :', err.code);
    console.error('   Message:', err.message);
    process.exit(1);
  }
}

test();
