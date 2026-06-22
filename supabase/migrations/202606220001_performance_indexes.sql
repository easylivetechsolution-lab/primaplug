-- Index for fast fincra_reference lookups (39k+ queries were doing full table scans)
create index if not exists wallet_transactions_fincra_ref_idx
  on public.wallet_transactions (fincra_reference)
  where fincra_reference is not null;

-- Partial index for pending transactions (most lookups filter by status=pending)
create index if not exists wallet_transactions_pending_ref_idx
  on public.wallet_transactions (fincra_reference, status)
  where status = 'pending';

-- Index for commission lookups by gig+worker (used in ReceiptFlow upsert logic)
create index if not exists commissions_gig_worker_idx
  on public.commissions (gig_id, worker_id);

-- Index for notifications by user+created_at (high seq_scan table)
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
