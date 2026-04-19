const PAYPAL_ENV = (process.env.PAYPAL_ENV || process.env.PAYPAL_ENVIRONMENT || "live").toLowerCase();
const PLACEHOLDER_PAYPAL_EMAILS = new Set([
  "merchant@example.com",
  "your-paypal-business-email@example.com"
]);

function isSandbox() {
  return PAYPAL_ENV === "sandbox";
}

function getIpnVerificationUrl() {
  return isSandbox()
    ? "https://ipnpb.sandbox.paypal.com/cgi-bin/webscr"
    : "https://ipnpb.paypal.com/cgi-bin/webscr";
}

function getExpectedReceiverEmail() {
  const value = (process.env.PAYPAL_RECEIVER_EMAIL || process.env.PAYPAL_BUSINESS_EMAIL || "").trim().toLowerCase();
  return PLACEHOLDER_PAYPAL_EMAILS.has(value) ? "" : value;
}

function getExpectedCurrency() {
  return (process.env.PAYPAL_EXPECTED_CURRENCY || "").trim().toUpperCase();
}

function getExpectedAmount() {
  return (process.env.PAYPAL_EXPECTED_AMOUNT || "").trim();
}

function getHostedPaymentLink() {
  return (process.env.PAYPAL_HOSTED_LINK_URL || "https://www.paypal.com/ncp/payment/QPWYGR3VT9PSQ").trim();
}

async function verifyPayPalIpn(rawBody) {
  const verificationBody = `cmd=_notify-validate&${rawBody}`;
  const response = await fetch(getIpnVerificationUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "website-questionnaire-saas-ipn-listener"
    },
    body: verificationBody
  });

  const text = (await response.text()).trim();
  return {
    ok: response.ok,
    status: response.status,
    body: text,
    verified: text === "VERIFIED"
  };
}

module.exports = {
  getExpectedAmount,
  getExpectedCurrency,
  getExpectedReceiverEmail,
  getHostedPaymentLink,
  getIpnVerificationUrl,
  isSandbox,
  verifyPayPalIpn
};
