-- STEP 9a: Add technical staff role to business_role enum
-- Run ALONE in Supabase SQL Editor (one query, then Run).
-- PostgreSQL requires this to commit before 9_technical_escalations.sql can use 'technical'.
-- Safe to re-run: IF NOT EXISTS skips when already added.

ALTER TYPE public.business_role ADD VALUE IF NOT EXISTS 'technical';
