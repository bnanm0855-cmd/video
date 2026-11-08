-- غراس: دعم أسماء المستخدمين دون المساس بحسابات Auth الحالية
-- نفّذ هذا الملف مرة واحدة في Supabase SQL Editor قبل نشر وظيفة username-auth.
alter table public.profiles add column if not exists username text;

create unique index if not exists profiles_username_lower_unique
on public.profiles (lower(btrim(username)))
where username is not null and btrim(username) <> '';

comment on column public.profiles.username is
'اسم دخول فريد؛ لا يحتوي على كلمة المرور ولا يستبدل بريد Auth الداخلي.';
