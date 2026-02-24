-- ══════════════════════════════════════════════════════════════
-- DrMobilePhone — Database Setup
-- ══════════════════════════════════════════════════════════════
-- Run this ENTIRE script in your Supabase SQL Editor:
--   1. Go to your Supabase dashboard
--   2. Click "SQL Editor" in the left sidebar
--   3. Click "New Query"
--   4. Paste this entire file and click "Run"
-- ══════════════════════════════════════════════════════════════


-- ── 1. Create the profiles table ──
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    business_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    credit_approved BOOLEAN NOT NULL DEFAULT FALSE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Enable Row Level Security ──
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Users can update their own profile (but NOT status, is_admin, or credit_approved)
CREATE POLICY "Users can update own basic info"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- Admins can update any profile (for approvals)
CREATE POLICY "Admins can update all profiles"
    ON public.profiles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- Allow inserts during registration (via trigger)
CREATE POLICY "Allow insert for authenticated users"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);


-- ── 3. Auto-create profile on signup ──
-- This function runs automatically when a new user signs up.
-- It reads the metadata passed during registration and creates the profile row.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, business_name, contact_name, phone)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'business_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'contact_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'phone', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach the trigger to auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 4. Auto-update the updated_at timestamp ──
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ══════════════════════════════════════════════════════════════
-- ✅  SETUP COMPLETE
--
-- NEXT STEP: Create your admin account.
--   1. Register through the website like a normal user
--   2. Then run this query, replacing YOUR_EMAIL:
--
--   UPDATE public.profiles
--   SET status = 'approved', is_admin = TRUE
--   WHERE email = 'YOUR_EMAIL';
--
-- ══════════════════════════════════════════════════════════════
