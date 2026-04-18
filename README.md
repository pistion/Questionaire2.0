# Website Questionnaire SaaS

A full-stack starter SaaS for collecting website content questionnaires, storing submissions in PostgreSQL, uploading branding/product images to Cloudinary, and managing everything from an admin dashboard.

## Features

- Admin authentication with JWT
- Public questionnaire form
- Dynamic product entries
- Cloudinary image uploads
- PostgreSQL relational schema
- Admin dashboard for submissions
- Render-ready deployment config

## Stack

- Node.js + Express
- PostgreSQL
- Cloudinary
- Vanilla HTML/CSS/JS frontend
- JWT auth

## Local setup

1. Copy `.env.example` to `.env`
2. Create a PostgreSQL database
3. Fill in Cloudinary credentials
4. Install dependencies

```bash
npm install
npm run db:init
npm start
```

Then open `http://localhost:3000`

## Default admin
The DB init script creates an admin user from these env vars:

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

## Deploying to Render

1. Push this project to GitHub
2. Create a new Blueprint in Render using `render.yaml`
3. Add Cloudinary env vars
4. Deploy
5. Run `npm run db:init` once from the Render shell if needed

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

- This starter stores image URLs in the DB after uploading to Cloudinary.
- For multi-tenant SaaS, add organizations, customer portals, billing, and role-based permissions.
- For payments, Stripe is the next step.
