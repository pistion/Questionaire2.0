const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/questionnaires", async (req, res) => {
  const status = req.query.status;
  const values = [];
  let where = "";

  if (status) {
    values.push(status);
    where = "WHERE q.status = $1";
  }

  const result = await pool.query(
    `SELECT
      q.id,
      q.business_name,
      q.contact_name,
      q.email,
      q.phone,
      q.status,
      q.created_at,
      COUNT(p.id) AS product_count
     FROM questionnaires q
     LEFT JOIN products p ON p.questionnaire_id = q.id
     ${where}
     GROUP BY q.id
     ORDER BY q.created_at DESC`,
    values
  );

  res.json({ items: result.rows });
});

router.get("/questionnaires/:id", async (req, res) => {
  const id = Number(req.params.id);
  const questionnaireResult = await pool.query(
    "SELECT * FROM questionnaires WHERE id = $1",
    [id]
  );

  if (questionnaireResult.rows.length === 0) {
    return res.status(404).json({ error: "Not found" });
  }

  const questionnaire = questionnaireResult.rows[0];
  const productsResult = await pool.query(
    "SELECT * FROM products WHERE questionnaire_id = $1 ORDER BY sort_order ASC, id ASC",
    [id]
  );

  const products = [];
  for (const product of productsResult.rows) {
    const imagesResult = await pool.query(
      "SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC, id ASC",
      [product.id]
    );

    products.push({
      ...product,
      images: imagesResult.rows.map((row) => row.image_url)
    });
  }

  res.json({ item: { ...questionnaire, products } });
});

router.patch("/questionnaires/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  const allowed = ["new", "in_review", "approved", "completed", "archived"];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const result = await pool.query(
    `UPDATE questionnaires
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, status, updated_at`,
    [status, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json({ item: result.rows[0] });
});

module.exports = router;
