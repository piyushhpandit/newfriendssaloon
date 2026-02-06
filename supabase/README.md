## Supabase setup (free tier friendly)

### 1) Create a Supabase project
- Create a new Supabase project (free tier).
- Copy **Project URL** and **anon public key** (Project Settings → API).

### 2) Apply database schema + seed
In Supabase Dashboard → **SQL Editor**:

1. Run `supabase/schema.sql`
2. (Optional) Run `supabase/seed.sql` to add default services + weekly schedule.

### 3) Configure environment variables
Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_ANON_PUBLIC_KEY"

# Used only for barber magic-link login UI convenience
NEXT_PUBLIC_BARBER_EMAIL="you@yourdomain.com"
```

### Notes
- Customers have **no login**. Customer actions are done via **RPC functions** that require a per-booking/per-waitlist `customer_token`.
- Barber uses Supabase Auth magic link. Any authenticated user is treated as the barber (single-user shop).



