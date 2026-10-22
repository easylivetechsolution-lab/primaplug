alter table public.notifications
  add column if not exists wallet_transaction_id uuid
  references public.wallet_transactions(id) on delete set null;
