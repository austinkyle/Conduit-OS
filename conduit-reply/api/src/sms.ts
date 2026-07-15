export interface SmsResult {
  simulated: boolean;
  success: boolean;
}

// Callers must scrub body text for PII before invoking this function.
export async function sendSms(toNumber: string, body: string): Promise<SmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    console.log('[simulated SMS]', { to: toNumber, body });
    return { simulated: true, success: true };
  }
  try {
    const form = new URLSearchParams({ To: toNumber, From: fromNumber, Body: body });
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return { simulated: false, success: true };
  } catch (error) {
    console.warn('Twilio SMS send failed', error);
    return { simulated: false, success: false };
  }
}
