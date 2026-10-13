
create type public.app_role as enum ('admin','client');

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at = now(); return new; end $$;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select public.has_role(auth.uid(),'admin')
$$;

create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  company text,
  phone text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profile update" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, email, full_name, company)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'company')
  on conflict (id) do nothing;
  insert into public.user_roles(user_id, role) values (new.id,'client') on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.settings (
  id int primary key default 1 check (id = 1),
  brand_name text not null default 'Studio',
  logo_url text,
  accent_color text not null default '#0EA5A4',
  support_email text not null default 'support@example.com',
  credits_per_video int not null default 1,
  max_video_seconds int not null default 30,
  min_package_videos int not null default 10,
  default_turnaround_hours int not null default 72,
  max_tries_per_video int not null default 2,
  hf_credits_per_30s numeric not null default 330,
  hf_plus_price numeric not null default 59,
  hf_plus_credits numeric not null default 1200,
  hf_ultra_price numeric not null default 129,
  hf_ultra_credits numeric not null default 3000,
  feed_last_success_at timestamptz,
  updated_at timestamptz not null default now()
);
grant select on public.settings to anon, authenticated;
grant update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "settings public read" on public.settings for select to anon, authenticated using (true);
create policy "settings admin update" on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.settings(id) values (1);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  videos int not null check (videos > 0),
  credits int not null check (credits > 0),
  price_label text not null default '',
  description text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.packages to anon, authenticated;
grant insert, update, delete on public.packages to authenticated;
grant all on public.packages to service_role;
alter table public.packages enable row level security;
create policy "packages read active" on public.packages for select to anon, authenticated using (active or public.is_admin());
create policy "packages admin insert" on public.packages for insert to authenticated with check (public.is_admin());
create policy "packages admin update" on public.packages for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "packages admin delete" on public.packages for delete to authenticated using (public.is_admin());
insert into public.packages(name, videos, credits, price_label, description, sort_order) values
 ('Starter – 10 videos',10,10,'USD 290','Test the format with your business.',1),
 ('Growth – 25 videos',25,25,'USD 650','A steady flow of fresh content every month.',2),
 ('Scale – 50 videos',50,50,'USD 1200','High-volume content for brands that post daily.',3);

