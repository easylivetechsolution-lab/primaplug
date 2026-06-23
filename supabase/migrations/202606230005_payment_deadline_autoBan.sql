-- Track court-ordered payment deadlines for manual gigs
alter table receipts
  add column if not exists payment_ordered boolean default false,
  add column if not exists payment_deadline timestamptz;

-- pg_cron: runs daily at 00:05 UTC, auto-bans posters who blew the deadline
-- Requires pg_cron extension (enabled by default on Supabase Pro+).
-- If on Free plan, run this manually or via an Edge Function cron trigger.
select cron.schedule(
  'auto-ban-payment-defaulters',
  '5 0 * * *',
  $$
    update users
    set is_banned = true
    where id in (
      select distinct r.poster_id
      from receipts r
      where r.payment_ordered = true
        and r.payment_deadline < now()
    )
    and is_banned  = false
    and is_admin   = false;
  $$
);
