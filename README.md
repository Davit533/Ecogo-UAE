# GoGreen UAE

GoGreen UAE is a UAE-focused environmental community platform: people report litter, find safe reviewed cleanups, learn about local environmental topics, join community groups, organize missions, earn auditable Eco Points, and redeem published rewards.

This is an independent competition project. It is not a government service and does not imply endorsement by the UAE Ministry of Climate Change and Environment or any municipality.

## Included workflow

- Immediate email/password signup without email verification, private one-use recovery codes, guardian approval from Settings for under-12 accounts, volunteers, and organization onboarding. Email addresses are unverified sign-in identifiers and must not be treated as proof of identity.
- OpenStreetMap vector map with English/local labels, cluster zoom, UAE place and report search, list filters/sorting, personal and saved reports, and Google Maps place/direction links without an API key. Google Maps opens externally; the interactive report overlay uses OSM.
- Image normalization and MIME/size/dimension validation. Photos are stored in PostgreSQL by default for this competition deployment, or an S3-compatible bucket can be configured.
- Free CPU image AI (quantized MobileViT) suggests report details and adds object hints for report and before/after moderation. The model is cached during build, uses one CPU thread, and serializes inference. It recognizes general objects; it cannot prove litter or removal. All free-model decisions remain human review. An optional externally configured vision adapter remains available.
- Safe cleanup claims with expiry, before/after evidence, duplicate-image checks, independent moderation, hazardous-waste routing, and auditable points transactions.
- Server-side achievement, streak, challenge, group, event, reward redemption, and anti-fraud rules.
- Guardian-first child experience with lessons; no public exact locations, private messaging, group discovery, leaderboards, or cleanup claims.
- Verified managed-property report routing, manual selection when approved locations overlap, existing-report routing on location approval, staff notifications, and hotel/organization report dashboards. Managed-property cleanup claims require organization membership or moderation access.
- My reports across the UAE, owner-only editing that re-enters moderation, and deletion from the public map. Active cleanups prevent edits/deletion; verified contribution/audit records are retained and editing never awards duplicate points.
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

`SEED_DEMO=true` creates development-only accounts with the password `GoGreen-demo-2026!`; never enable this in production. `OWNER_EMAIL` reserves the owner address. The current competition deployment initializes it using the SHA-256 recovery-code digest in `prisma/owner-bootstrap.json`. The private plaintext code is supplied separately to the owner and is never committed. Use `/reset` to choose the initial password, then generate a new recovery code in Settings. The seed never recreates a consumed bootstrap code for an existing account. For another deployment, generate a fresh private 32-byte code and digest; do not reuse this bootstrap.

## Render free deployment

Create a free Render Postgres database and a free Node web service from this repository, or use `render.yaml`. The database uses the internal `DATABASE_URL` Render provides. Build command: `npm ci && npm run build`. Start command: `npm run db:migrate && npm run db:seed && npm start`. Health check: `/api/v1/health`.

Set `NEXTAUTH_URL` to the final `https://*.onrender.com` URL and set a strong `NEXTAUTH_SECRET`. Set `OWNER_EMAIL` to the address matching the private owner bootstrap. Signup and recovery do not require Brevo, SMTP, or any email provider. Leave `AI_ENDPOINT` blank to use the bundled free image AI plus human moderation. No AI API key is required.

Render documents that free PostgreSQL instances expire after 30 days. Before expiry, use the owner data export and a PostgreSQL dump, then restore to a durable free Postgres provider if the competition needs to remain live. The app’s image and points data remain relational and portable.

## Validation

`npm run typecheck`, `npm run lint`, and `npm run build` are release checks. `npm test` covers points, UAE timezone streaks, distance checks, and role authorization. `npm run test:integration`, with the local database and development server running and demo data seeded, covers immediate signup, recovery code ownership and replay protection, session revocation, guardian approval authorization and age checks, report moderation, cleanup verification, achievement unlocks, atomic reward redemption, child restrictions, CSRF origin checks, upload rejection, report edit/delete ownership, review re-entry without duplicate points, private-property routing/backfill, team access, and real free-model inference. The local socket server supports multiple connections for the app and test process.

## Map assets and review limits

The bundled CC0 VersaTiles Colorful style comes from the official OpenStreetMap vector demo. Tiles, glyphs, and sprites use `vector.openstreetmap.org`, with visible attribution and normal browser caching; only viewed tiles are requested. English labels use `name_en` and fall back to `name`. MapLibre worker assets are copied from the installed package during build and retain its license. OSM’s public tiles have no availability guarantee.

The dependency review removed unused email packages and updated image processing, AI, and map dependencies to patched releases. The pinned Prisma tooling still has advisories in its transitive configuration/MySQL packages; this app uses a fixed checked-in config and PostgreSQL, and does not accept arbitrary Prisma config or connect to MySQL. A Prisma major-version migration is outside this feature change.
