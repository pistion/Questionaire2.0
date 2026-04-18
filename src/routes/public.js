const express = require("express");
const pool = require("../db");
const cloudinary = require("../lib/cloudinary");

const router = express.Router();

router.post("/uploads", async (req, res) => {
  const { fileBase64, folder = "questionnaire-saas" } = req.body || {};

  if (!fileBase64) {
    return res.status(400).json({ error: "fileBase64 is required" });
  }

  try {
    const uploaded = await cloudinary.uploader.upload(fileBase64, {
      folder
    });

    res.json({
      url: uploaded.secure_url,
      publicId: uploaded.public_id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Upload failed" });
  }
});

router.post("/questionnaires", async (req, res) => {
  const client = await pool.connect();

  try {
    const data = req.body || {};
    const products = Array.isArray(data.products) ? data.products : [];

    await client.query("BEGIN");

    const questionnaireResult = await client.query(
      `INSERT INTO questionnaires (
        business_name, contact_name, email, phone, address, social_links,
        short_description, services, unique_point, audience,
        about_description, story, mission, achievements,
        portrait_url, logo_url, brand_colors, website_style,
        example_websites, notes, requested_features
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,$14,
        $15,$16,$17,$18,
        $19,$20,$21
      )
      RETURNING id`,
      [
        data.businessName,
        data.contactName,
        data.email,
        data.phone,
        data.address,
        data.socialLinks,
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
        data.exampleWebsites,
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

    await client.query("COMMIT");
    res.status(201).json({ success: true, id: questionnaireId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Database Error:", error);
    res.status(500).json({ 
      error: "Failed to save questionnaire", 
      details: error.message,
      code: error.code,
      env: process.env.NODE_ENV
    });
  } finally {
    client.release();
  }
});

module.exports = router;
