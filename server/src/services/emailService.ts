import nodemailer from 'nodemailer'
import { URL } from 'url'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT ?? '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:5173'

  let verifyUrl: URL
  try {
    verifyUrl = new URL('/verify-email', baseUrl)
    verifyUrl.searchParams.set('token', token)
  } catch {
    throw new Error('Invalid CLIENT_URL environment variable')
  }

  const safeLink = escapeHtml(verifyUrl.toString())

  await transporter.sendMail({
    from: `"PTTI Attendance" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Verify your PTTI teacher account',
    html: `
      <p>Welcome to the PTTI Attendance System.</p>
      <p><a href="${safeLink}">Click here to verify your email address</a></p>
      <p>This link expires in 24 hours. If you did not sign up, ignore this email.</p>
    `,
  })
}
