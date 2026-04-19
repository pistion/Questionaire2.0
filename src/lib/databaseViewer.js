const TABLE_QUERIES = Object.freeze({
  admins: "SELECT id, name, email, created_at FROM admins ORDER BY created_at DESC",
  questionnaires: "SELECT * FROM questionnaires ORDER BY created_at DESC",
  products: "SELECT * FROM products ORDER BY questionnaire_id ASC, sort_order ASC, id ASC",
  product_images: "SELECT * FROM product_images ORDER BY product_id ASC, sort_order ASC, id ASC",
  payment_receipts: "SELECT * FROM payment_receipts ORDER BY updated_at DESC, id DESC",
  paypal_payments: "SELECT * FROM paypal_payments ORDER BY created_at DESC, id DESC"
});

function isMediaUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function buildSubmissionMedia(questionnaire, products) {
  const media = [];

  if (isMediaUrl(questionnaire.portrait_url)) {
    media.push({
      kind: "portrait",
      label: "Portrait Photo",
      sourceTable: "questionnaires",
      url: questionnaire.portrait_url
    });
  }

  if (isMediaUrl(questionnaire.logo_url)) {
    media.push({
      kind: "logo",
      label: "Business Logo",
      sourceTable: "questionnaires",
      url: questionnaire.logo_url
    });
  }

  if (isMediaUrl(questionnaire.store_policies_pdf_url)) {
    media.push({
      kind: "policy_pdf",
      label: "Store Policies PDF",
      sourceTable: "questionnaires",
      url: questionnaire.store_policies_pdf_url
    });
  }

  products.forEach((product, productIndex) => {
    (product.images || []).forEach((imageUrl, imageIndex) => {
      if (!isMediaUrl(imageUrl)) {
        return;
      }

      media.push({
        kind: "product_image",
        label: `${product.name || `Product ${productIndex + 1}`} Image ${imageIndex + 1}`,
        sourceTable: "product_images",
        productId: product.id,
        productName: product.name,
        url: imageUrl
      });
    });
  });

  return media;
}

function createSubmissionSnapshots(tables) {
  const productImagesByProductId = new Map();
  tables.product_images.forEach((row) => {
    const existing = productImagesByProductId.get(row.product_id) || [];
    existing.push(row.image_url);
    productImagesByProductId.set(row.product_id, existing);
  });

  const productsBySubmissionId = new Map();
  tables.products.forEach((row) => {
    const existing = productsBySubmissionId.get(row.questionnaire_id) || [];
    existing.push({
      ...row,
      images: productImagesByProductId.get(row.id) || []
    });
    productsBySubmissionId.set(row.questionnaire_id, existing);
  });

  const receiptBySubmissionId = new Map(
    tables.payment_receipts.map((row) => [row.submission_id, row])
  );

  const paymentsBySubmissionId = new Map();
  tables.paypal_payments.forEach((row) => {
    const key = row.submission_id || `unlinked:${row.id}`;
    const existing = paymentsBySubmissionId.get(key) || [];
    existing.push(row);
    paymentsBySubmissionId.set(key, existing);
  });

  return tables.questionnaires.map((questionnaire) => {
    const products = productsBySubmissionId.get(questionnaire.id) || [];
    const payments = paymentsBySubmissionId.get(questionnaire.id) || [];
    const receipt = receiptBySubmissionId.get(questionnaire.id) || null;

    return {
      ...questionnaire,
      products,
      payments,
      receipt,
      media: buildSubmissionMedia(questionnaire, products)
    };
  });
}

function buildViewerSummary(tables, submissions) {
  const paidSubmissions = submissions.filter((item) => item.payment_status === "paid").length;
  const pendingPayments = submissions.filter((item) => item.payment_status && item.payment_status !== "paid").length;
  const pendingReview = submissions.filter((item) => ["new", "in_review"].includes(item.status)).length;
  const mediaAssets = submissions.reduce((total, item) => total + item.media.length, 0);

  return {
    totalSubmissions: submissions.length,
    totalProducts: tables.products.length,
    totalMediaAssets: mediaAssets,
    paidSubmissions,
    pendingPayments,
    pendingReview,
    lastSubmissionAt: submissions[0]?.created_at || null,
    tableCounts: Object.fromEntries(
      Object.entries(tables).map(([key, rows]) => [key, rows.length])
    )
  };
}

async function loadDatabaseViewerPayload(queryable) {
  const entries = Object.entries(TABLE_QUERIES);
  const results = await Promise.all(entries.map(([, query]) => queryable.query(query)));

  const tables = Object.fromEntries(
    entries.map(([key], index) => [key, results[index].rows])
  );

  const submissions = createSubmissionSnapshots(tables);
  const summary = buildViewerSummary(tables, submissions);

  return {
    summary,
    tables,
    submissions
  };
}

module.exports = {
  TABLE_QUERIES,
  loadDatabaseViewerPayload
};
