/**
 * Generate OTP email template
 */
export const generateOTPEmail = (
  otp: string,
  expiryMinutes: number = 10
): { subject: string; html: string; text: string } => {
  return {
    subject: "Verify Your Email - Swami Om Enterprises",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            padding: 40px 30px;
          }
          .content p {
            color: #333333;
            line-height: 1.6;
            margin: 0 0 20px 0;
          }
          .otp-box {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            padding: 25px;
            text-align: center;
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 12px;
            border-radius: 8px;
            margin: 30px 0;
            font-family: 'Courier New', monospace;
          }
          .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .info-box p {
            margin: 5px 0;
            font-size: 14px;
            color: #555555;
          }
          .warning {
            color: #dc3545;
            font-weight: 600;
          }
          .footer {
            background: #f8f9fa;
            padding: 20px 30px;
            text-align: center;
            border-top: 1px solid #e9ecef;
          }
          .footer p {
            margin: 5px 0;
            color: #6c757d;
            font-size: 12px;
          }
          .footer a {
            color: #667eea;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Email Verification</h1>
          </div>
          
          <div class="content">
            <p>Welcome to <strong>Swami Om Enterprises</strong>!</p>
            <p>To complete your registration, please verify your email address by entering the verification code below:</p>
            
            <div class="otp-box">${otp}</div>
            
            <div class="info-box">
              <p>⏱ <strong>Valid for:</strong> ${expiryMinutes} minutes</p>
              <p>🔢 <strong>Code:</strong> ${otp}</p>
              <p class="warning">🔒 <strong>Important:</strong> Do not share this code with anyone</p>
            </div>
            
            <p>If you didn't request this verification code, please ignore this email. Your account will not be created without verification.</p>
            
            <p style="margin-top: 30px;">Best regards,<br><strong>Swami Om Enterprises Team</strong></p>
          </div>
          
          <div class="footer">
            <p>This is an automated email, please do not reply directly to this message.</p>
            <p>&copy; ${new Date().getFullYear()} Swami Om Enterprises. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Welcome to Swami Om Enterprises!

To complete your registration, please verify your email address.

Your verification code is: ${otp}

This code is valid for ${expiryMinutes} minutes.
Do not share this code with anyone.

If you didn't request this verification code, please ignore this email.

Best regards,
Swami Om Enterprises Team

---
This is an automated email, please do not reply.
© ${new Date().getFullYear()} Swami Om Enterprises. All rights reserved.
    `.trim(),
  }
}