create table public.credit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  package_id uuid references public.packages(id) on delete set null,
  credits int not null check (credits > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  client_message text,
  admin_note text,
  payment_provider text default 'manual',
  payment_reference text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
grant select, insert on public.credit_requests to authenticated;
grant all on public.credit_requests to service_role;
alter table public.credit_requests enable row level security;
create policy "cr read" on public.credit_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "cr insert own pending" on public.credit_requests for insert to authenticated with check (user_id = auth.uid() and status = 'pending' and decided_at is null and decided_by is null);

create sequence public.job_code_seq;
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('JOB-' || lpad(nextval('public.job_code_seq')::text, 6, '0')),
  user_id uuid not null,
  source_type text not null check (source_type in ('tiktok','youtube_shorts','youtube','instagram_reel','upload')),
  source_url text,
  source_file_path text,
  clip_start int,
  clip_end int,
  target_duration_seconds int not null,
  subject_type text not null check (subject_type in ('person','product','business')),
  subject_name text not null,
  business_type text,
  reference_image_path text,
  notes text,
  estimated_credits int not null,
  estimated_turnaround_hours int not null,
  status text not null default 'submitted' check (status in ('submitted','in_review','prompt_ready','generating','qa','delivered','revision','cancelled')),
  try_number int not null default 1 check (try_number between 1 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.jobs to authenticated;
grant all on public.jobs to service_role;
alter table public.jobs enable row level security;
create policy "jobs read" on public.jobs for select to authenticated using (user_id = auth.uid() or public.is_admin());
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  delta int not null,
  reason text not null check (reason in ('admin_grant','job_reserve','job_refund','adjustment')),
  job_id uuid references public.jobs(id) on delete set null,
  credit_request_id uuid references public.credit_requests(id) on delete set null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select on public.credit_ledger to authenticated;
grant all on public.credit_ledger to service_role;
alter table public.credit_ledger enable row level security;
create policy "ledger read" on public.credit_ledger for select to authenticated using (user_id = auth.uid() or public.is_admin());

create view public.credit_balances with (security_invoker = true) as
  select user_id, coalesce(sum(delta),0)::int as balance from public.credit_ledger group by user_id;
grant select on public.credit_balances to authenticated, service_role;

create table public.job_internal (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  internal_prompt text,
  internal_notes text,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.job_internal to authenticated;
grant all on public.job_internal to service_role;
alter table public.job_internal enable row level security;
create policy "internal admin select" on public.job_internal for select to authenticated using (public.is_admin());
create policy "internal admin insert" on public.job_internal for insert to authenticated with check (public.is_admin());
create policy "internal admin update" on public.job_internal for update to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger internal_touch before update on public.job_internal for each row execute function public.touch_updated_at();

create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null,
  message text,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select on public.job_events to authenticated;
grant all on public.job_events to service_role;
alter table public.job_events enable row level security;
create policy "events read" on public.job_events for select to authenticated using (public.is_admin() or exists(select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()));

create or replace function public.log_job_status() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_events(job_id,status,message,created_by) values (new.id,new.status,'Job submitted',auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.job_events(job_id,status,message,created_by)
    values (new.id,new.status,nullif(current_setting('app.status_message', true),''),auth.uid());
  end if;
  return new;
end $$;
create trigger jobs_status_log after insert or update of status on public.jobs for each row execute function public.log_job_status();

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  try_number int not null default 1,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.deliverables to authenticated;
grant all on public.deliverables to service_role;
alter table public.deliverables enable row level security;
create policy "deliv read" on public.deliverables for select to authenticated using (public.is_admin() or exists(select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()));
create policy "deliv admin insert" on public.deliverables for insert to authenticated with check (public.is_admin());
create policy "deliv admin delete" on public.deliverables for delete to authenticated using (public.is_admin());

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  author_id uuid,
  note text not null,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.client_notes to authenticated;
grant all on public.client_notes to service_role;
alter table public.client_notes enable row level security;
create policy "notes admin select" on public.client_notes for select to authenticated using (public.is_admin());
create policy "notes admin insert" on public.client_notes for insert to authenticated with check (public.is_admin());
create policy "notes admin delete" on public.client_notes for delete to authenticated using (public.is_admin());

create view public.jobs_feed with (security_invoker = true) as
 select id as job_id, code, status, try_number, source_type, source_url, source_file_path, clip_start, clip_end,
   target_duration_seconds, subject_type, subject_name, business_type, reference_image_path, notes, created_at, updated_at
 from public.jobs;
grant select on public.jobs_feed to authenticated, service_role;

create or replace function public.approve_credit_request(_id uuid, _note text default null) returns void
language plpgsql security definer set search_path=public as $$
declare r public.credit_requests;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into r from public.credit_requests where id=_id for update;
  if r.id is null then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then raise exception 'Request already decided'; end if;
  update public.credit_requests set status='approved', admin_note=_note, decided_at=now(), decided_by=auth.uid() where id=_id;
  insert into public.credit_ledger(user_id,delta,reason,credit_request_id,note,created_by)
  values (r.user_id, r.credits, 'admin_grant', r.id, coalesce(_note,'Credit request approved'), auth.uid());
end $$;

create or replace function public.reject_credit_request(_id uuid, _note text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.credit_requests set status='rejected', admin_note=_note, decided_at=now(), decided_by=auth.uid()
  where id=_id and status='pending';
  if not found then raise exception 'Request not pending'; end if;
end $$;

create or replace function public.create_job(
  _source_type text, _source_url text, _source_file_path text, _clip_start int, _clip_end int,
  _target_duration_seconds int, _subject_type text, _subject_name text, _business_type text,
  _reference_image_path text, _notes text
) returns uuid language plpgsql security definer set search_path=public as $$
declare s public.settings; bal int; jid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into s from public.settings where id=1;
  if _target_duration_seconds < 1 or _target_duration_seconds > s.max_video_seconds then
    raise exception 'Duration must be between 1 and % seconds', s.max_video_seconds; end if;
  if _source_type = 'upload' and (_source_file_path is null or _source_file_path not like uid::text || '/%') then
    raise exception 'Invalid source file'; end if;
  if _source_type <> 'upload' and coalesce(_source_url,'') = '' then raise exception 'Source link required'; end if;
  if _reference_image_path is null or _reference_image_path not like uid::text || '/%' then
    raise exception 'Reference image required'; end if;
  if coalesce(trim(_subject_name),'') = '' then raise exception 'Subject name required'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select coalesce(sum(delta),0) into bal from public.credit_ledger where user_id=uid;
  if bal < s.credits_per_video then raise exception 'Insufficient credits'; end if;
  insert into public.jobs(user_id,source_type,source_url,source_file_path,clip_start,clip_end,target_duration_seconds,
    subject_type,subject_name,business_type,reference_image_path,notes,estimated_credits,estimated_turnaround_hours)
  values (uid,_source_type,nullif(_source_url,''),_source_file_path,_clip_start,_clip_end,_target_duration_seconds,
    _subject_type,_subject_name,_business_type,_reference_image_path,_notes,s.credits_per_video,s.default_turnaround_hours)
  returning id into jid;
  insert into public.credit_ledger(user_id,delta,reason,job_id,note,created_by) values (uid,-s.credits_per_video,'job_reserve',jid,'Credit reserved for job',uid);
  return jid;
end $$;

create or replace function public.set_job_status(_job_id uuid, _status text, _message text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() and coalesce(auth.role(),'') <> 'service_role' then raise exception 'Admins only'; end if;
  perform set_config('app.status_message', coalesce(_message,''), true);
  update public.jobs set status=_status where id=_job_id;
  if not found then raise exception 'Job not found'; end if;
  perform set_config('app.status_message', '', true);
end $$;

create or replace function public.request_revision(_job_id uuid, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare j public.jobs; s public.settings;
begin
  select * into s from public.settings where id=1;
  select * into j from public.jobs where id=_job_id for update;
  if j.id is null or j.user_id <> auth.uid() then raise exception 'Job not found'; end if;
  if j.status <> 'delivered' then raise exception 'Only delivered jobs can be revised'; end if;
  if j.try_number >= least(2, s.max_tries_per_video) then raise exception 'No tries left'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'Reason required'; end if;
  perform set_config('app.status_message', 'Revision requested: ' || _reason, true);
  update public.jobs set status='revision', try_number=j.try_number+1 where id=_job_id;
  perform set_config('app.status_message', '', true);
end $$;

create or replace function public.refund_job(_job_id uuid, _credits int, _note text) returns void
language plpgsql security definer set search_path=public as $$
declare j public.jobs;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into j from public.jobs where id=_job_id;
  if j.id is null then raise exception 'Job not found'; end if;
  if _credits <= 0 then raise exception 'Credits must be positive'; end if;
  insert into public.credit_ledger(user_id,delta,reason,job_id,note,created_by) values (j.user_id,_credits,'job_refund',_job_id,_note,auth.uid());
end $$;

create or replace function public.admin_adjust_credits(_user_id uuid, _delta int, _note text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if _delta = 0 then raise exception 'Amount cannot be zero'; end if;
  if coalesce(trim(_note),'') = '' then raise exception 'Reason required'; end if;
  insert into public.credit_ledger(user_id,delta,reason,note,created_by) values (_user_id,_delta,'adjustment',_note,auth.uid());
end $$;

revoke execute on function public.approve_credit_request(uuid,text), public.reject_credit_request(uuid,text), public.create_job(text,text,text,int,int,int,text,text,text,text,text), public.set_job_status(uuid,text,text), public.request_revision(uuid,text), public.refund_job(uuid,int,text), public.admin_adjust_credits(uuid,int,text) from anon, public;
grant execute on function public.approve_credit_request(uuid,text), public.reject_credit_request(uuid,text), public.create_job(text,text,text,int,int,int,text,text,text,text,text), public.set_job_status(uuid,text,text), public.request_revision(uuid,text), public.refund_job(uuid,int,text), public.admin_adjust_credits(uuid,int,text) to authenticated, service_role;

create policy "own uploads insert" on storage.objects for insert to authenticated
 with check (bucket_id in ('source-videos','reference-images') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own uploads read" on storage.objects for select to authenticated
 using (bucket_id in ('source-videos','reference-images') and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "deliverables read" on storage.objects for select to authenticated
 using (bucket_id = 'deliverables' and (public.is_admin() or exists(select 1 from public.jobs j where j.id::text = (storage.foldername(name))[1] and j.user_id = auth.uid())));
create policy "admin storage insert" on storage.objects for insert to authenticated
 with check (bucket_id in ('deliverables','branding') and public.is_admin());
create policy "admin storage update" on storage.objects for update to authenticated
 using (bucket_id in ('deliverables','branding') and public.is_admin());
create policy "admin storage delete" on storage.objects for delete to authenticated
 using (bucket_id in ('deliverables','branding') and public.is_admin());
create policy "branding read" on storage.objects for select to anon, authenticated using (bucket_id = 'branding');
