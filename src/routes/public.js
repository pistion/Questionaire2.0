const express = require("express");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const pool = require("../db");
const { getPublicAppUrl } = require("../lib/appUrl");
const {
  getExpectedAmount,
  getExpectedCurrency,
  getExpectedReceiverEmail,
  getHostedPaymentLink,
  verifyPayPalIpn
} = require("../lib/paypal");

const router = express.Router();

const DEFAULT_PAYMENT_PRICING = Object.freeze({
  domainPgk: 100,
  hostingPgk: 100,
  taxRate: 10,
  paymentCurrency: "USD"
});

const LOCAL_UPLOAD_ROOT = path.join(__dirname, "..", "..", "public", "uploads");
const MIME_EXTENSION_MAP = Object.freeze({
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf"
});

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function sanitizeFolder(folder) {
  return String(folder || "")
    .split(/[\\/]+/)
    .map((segment) => segment.trim().replace(/[^a-zA-Z0-9_-]+/g, "-"))
    .filter(Boolean)
    .join(path.sep);
}

function parseBase64Upload(fileBase64) {
  const match = String(fileBase64 || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid upload payload");
  }

  const mimeType = match[1].toLowerCase();
  const extension = MIME_EXTENSION_MAP[mimeType];

  if (!extension) {
    throw new Error(`Unsupported upload type: ${mimeType}`);
  }

  return {
    mimeType,
    extension,
    buffer: Buffer.from(match[2], "base64")
  };
}

