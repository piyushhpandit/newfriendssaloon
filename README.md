## New Friends Saloon — Booking System (single barber)

Mobile-first booking + queue system for a **single-barber** shop. No payments. No customer login.

### Tech
- **Next.js** (App Router) + **Tailwind CSS**
- **Supabase** (Postgres + RLS + Auth magic link for barber)

### Setup
- **Supabase**: see `supabase/README.md` and run `supabase/schema.sql` (+ optional `supabase/seed.sql`).
- **Env vars**: copy `env.example` → `.env.local` and fill in your Supabase URL + anon key.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Shop (hard-coded for now)
- **Name**: New Friends Saloon
- **Address**: Sangam Gali, New Ashok Nagar, 110096, Delhi
- **Phone**: 9540852036

### Notes
- Customers book and check in using a **token** stored in the confirmation link (no accounts).
- Barber dashboard uses Supabase Auth magic link.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to load Geist.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# newfriendssaloon