const PAYPAL_ENV = (process.env.PAYPAL_ENV || process.env.PAYPAL_ENVIRONMENT || "live").toLowerCase();

function isSandbox() {
  return PAYPAL_ENV === "sandbox";
}

function getIpnVerificationUrl() {
  return isSandbox()
    ? "https://ipnpb.sandbox.paypal.com/cgi-bin/webscr"
    : "https://ipnpb.paypal.com/cgi-bin/webscr";
}

function getExpectedReceiverEmail() {
  return (process.env.PAYPAL_RECEIVER_EMAIL || process.env.PAYPAL_BUSINESS_EMAIL || "").trim().toLowerCase();
}

function getExpectedCurrency() {
  return (process.env.PAYPAL_EXPECTED_CURRENCY || "").trim().toUpperCase();
}

function getExpectedAmount() {
  return (process.env.PAYPAL_EXPECTED_AMOUNT || "").trim();
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
  getIpnVerificationUrl,
  isSandbox,
  verifyPayPalIpn
};