async function saveUploadLocally(fileBase64, folder) {
  const safeFolder = sanitizeFolder(folder) || "questionnaire-saas";
  const { extension, buffer } = parseBase64Upload(fileBase64);
  const dirPath = path.join(LOCAL_UPLOAD_ROOT, safeFolder);
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`;
  const filePath = path.join(dirPath, fileName);

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return {
    url: `/${path.posix.join("uploads", ...safeFolder.split(path.sep), fileName)}`,
    publicId: path.posix.join(safeFolder.replace(/\\/g, "/"), fileName)
  };
}

function getStoredPayPalQuoteAmount() {
  const configured = process.env.PAYPAL_EXPECTED_AMOUNT;
  if (!configured) {
    return null;
  }

  const amount = Number(configured);
  return Number.isFinite(amount) ? roundMoney(amount) : null;
}

function calculatePaymentTotals({
  domainPgk = DEFAULT_PAYMENT_PRICING.domainPgk,
  hostingPgk = DEFAULT_PAYMENT_PRICING.hostingPgk,
  taxRate = DEFAULT_PAYMENT_PRICING.taxRate
} = {}) {
  const domainAmount = roundMoney(domainPgk);
  const hostingAmount = roundMoney(hostingPgk);
  const subtotal = roundMoney(domainAmount + hostingAmount);
  const taxAmount = roundMoney(subtotal * ((Number(taxRate) || 0) / 100));
  const total = roundMoney(subtotal + taxAmount);

  return {
    domainPgk: domainAmount,
    hostingPgk: hostingAmount,
    subtotalPgk: subtotal,
    taxRate: roundMoney(taxRate),
    taxPgk: taxAmount,
    totalPgk: total
  };
}

function buildReceiptSnapshot({
  submissionId,
  businessName,
  customerName,
  customerEmail,
  customerPhone,
  customerAddress,
  domainPgk = DEFAULT_PAYMENT_PRICING.domainPgk,
  hostingPgk = DEFAULT_PAYMENT_PRICING.hostingPgk,
  taxRate = DEFAULT_PAYMENT_PRICING.taxRate,
  paymentCurrency = DEFAULT_PAYMENT_PRICING.paymentCurrency,
  paypalQuoteAmount = getStoredPayPalQuoteAmount()
}) {
  return {
    submissionId,
    businessName: String(businessName || "").trim(),
    customerName: String(customerName || "").trim(),
    customerEmail: String(customerEmail || "").trim(),
    customerPhone: String(customerPhone || "").trim(),
    customerAddress: String(customerAddress || "").trim(),
    paymentCurrency: String(paymentCurrency || DEFAULT_PAYMENT_PRICING.paymentCurrency).trim().toUpperCase(),
    paypalQuoteAmount: paypalQuoteAmount === null ? null : roundMoney(paypalQuoteAmount),
    ...calculatePaymentTotals({ domainPgk, hostingPgk, taxRate })
  };
}

async function upsertPaymentReceipt(client, snapshot) {
  const result = await client.query(
    `INSERT INTO payment_receipts (
      submission_id,
      business_name,
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      domain_pgk,
      hosting_pgk,
      subtotal_pgk,
      tax_rate,
      tax_pgk,
      total_pgk,
      payment_currency,
      paypal_quote_amount,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,CURRENT_TIMESTAMP
    )
    ON CONFLICT (submission_id) DO UPDATE SET
      business_name = EXCLUDED.business_name,
      customer_name = EXCLUDED.customer_name,
      customer_email = EXCLUDED.customer_email,
      customer_phone = EXCLUDED.customer_phone,
      customer_address = EXCLUDED.customer_address,
      paypal_quote_amount = COALESCE(payment_receipts.paypal_quote_amount, EXCLUDED.paypal_quote_amount),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *`,
    [
      snapshot.submissionId,
      snapshot.businessName,
      snapshot.customerName,
      snapshot.customerEmail,
      snapshot.customerPhone,
      snapshot.customerAddress,
      snapshot.domainPgk,
      snapshot.hostingPgk,
      snapshot.subtotalPgk,
      snapshot.taxRate,
      snapshot.taxPgk,
      snapshot.totalPgk,
      snapshot.paymentCurrency
      ,
      snapshot.paypalQuoteAmount
    ]
  );

  return result.rows[0];
}

async function getQuestionnaireById(client, submissionId) {
  const result = await client.query(
    `SELECT *
     FROM questionnaires
     WHERE id = $1
     LIMIT 1`,
    [submissionId]
  );

  return result.rows[0] || null;
}

async function getPaymentReceiptBySubmissionId(client, submissionId) {
  const result = await client.query(
    `SELECT *
     FROM payment_receipts
     WHERE submission_id = $1
     LIMIT 1`,
    [submissionId]
  );

  return result.rows[0] || null;
}

async function ensurePaymentReceipt(client, questionnaire) {
  const existing = await getPaymentReceiptBySubmissionId(client, questionnaire.id);
  if (existing) {
    const storedQuoteAmount = getStoredPayPalQuoteAmount();
    if (existing.paypal_quote_amount === null && storedQuoteAmount !== null) {
      const result = await client.query(
        `UPDATE payment_receipts
         SET
           paypal_quote_amount = $1,
           updated_at = CURRENT_TIMESTAMP
         WHERE submission_id = $2
         RETURNING *`,
        [storedQuoteAmount, questionnaire.id]
      );

      return result.rows[0];
    }

    return existing;
  }

  return upsertPaymentReceipt(client, buildReceiptSnapshot({
    submissionId: questionnaire.id,
    businessName: questionnaire.business_name,
    customerName: questionnaire.contact_name,
    customerEmail: questionnaire.email,
    customerPhone: questionnaire.phone,
    customerAddress: questionnaire.home_address || questionnaire.address
  }));
}

function formatReceiptResponse(questionnaire, receipt, publicAppUrl = "") {
  return {
    submissionId: questionnaire.id,
    receiptId: receipt.id,
    businessName: receipt.business_name || questionnaire.business_name,
    customerName: receipt.customer_name || questionnaire.contact_name,
    customerEmail: receipt.customer_email || questionnaire.email,
    customerPhone: receipt.customer_phone || questionnaire.phone,
    customerAddress: receipt.customer_address || questionnaire.home_address || questionnaire.address,
    paymentStatus: questionnaire.payment_status,
    paymentTransactionId: questionnaire.payment_txn_id,
    paidAt: questionnaire.paid_at,
    publicAppUrl,
    paypalReturnUrl: publicAppUrl ? `${publicAppUrl}/checkout` : "",
    paypalIpnUrl: publicAppUrl ? `${publicAppUrl}/api/public/paypal/ipn` : "",
    paypalHostedLinkUrl: getHostedPaymentLink(),
    receipt: {
      domainPgk: Number(receipt.domain_pgk),
      hostingPgk: Number(receipt.hosting_pgk),
      subtotalPgk: Number(receipt.subtotal_pgk),
      taxRate: Number(receipt.tax_rate),
      taxPgk: Number(receipt.tax_pgk),
      totalPgk: Number(receipt.total_pgk),
      paymentCurrency: receipt.payment_currency,
      paypalQuoteAmount: receipt.paypal_quote_amount === null ? null : Number(receipt.paypal_quote_amount)
    }
  };
}

function matchesStoredQuote(receipt, amount, currency) {
  const normalizedCurrency = String(currency || "").trim().toUpperCase();
  const expectedCurrency = String(receipt?.payment_currency || "").trim().toUpperCase();

  if (normalizedCurrency && expectedCurrency && normalizedCurrency !== expectedCurrency) {
    return false;
  }

  if (receipt?.paypal_quote_amount === null || receipt?.paypal_quote_amount === undefined || amount === null || amount === undefined || amount === "") {
    return isExpectedAmount(amount) && isExpectedCurrency(currency);
  }

  const expectedAmount = Number(receipt.paypal_quote_amount);
  const actualAmount = Number(amount);

  if (!Number.isFinite(expectedAmount) || !Number.isFinite(actualAmount)) {
    return false;
  }

  return Math.abs(expectedAmount - actualAmount) <= 0.02;
}

async function updatePayPalPaymentStatus(client, txnId, paymentStatus) {
  const result = await client.query(
    `UPDATE paypal_payments
     SET payment_status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE txn_id = $2
     RETURNING *`,
    [paymentStatus, txnId]
  );

  return result.rows[0] || null;
}

function normalizePaymentStatus(value) {
  const status = String(value || "").trim().toLowerCase();

  switch (status) {
    case "completed":
    case "processed":
      return "paid";
    case "pending":
      return "pending";
    case "denied":
    case "failed":
    case "voided":
    case "canceled":
    case "cancelled":
      return "failed";
    case "refunded":
      return "refunded";
    case "reversed":
      return "reversed";
    case "review_required":
      return "review_required";
    default:
      return status ? status.replace(/\s+/g, "_") : "pending_verification";
  }
}

function parseSubmissionId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^\d+$/.test(text)) {
    return Number(text);
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return parseSubmissionId(parsed.submissionId || parsed.submission_id || parsed.id);
    }
  } catch (_error) {
    // Ignore JSON parsing errors and continue with pattern matching.
  }

  const match = text.match(/submission(?:_|-|\s*)?id\s*[:=]\s*(\d+)/i) || text.match(/submission[:#-](\d+)/i);
  return match ? Number(match[1]) : null;
}

function findSubmissionIdFromPayPalPayload(payload) {
  return parseSubmissionId(
    payload.custom ||
    payload.invoice ||
    payload.item_number ||
    payload.cm
  );
}

function isExpectedReceiverEmail(receiverEmail) {
  const expected = getExpectedReceiverEmail();
  if (!expected) {
    return true;
  }
  return String(receiverEmail || "").trim().toLowerCase() === expected;
}

function isExpectedAmount(amount) {
  const expected = getExpectedAmount();
  if (!expected) {
    return true;
  }
  return String(amount || "").trim() === expected;
}

function isExpectedCurrency(currency) {
  const expected = getExpectedCurrency();
  if (!expected) {
    return true;
  }
  return String(currency || "").trim().toUpperCase() === expected;
}

async function resolveSubmissionId(client, explicitSubmissionId, txnId, parentTxnId) {
  if (explicitSubmissionId) {
    return explicitSubmissionId;
  }

  const candidateIds = [txnId, parentTxnId].filter(Boolean);
  for (const candidateTxnId of candidateIds) {
    const linkedPayment = await client.query(
      `SELECT submission_id
       FROM paypal_payments
       WHERE txn_id = $1
         AND submission_id IS NOT NULL
       LIMIT 1`,
      [candidateTxnId]
    );

    if (linkedPayment.rows[0]?.submission_id) {
      return linkedPayment.rows[0].submission_id;
    }
  }

  if (parentTxnId) {
    const questionnaireMatch = await client.query(
      `SELECT id
       FROM questionnaires
       WHERE payment_txn_id = $1
       LIMIT 1`,
      [parentTxnId]
    );

    if (questionnaireMatch.rows[0]?.id) {
      return questionnaireMatch.rows[0].id;
    }
  }

  return null;
}

async function upsertPayPalPaymentFromIpn(client, payment) {
  const result = await client.query(
    `INSERT INTO paypal_payments (
      submission_id,
      provider,
      txn_id,
      parent_txn_id,
      payment_status,
      verification_status,
      payment_source,
      gross_amount,
      currency,
      payer_email,
      receiver_email,
      item_name,
      item_number,
      raw_payload,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,CURRENT_TIMESTAMP
    )
    ON CONFLICT (txn_id) DO UPDATE SET
      submission_id = COALESCE(paypal_payments.submission_id, EXCLUDED.submission_id),
      parent_txn_id = COALESCE(EXCLUDED.parent_txn_id, paypal_payments.parent_txn_id),
      payment_status = EXCLUDED.payment_status,
      verification_status = EXCLUDED.verification_status,
      payment_source = EXCLUDED.payment_source,
      gross_amount = COALESCE(EXCLUDED.gross_amount, paypal_payments.gross_amount),
      currency = COALESCE(EXCLUDED.currency, paypal_payments.currency),
      payer_email = COALESCE(EXCLUDED.payer_email, paypal_payments.payer_email),
      receiver_email = COALESCE(EXCLUDED.receiver_email, paypal_payments.receiver_email),
      item_name = COALESCE(EXCLUDED.item_name, paypal_payments.item_name),
      item_number = COALESCE(EXCLUDED.item_number, paypal_payments.item_number),
      raw_payload = COALESCE(EXCLUDED.raw_payload, paypal_payments.raw_payload),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *`,
    [
      payment.submissionId,
      "paypal",
      payment.txnId,
      payment.parentTxnId,
      payment.paymentStatus,
      "verified",
      "ipn",
      payment.amount,
      payment.currency,
      payment.payerEmail,
      payment.receiverEmail,
      payment.itemName,
      payment.itemNumber,
      payment.rawPayload
    ]
  );

  return result.rows[0];
}

async function linkPayPalPaymentFromReturn(client, payment) {
  const result = await client.query(
    `INSERT INTO paypal_payments (
      submission_id,
      provider,
      txn_id,
      payment_status,
      verification_status,
      payment_source,
      gross_amount,
      currency,
      raw_payload,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP
    )
    ON CONFLICT (txn_id) DO UPDATE SET
      submission_id = COALESCE(paypal_payments.submission_id, EXCLUDED.submission_id),
      gross_amount = COALESCE(paypal_payments.gross_amount, EXCLUDED.gross_amount),
      currency = COALESCE(paypal_payments.currency, EXCLUDED.currency),
      raw_payload = COALESCE(EXCLUDED.raw_payload, paypal_payments.raw_payload),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *`,
    [
      payment.submissionId,
      "paypal",
      payment.txnId,
      "pending_verification",
      "unverified",
      "return",
      payment.amount,
      payment.currency,
      payment.rawPayload
    ]
  );

  return result.rows[0];
}

async function syncQuestionnairePaymentState(client, submissionId, payment) {
  if (!submissionId) {
    return null;
  }

  const nextStatus = payment.verification_status === "verified"
    ? payment.payment_status
    : payment.payment_status === "review_required"
      ? "review_required"
      : "pending_verification";

  const result = await client.query(
    `UPDATE questionnaires
     SET
       payment_status = $1,
       payment_txn_id = COALESCE($2, payment_txn_id),
       payment_amount = COALESCE($3, payment_amount),
       payment_currency = COALESCE($4, payment_currency),
       paid_at = CASE
         WHEN $1 = 'paid' THEN COALESCE(paid_at, CURRENT_TIMESTAMP)
         ELSE paid_at
       END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING id, business_name, payment_status, payment_txn_id, payment_amount, payment_currency, paid_at`,
    [
      nextStatus,
      payment.txn_id,
      payment.gross_amount,
      payment.currency,
      submissionId
    ]
  );

  return result.rows[0] || null;
}

router.post("/uploads", async (req, res) => {
  const { fileBase64, folder = "questionnaire-saas" } = req.body || {};

  if (!fileBase64) {
    return res.status(400).json({ error: "fileBase64 is required" });
  }

  try {
    const uploaded = await saveUploadLocally(fileBase64, folder);
    res.json(uploaded);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Upload failed" });
  }
});

router.post("/paypal/ipn", async (req, res) => {
  let client;

  try {
    if (!req.rawBody) {
      return res.status(400).send("Missing PayPal payload");
    }

    const verification = await verifyPayPalIpn(req.rawBody);
    if (!verification.verified) {
      console.warn("PayPal IPN verification failed:", verification.status, verification.body);
      return res.status(400).send("INVALID");
    }

    client = await pool.connect();
    const data = req.body || {};
    const txnId = data.txn_id || data.parent_txn_id || "";

    if (!txnId) {
      console.warn("Verified PayPal IPN received without txn_id.");
      return res.status(200).send("OK");
    }

    let paymentStatus = normalizePaymentStatus(data.payment_status);
    const receiverEmailMatches = isExpectedReceiverEmail(data.receiver_email);
    const amountMatches = isExpectedAmount(data.mc_gross);
    const currencyMatches = isExpectedCurrency(data.mc_currency);

    if (!receiverEmailMatches || !amountMatches || !currencyMatches) {
      paymentStatus = "review_required";
    }

    await client.query("BEGIN");

    const knownSubmissionId = await resolveSubmissionId(
      client,
      findSubmissionIdFromPayPalPayload(data),
      txnId,
      data.parent_txn_id
    );

    const receipt = knownSubmissionId
      ? await getPaymentReceiptBySubmissionId(client, knownSubmissionId)
      : null;

    if (receipt && !matchesStoredQuote(receipt, data.mc_gross, data.mc_currency)) {
      paymentStatus = "review_required";
    }

    const payment = await upsertPayPalPaymentFromIpn(client, {
      submissionId: knownSubmissionId,
      txnId,
      parentTxnId: data.parent_txn_id || "",
      paymentStatus,
      amount: data.mc_gross || "",
      currency: data.mc_currency || "",
      payerEmail: data.payer_email || "",
      receiverEmail: data.receiver_email || "",
      itemName: data.item_name || "",
      itemNumber: data.item_number || "",
      rawPayload: req.rawBody
    });

    let questionnaire = null;
    if (payment.submission_id) {
      questionnaire = await syncQuestionnairePaymentState(client, payment.submission_id, payment);
    }

    await client.query("COMMIT");
    res.status(200).send("OK");

    if (paymentStatus === "review_required") {
      console.warn("PayPal IPN marked for review.", {
        txnId,
        receiverEmailMatches,
        amountMatches,
        currencyMatches
      });
    }

    if (questionnaire) {
      console.log("Updated questionnaire payment status from PayPal IPN.", {
        submissionId: questionnaire.id,
        paymentStatus: questionnaire.payment_status,
        txnId
      });
    }
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error("PayPal IPN processing error:", error);
    res.status(error.code === "DB_NOT_CONFIGURED" ? 503 : 500).send("ERROR");
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post("/paypal/confirm-return", async (req, res) => {
  let client;

  try {
    client = await pool.connect();
    const submissionId = parseSubmissionId(req.body?.submissionId);
    const txnId = String(req.body?.transactionId || "").trim();

    if (!submissionId || !txnId) {
      return res.status(400).json({ error: "submissionId and transactionId are required" });
    }

    await client.query("BEGIN");
    const questionnaireRecord = await getQuestionnaireById(client, submissionId);
    if (!questionnaireRecord) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Submission not found" });
    }

    let payment = await linkPayPalPaymentFromReturn(client, {
      submissionId,
      txnId,
      amount: String(req.body?.amount || "").trim(),
      currency: String(req.body?.currency || "").trim().toUpperCase(),
      rawPayload: JSON.stringify(req.body || {})
    });

    const receipt = await ensurePaymentReceipt(client, questionnaireRecord);

    if (!matchesStoredQuote(receipt, req.body?.amount, req.body?.currency)) {
      payment = await updatePayPalPaymentStatus(client, txnId, "review_required") || payment;
    }

    const questionnaire = await syncQuestionnairePaymentState(client, submissionId, payment);
    await client.query("COMMIT");

    res.json({
      success: true,
      item: {
        submissionId,
        transactionId: txnId,
        paymentStatus: questionnaire?.payment_status || payment.payment_status,
        verificationStatus: payment.verification_status
      }
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error("PayPal return confirmation error:", error);
    res.status(error.code === "DB_NOT_CONFIGURED" ? 503 : 500).json({
      error: "Failed to link PayPal transaction",
      details: error.message
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get("/checkout/:submissionId", async (req, res) => {
  try {
    const submissionId = parseSubmissionId(req.params.submissionId);
    if (!submissionId) {
      return res.status(400).json({ error: "Invalid submission id" });
    }

    const client = await pool.connect();
    try {
      const questionnaire = await getQuestionnaireById(client, submissionId);
      if (!questionnaire) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const receipt = await ensurePaymentReceipt(client, questionnaire);
      const publicAppUrl = getPublicAppUrl(req);
      res.json({
        success: true,
        item: formatReceiptResponse(questionnaire, receipt, publicAppUrl)
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Checkout receipt load error:", error);
    res.status(error.code === "DB_NOT_CONFIGURED" ? 503 : 500).json({
      error: "Failed to load checkout receipt",
      details: error.message
    });
  }
});

router.get("/paypal/config", (req, res) => {
  const publicAppUrl = getPublicAppUrl(req);

  res.json({
    success: true,
    item: {
      publicAppUrl,
      paypalHostedLinkUrl: getHostedPaymentLink(),
      paypalReturnUrl: publicAppUrl ? `${publicAppUrl}/checkout` : "",
      paypalIpnUrl: publicAppUrl ? `${publicAppUrl}/api/public/paypal/ipn` : "",
      expectedAmount: getExpectedAmount(),
      expectedCurrency: getExpectedCurrency(),
      expectedReceiverEmail: getExpectedReceiverEmail()
    }
  });
});

router.post("/questionnaires", async (req, res) => {
  let client;

  try {
    client = await pool.connect();
    const data = req.body || {};
    const products = Array.isArray(data.products) ? data.products : [];

    await client.query("BEGIN");

    const questionnaireResult = await client.query(
      `INSERT INTO questionnaires (
        business_name, contact_name, first_name, middle_name, surname, nid_number,
        email, phone, address, home_address, social_links,
        facebook_url, linkedin_url, instagram_url, tiktok_url, other_social_url,
        government_tax_number, collection_business_tax_number,
        short_description, services, unique_point, audience,
        about_description, story, mission, achievements,
        portrait_url, logo_url, brand_colors, website_style,
        website_build_type, example_websites, store_policies_text, store_policies_pdf_url,
        notes, requested_features
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,
        $17,$18,
        $19,$20,$21,$22,
        $23,$24,$25,$26,
        $27,$28,$29,$30,
        $31,$32,$33,$34,
        $35,$36
      )
      RETURNING id`,
      [
        data.businessName,
        data.contactName,
        data.firstName,
        data.middleName,
        data.surname,
        data.nidNumber,
        data.email,
        data.phone,
        data.address,
        data.homeAddress,
        data.socialLinks,
        data.facebookLink,
        data.linkedinLink,
        data.instagramLink,
        data.tiktokLink,
        data.otherSocialLink,
        data.governmentTaxNumber,
        data.collectionBusinessTaxNumber,
        data.shortDescription,
        data.services,
        data.uniquePoint,
        data.audience,
        data.aboutDescription,
        data.story,
        data.mission,
        data.achievements,
        data.portraitUrl,
        data.logoUrl,
        data.brandColors,
        data.websiteStyle,
        data.websiteBuildType,
        data.exampleWebsites,
        data.storePolicies,
        data.storePoliciesPdfUrl,
        data.notes,
        data.requestedFeatures
      ]
    );

    const questionnaireId = questionnaireResult.rows[0].id;

    for (let i = 0; i < products.length; i += 1) {
      const product = products[i];
      const productResult = await client.query(
        `INSERT INTO products (
          questionnaire_id, name, price, description, category, stock, sort_order
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id`,
        [
          questionnaireId,
          product.name || "",
          product.price || "",
          product.description || "",
          product.category || "",
          product.stock || "",
          i
        ]
      );

      const productId = productResult.rows[0].id;
      const images = Array.isArray(product.images) ? product.images : [];

      for (let j = 0; j < images.length; j += 1) {
        await client.query(
          `INSERT INTO product_images (product_id, image_url, sort_order)
           VALUES ($1, $2, $3)`,
          [productId, images[j], j]
        );
      }
    }

    await upsertPaymentReceipt(client, buildReceiptSnapshot({
      submissionId: questionnaireId,
      businessName: data.businessName,
      customerName: data.contactName,
      customerEmail: data.email,
      customerPhone: data.phone,
      customerAddress: data.homeAddress || data.address
    }));

    await client.query("COMMIT");
    res.status(201).json({ success: true, id: questionnaireId });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error("Database Error:", error);
    res.status(error.code === "DB_NOT_CONFIGURED" ? 503 : 500).json({ 
      error: "Failed to save questionnaire", 
      details: error.message,
      code: error.code,
      env: process.env.NODE_ENV
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Read-only endpoint for viewer.html with simple password protection
router.get("/view-submissions", async (req, res) => {
  const pwd = req.query.pwd;
  const expected = process.env.VIEWER_PASSWORD || "viewer123";

  if (pwd !== expected) {
    return res.status(403).json({ error: "Unauthorized. Incorrect password." });
  }

  try {
    const result = await pool.query(
      `SELECT
        q.*,
        (SELECT JSON_AGG(p_data) FROM (
          SELECT p.*, (SELECT JSON_AGG(i.image_url) FROM product_images i WHERE i.product_id = p.id) as images
          FROM products p WHERE p.questionnaire_id = q.id ORDER BY p.sort_order ASC
        ) p_data) as products
       FROM questionnaires q
       ORDER BY q.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(error.code === "DB_NOT_CONFIGURED" ? 503 : 500).json({ error: error.message || "Failed to fetch submissions" });
  }
});

module.exports = router;
