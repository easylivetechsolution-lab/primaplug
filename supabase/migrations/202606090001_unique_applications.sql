-- Keep one application per worker per gig, then enforce it at the database.
delete from public.applications a
using public.applications b
where a.gig_id = b.gig_id
  and a.worker_id = b.worker_id
  and a.created_at > b.created_at;

create unique index if not exists applications_gig_worker_unique
  on public.applications (gig_id, worker_id);

