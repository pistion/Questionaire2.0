# Website Questionnaire SaaS

A full-stack starter SaaS for collecting website content questionnaires, storing submissions in PostgreSQL, saving uploaded media into a local `public/uploads` folder, and managing everything from an admin dashboard.

## Features

- Admin authentication with JWT
- Public questionnaire form
- Dynamic product entries
- Local file uploads for images and PDFs
- PostgreSQL relational schema
- Admin dashboard for submissions
- Render-ready deployment config

## Stack

- Node.js + Express
- PostgreSQL
- Vanilla HTML/CSS/JS frontend
- JWT auth

## Local setup

1. Copy `.env.example` to `.env`
2. Create a PostgreSQL database
3. Install dependencies

```bash
npm install
npm run db:init
npm start
```

Then open `http://localhost:3000`

## Database configuration

- The app saves questionnaire answers to PostgreSQL.
- Uploaded media files are stored locally in `public/uploads`.
- `DATABASE_URL` is read automatically from `.env` locally and from your deployment environment in production.
- On startup, the server validates the DB connection and automatically runs `src/db/schema.sql` to create or update the required tables.
- If `DATABASE_URL` is missing or invalid, the server now fails fast at startup instead of starting in a broken or preview-only state.
- For a temporary local setup, local uploads are simple and fast. If you deploy to an ephemeral host later, move uploads to dedicated file storage.

## PayPal payment callbacks

This project now supports PayPal hosted payment callbacks for Payment Links / Buttons using:

- `POST /api/public/paypal/ipn` for PayPal IPN notifications
- `POST /api/public/paypal/confirm-return` to link the buyer's PayPal return to a questionnaire submission
- `GET /api/public/checkout/:submissionId` to load the stored receipt snapshot for the exact customer

Set these environment variables:

- `PAYPAL_ENV=live` or `sandbox`
- `PAYPAL_RECEIVER_EMAIL` to your PayPal merchant email
- `PAYPAL_HOSTED_LINK_URL` to your hosted PayPal payment page URL
- `PAYPAL_EXPECTED_AMOUNT` to the fixed amount configured on your hosted PayPal button/link
- `PAYPAL_EXPECTED_CURRENCY` to the fixed currency configured on your hosted PayPal button/link

For temporary local testing, you can leave `PAYPAL_RECEIVER_EMAIL` blank to skip strict receiver-email matching until you are ready to use your real PayPal business email.

PayPal account settings to enable:

1. Turn on `Auto Return` and set the return URL to `${APP_URL}/checkout`
2. Turn on `Payment Data Transfer (PDT)` so PayPal returns a transaction token (`tx`) to the checkout page
3. Turn on `IPN` and set the listener URL to `${APP_URL}/api/public/paypal/ipn`

Important limitation:

- The checkout receipt is saved in the database with the customer snapshot and the pricing breakdown in Papua New Guinean Kina (PGK).
- The PayPal button is treated as a fixed hosted payment page. The backend stores that fixed PayPal quote amount on each receipt and validates incoming PayPal payment notifications against the saved quote and currency.
- The site links the PayPal transaction back to the questionnaire when the buyer returns to your site in the same browser session after payment.
- If the buyer never returns from PayPal, the payment can still be recorded by IPN, but it may need manual review to match it to the correct submission.

## Default admin
The DB init script creates an admin user from these env vars:

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

## Deploying to Render

1. Push this project to GitHub
2. Create a new Blueprint in Render using `render.yaml`
3. Set these environment variables in Render:
   - `DATABASE_URL`
   - `APP_URL`
   - `PAYPAL_RECEIVER_EMAIL`
   - `SEED_ADMIN_EMAIL`
   - `SEED_ADMIN_PASSWORD`
4. Deploy

`render.yaml` is configured for a manually supplied PostgreSQL connection string in `DATABASE_URL`, which is useful when you are using an external Postgres database instead of a Render-managed database. The fixed PayPal settings are included in the blueprint, while secrets stay manual.

## Core routes

### Public
- `POST /api/public/questionnaires`
- `POST /api/public/uploads`

### Auth
- `POST /api/auth/login`
- `GET /api/auth/me`

### Admin
- `GET /api/admin/questionnaires`
- `GET /api/admin/questionnaires/:id`
- `PATCH /api/admin/questionnaires/:id/status`

## Notes

- This starter stores uploaded file URLs in the DB after saving them into `public/uploads`.
- For multi-tenant SaaS, add organizations, customer portals, billing, and role-based permissions.
- For payments, Stripe is the next step.
