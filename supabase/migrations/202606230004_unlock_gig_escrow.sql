-- Reverses a locked escrow back to the poster's wallet.
-- Called when admin resolves a dispute in the poster's favor.
create or replace function unlock_gig_escrow(
  p_gig_id   uuid,
  p_poster_id uuid,
  p_amount    numeric
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_currency text;
  v_new_balance numeric;
begin
  -- Get poster's wallet currency and lock the row
  select wallet_currency, wallet_balance + p_amount
  into v_currency, v_new_balance
  from users
  where id = p_poster_id
  for update;

  if not found then
    return false;
  end if;

  -- Return escrow to poster wallet
  update users
  set wallet_balance = wallet_balance + p_amount
  where id = p_poster_id;

  -- Record the refund transaction
  insert into wallet_transactions (
    user_id, gig_id, type, amount, currency,
    balance_after, status, description
  ) values (
    p_poster_id, p_gig_id, 'escrow_refund', p_amount, coalesce(v_currency, 'NGN'),
    v_new_balance, 'completed',
    'Escrow refunded — dispute resolved in your favor'
  );

  -- Clear escrow amount on the gig
  update gigs
  set escrow_amount = 0
  where id = p_gig_id;

  return true;
exception when others then
  raise warning 'unlock_gig_escrow error: %', sqlerrm;
  return false;
end;
$$;
