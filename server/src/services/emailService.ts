import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT ?? '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:5173'
  const link = `${baseUrl}/verify-email?token=${token}`

  await transporter.sendMail({
    from: `"PTTI Attendance" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Verify your PTTI teacher account',
    html: `
      <p>Welcome to the PTTI Attendance System.</p>
      <p><a href="${link}">Click here to verify your email address</a></p>
      <p>If you did not sign up, ignore this email.</p>
    `,
  })
}
