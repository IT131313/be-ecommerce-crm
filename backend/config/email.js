const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendResetPinEmail = async (email, pin) => {
  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@yourapp.com',
    to: email,
    subject: 'Password Reset Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>You have requested to reset your password. Please use the following code:</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #333; font-size: 36px; margin: 0;">${pin}</h1>
        </div>
        <p>This code will expire in 15 minutes for security reasons.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendResetPinEmail
};