export interface FraudSignal {
  rule: string;
  weight: number;
  detail: string;
}

export interface FraudResult {
  score: number;
  flagged: boolean;
  reasons: FraudSignal[];
}

export interface ShopifyAddressLike {
  country?: string | null;
  country_code?: string | null;
  zip?: string | null;
  postal_code?: string | null;
}

export interface ShopifyOrderLike {
  total_price?: string | number | null;
  currency?: string | null;
  email?: string | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
  } | null;
  billing_address?: ShopifyAddressLike | null;
  shipping_address?: ShopifyAddressLike | null;
}

const suspiciousEmailDomains = [
  'mailinator.com',
  'guerrillamail.com',
  'sharklasers.com',
  'tempmail',
];

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function scoreOrder(
  payload: ShopifyOrderLike,
  context: { avgOrderValue?: number; recentOrdersFromCustomer?: number },
): FraudResult {
  const reasons: FraudSignal[] = [];
  const totalPrice = Number(payload.total_price ?? 0);

  if (
    context.avgOrderValue !== undefined &&
    context.avgOrderValue > 0 &&
    Number.isFinite(totalPrice) &&
    totalPrice > context.avgOrderValue * 4
  ) {
    reasons.push({
      rule: 'abnormal_cart_value',
      weight: 35,
      detail: `Order value ${totalPrice} exceeds four times the average ${context.avgOrderValue.toFixed(2)}`,
    });
  }

  const billingCountry = normalized(
    payload.billing_address?.country_code ?? payload.billing_address?.country,
  );
  const shippingCountry = normalized(
    payload.shipping_address?.country_code ?? payload.shipping_address?.country,
  );
  const billingZip = normalized(
    payload.billing_address?.zip ?? payload.billing_address?.postal_code,
  );
  const shippingZip = normalized(
    payload.shipping_address?.zip ?? payload.shipping_address?.postal_code,
  );
  const countryMismatch = Boolean(
    billingCountry && shippingCountry && billingCountry !== shippingCountry,
  );
  const zipMismatch = Boolean(billingZip && shippingZip && billingZip !== shippingZip);

  if (countryMismatch || zipMismatch) {
    reasons.push({
      rule: 'address_mismatch',
      weight: 30,
      detail: [
        countryMismatch ? 'billing and shipping countries differ' : '',
        zipMismatch ? 'billing and shipping postal codes differ' : '',
      ].filter(Boolean).join('; '),
    });
  }

  if ((context.recentOrdersFromCustomer ?? 0) >= 3) {
    reasons.push({
      rule: 'rapid_fire_orders',
      weight: 25,
      detail: `${context.recentOrdersFromCustomer} recent orders from this customer`,
    });
  }

  const emailDomain = normalized(payload.email).split('@')[1] ?? '';
  if (emailDomain && suspiciousEmailDomains.some((domain) => emailDomain.includes(domain))) {
    reasons.push({
      rule: 'suspicious_email_domain',
      weight: 20,
      detail: `Email uses suspicious domain ${emailDomain}`,
    });
  }

  const customerName = normalized(
    payload.customer?.name ??
      [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(' '),
  );
  if (!customerName || /^(test|asdf)(\s+(test|asdf))?$/.test(customerName)) {
    reasons.push({
      rule: 'missing_or_placeholder_name',
      weight: 10,
      detail: customerName
        ? `Customer name appears to be a placeholder: ${customerName}`
        : 'Customer name is missing',
    });
  }

  const score = Math.min(100, reasons.reduce((sum, signal) => sum + signal.weight, 0));
  return { score, flagged: score >= 50, reasons };
}
