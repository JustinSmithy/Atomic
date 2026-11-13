# Atomic Garage: public site + staff portal

Folder layout (upload the whole folder to any static host, keep it as is):

    index.html, styles.css, config.js, assets/   public website
    staff/index.html                             staff portal (existing portal + Bookings)

Backend: Supabase project rkovryktdzhaqjikuzpi. The schema in supabase/001_bookings.sql is already applied.

## Go live
1. Host this folder (Netlify Drop, Cloudflare Pages or GitHub Pages all work). The public site is at the root, staff at /staff/.
2. Supabase dashboard > Authentication > Sign In / Providers > Email: turn OFF "Confirm email" (staff are gated by invite codes, and in-character emails cannot receive mail).
3. Open /staff/#bookings > Create account > enter the one-time manager code > you are the first manager.
4. Bookings > Team and site settings: invite mechanics, and fill in location, hours and contact. The public Contact page shows only what you enter there.

## Security model
- Customers have no table access. They call 3 functions with a booking reference + secret access code (stored hashed).
- Staff permissions are enforced by Postgres row-level security and role-checked functions, never by the page.
- Managers see all bookings; mechanics only bookings assigned to them.
- Only the publishable key is in config.js. Never put a secret/service_role key in these files.
