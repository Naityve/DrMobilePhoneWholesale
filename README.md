# DrMobilePhone — Setup Guide

## What's Included

```
drmobilephone/
├── index.html          ← Landing page (updated with Login/Register links)
├── register.html       ← Registration form for new trade accounts
├── login.html          ← Sign-in page
├── pending.html        ← "Account under review" page
├── admin.html          ← Admin dashboard (approve/reject users)
├── store.html          ← Store page placeholder (approved users only)
├── styles.css          ← Shared styles across all pages
├── database-setup.sql  ← SQL script to run in Supabase
└── js/
    └── supabase-config.js  ← Supabase connection + helper functions
```

---

## Step-by-Step Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up
2. Click **"New Project"**
3. Name: `drmobilephone`
4. Password: choose a strong one and **save it**
5. Region: **EU West (Ireland)**
6. Click "Create new project" and wait ~2 minutes

### 2. Set Up the Database

1. In your Supabase dashboard, click **"SQL Editor"** (left sidebar)
2. Click **"New Query"**
3. Open the file `database-setup.sql` and **copy the entire contents**
4. Paste into the SQL editor and click **"Run"**
5. You should see "Success" — this creates the profiles table, security policies, and triggers

### 3. Disable Email Confirmation (for testing)

By default Supabase requires email verification. To simplify testing:

1. Go to **Authentication → Providers → Email**
2. Turn **OFF** "Confirm email"
3. Click **Save**

(You can turn this back on later for production)

### 4. Connect the Frontend to Supabase

1. Go to **Settings → API** in your Supabase dashboard
2. Copy your **Project URL** and **anon public key**
3. Open `js/supabase-config.js`
4. Replace `YOUR_SUPABASE_URL` with your Project URL
5. Replace `YOUR_SUPABASE_ANON_KEY` with your anon key

### 5. Deploy to Netlify

1. Go to [netlify.com](https://netlify.com) and log in
2. Drag the entire `drmobilephone` folder onto the deploy area
3. Wait a few seconds — your site is live!

### 6. Create Your Admin Account

1. Open your live site and go to the **Register** page
2. Register with your own email (e.g. info@drmobilephone.ie)
3. Go back to Supabase → **SQL Editor** → New Query
4. Run this (replace with your actual email):

```sql
UPDATE public.profiles
SET status = 'approved', is_admin = TRUE
WHERE email = 'info@drmobilephone.ie';
```

5. Now log in — you'll see the **Admin** link in the nav
6. Go to the Admin dashboard to approve/reject other users

---

## How It Works

### Registration Flow
1. User fills in business details on `/register.html`
2. Supabase creates their auth account
3. A database trigger auto-creates their profile with `status = 'pending'`
4. User is redirected to `/pending.html`

### Login Flow
1. User signs in on `/login.html`
2. System checks their profile status:
   - **pending** → redirected to `/pending.html`
   - **rejected** → shown error, signed out
   - **approved** → redirected to `/store.html`
   - **approved + admin** → redirected to `/admin.html`

### Page Protection
- `/store.html` — only accessible to users with `status = 'approved'`
- `/admin.html` — only accessible to users with `is_admin = TRUE`
- Unapproved users are automatically redirected

---

## Next Steps (Future Phases)

- **Phase 2:** Products table, catalogue page, admin product management
- **Phase 3:** Cart, checkout (Stripe for non-credit), invoicing (for credit-approved)
