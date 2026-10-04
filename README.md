# GoGreen UAE

GoGreen UAE is a UAE-focused environmental community platform: people report litter, find safe reviewed cleanups, learn about local environmental topics, join community groups, organize missions, earn auditable Eco Points, and redeem published rewards.

This is an independent competition project. It is not a government service and does not imply endorsement by the UAE Ministry of Climate Change and Environment or any municipality.

## Included workflow

- Email/password accounts with verification, guardian approval for under-12 accounts, adult volunteers, and organization onboarding.
- OpenStreetMap map with bounding-box report queries, clustering, adjustable report pins, place search, category/status filters, duplicate detection, and private image serving.
- Image normalization and MIME/size/dimension validation. Photos are stored in PostgreSQL by default for this competition deployment, or an S3-compatible bucket can be configured.
- AI adapter with a safe human-review fallback. AI failure leaves reports in `PENDING_REVIEW`; it never auto-approves.
- Safe cleanup claims with expiry, before/after evidence, duplicate-image checks, independent moderation, hazardous-waste routing, and auditable points transactions.
- Server-side achievement, streak, challenge, group, event, reward redemption, and anti-fraud rules.
- Guardian-first child experience with lessons; no public exact locations, private messaging, group discovery, leaderboards, or cleanup claims.
- Organization and location claiming with evidence and administrator review.
- Owner/admin moderation, rewards, achievements, organizations, users, groups, settings, and audit log tools.
- Privacy, terms, community, child-safety, environmental-safety, and reward-term pages marked for final legal review.

## Local setup

1. Install Node.js 22.12+ and a PostgreSQL database.
2. Copy `.env.example` to `.env`; create a random `NEXTAUTH_SECRET` of at least 32 characters.
3. Set `DATABASE_URL`, then run:

   ```text
   npm install
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

For a local database without a separate PostgreSQL installation, `npm run db:local` starts the bundled PGlite PostgreSQL-compatible socket at port 5433, after which `npm run db:migrate` and `npm run db:seed` work normally.

`SEED_DEMO=true` creates development-only accounts with the password `GoGreen-demo-2026!`; never enable this in production. For a real owner account set `OWNER_EMAIL`; the seed creates the account with a generated password and sends a one-use setup email.

## Render free deployment

Create a free Render Postgres database and a free Node web service from this repository. The database uses the `DATABASE_URL` Render provides. The web service build command is `npm install && npm run db:migrate && npm run build`; start command is `npm start`.

Set `NEXTAUTH_URL` to the final `https://*.onrender.com` URL and set a strong `NEXTAUTH_SECRET`. Configure `OWNER_EMAIL` and SMTP before opening registration. Leave `AI_ENDPOINT` blank for free human moderation; add a provider only when you have a permitted free endpoint.

Render documents that free PostgreSQL instances expire after 30 days. Before expiry, use the owner data export and a PostgreSQL dump, then restore to a durable free Postgres provider if the competition needs to remain live. The app’s image and points data remain relational and portable.

## Validation

`npm run typecheck` and `npm run build` are the required release checks. `tests/domain.test.ts` covers points, UAE timezone streaks, distance checks, and role authorization. `tests/integration/journey.test.ts` covers registration, verification, report moderation, cleanup verification, achievement unlocks, atomic reward redemption, child restrictions, CSRF origin checks, and upload rejection. In this Windows environment the Node test worker can fail before loading tests with `uv_os_get_passwd`/ENOMEM; this is an environment issue rather than a test assertion failure.
