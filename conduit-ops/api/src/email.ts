export interface EmailResult {
  simulated: boolean;
  success: boolean;
}

export async function sendEmail(toEmail: string, subject: string, body: string): Promise<EmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    console.log('[simulated email]', { to: toEmail, subject, body });
    return { simulated: true, success: true };
  }
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: fromEmail },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return { simulated: false, success: true };
  } catch (error) {
    console.warn('SendGrid email send failed', error);
    return { simulated: false, success: false };
  }
}
