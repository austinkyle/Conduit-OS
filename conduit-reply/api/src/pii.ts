function passesLuhn(digits: string): boolean {
  let sum = 0;
  let doubleDigit = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

export function scrubPii(text: string): string {
  let scrubbed = text.replace(
    /(?<!\d)(?:\d{13,19}|(?:\d{4}[ -]){3}\d{1,7})(?!\d)/g,
    (match) => {
      const digits = match.replace(/[ -]/g, '');
      return passesLuhn(digits) ? '[REDACTED_CARD]' : match;
    },
  );

  scrubbed = scrubbed.replace(/\d{3}-\d{2}-\d{4}/g, '[REDACTED_SSN]');
  scrubbed = scrubbed.replace(
    /\b(cvv|cvc|security code)(\s*(?:(?:is\s*)?:?)\s*)(\d{3,4})\b/gi,
    (_match, label: string, separator: string) =>
      `${label}${separator}[REDACTED_CVV]`,
  );
  scrubbed = scrubbed.replace(
    /\b(password)(\s*(?:(?:is\s*)?:?)\s*)(\S+)/gi,
    (_match, label: string, separator: string) =>
      `${label}${separator}[REDACTED_PASSWORD]`,
  );

  return scrubbed;
}
