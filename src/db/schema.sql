CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questionnaires (
  id SERIAL PRIMARY KEY,
  business_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  first_name TEXT,
  middle_name TEXT,
  surname TEXT,
  nid_number TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  home_address TEXT,
  social_links TEXT,
  facebook_url TEXT,
  linkedin_url TEXT,
  instagram_url TEXT,
  tiktok_url TEXT,
  other_social_url TEXT,
  government_tax_number TEXT,
  collection_business_tax_number TEXT,
  short_description TEXT,
  services TEXT,
  unique_point TEXT,
  audience TEXT,
  about_description TEXT,
  story TEXT,
  mission TEXT,
  achievements TEXT,
  portrait_url TEXT,
  logo_url TEXT,
  brand_colors TEXT,
  website_style TEXT,
  website_build_type TEXT,
  example_websites TEXT,
  store_policies_text TEXT,
  store_policies_pdf_url TEXT,
  notes TEXT,
  requested_features TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  payment_txn_id TEXT,
  payment_amount TEXT,
  payment_currency TEXT,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS website_build_type TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS government_tax_number TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS collection_business_tax_number TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS first_name TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS middle_name TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS surname TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS nid_number TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS home_address TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS facebook_url TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS instagram_url TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS tiktok_url TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS other_social_url TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS store_policies_text TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS store_policies_pdf_url TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS payment_txn_id TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS payment_amount TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS payment_currency TEXT;

ALTER TABLE questionnaires
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  questionnaire_id INTEGER NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price TEXT,
  description TEXT,
  category TEXT,
  stock TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS paypal_payments (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES questionnaires(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'paypal',
  txn_id TEXT NOT NULL UNIQUE,
  parent_txn_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending_verification',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  payment_source TEXT NOT NULL DEFAULT 'ipn',
  gross_amount TEXT,
  currency TEXT,
  payer_email TEXT,
  receiver_email TEXT,
  item_name TEXT,
  item_number TEXT,
  raw_payload TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_receipts (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES questionnaires(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  domain_pgk NUMERIC(12,2) NOT NULL DEFAULT 100.00,
  hosting_pgk NUMERIC(12,2) NOT NULL DEFAULT 100.00,
  subtotal_pgk NUMERIC(12,2) NOT NULL DEFAULT 200.00,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  tax_pgk NUMERIC(12,2) NOT NULL DEFAULT 20.00,
  total_pgk NUMERIC(12,2) NOT NULL DEFAULT 220.00,
  payment_currency TEXT NOT NULL DEFAULT 'USD',
  paypal_quote_amount NUMERIC(12,2),
  manual_banking_method TEXT,
  manual_banking_receipt_url TEXT,
  manual_banking_receipt_filename TEXT,
  manual_banking_receipt_mime TEXT,
  manual_banking_status TEXT NOT NULL DEFAULT 'not_submitted',
  manual_banking_submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payment_receipts
ADD COLUMN IF NOT EXISTS paypal_quote_amount NUMERIC(12,2);

ALTER TABLE payment_receipts
ADD COLUMN IF NOT EXISTS manual_banking_method TEXT;

ALTER TABLE payment_receipts
ADD COLUMN IF NOT EXISTS manual_banking_receipt_url TEXT;

ALTER TABLE payment_receipts
ADD COLUMN IF NOT EXISTS manual_banking_receipt_filename TEXT;

ALTER TABLE payment_receipts
ADD COLUMN IF NOT EXISTS manual_banking_receipt_mime TEXT;

ALTER TABLE payment_receipts
ADD COLUMN IF NOT EXISTS manual_banking_status TEXT NOT NULL DEFAULT 'not_submitted';

ALTER TABLE payment_receipts
ADD COLUMN IF NOT EXISTS manual_banking_submitted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_questionnaires_status ON questionnaires(status);
CREATE INDEX IF NOT EXISTS idx_questionnaires_payment_status ON questionnaires(payment_status);
CREATE INDEX IF NOT EXISTS idx_questionnaires_created_at ON questionnaires(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_questionnaire_id ON products(questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_paypal_payments_submission_id ON paypal_payments(submission_id);
CREATE INDEX IF NOT EXISTS idx_paypal_payments_status ON paypal_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_submission_id ON payment_receipts(submission_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_manual_banking_status ON payment_receipts(manual_banking_status);
