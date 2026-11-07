-- غراس: ملاحظات الطالبات وقسم المغادرات
-- شغّل هذا الملف مرة واحدة في Supabase > SQL Editor > New query.
-- لا يحذف أي بيانات؛ نقل الطالبة إلى المغادرات هو أرشفة داخل جدول students نفسه.

begin;

-- 1) حقول الأرشفة على سجل الطالبة الأصلي للحفاظ على جميع العلاقات والسجلات.
alter table public.students
  add column if not exists is_departed boolean not null default false,
  add column if not exists departed_at timestamptz,
  add column if not exists departure_reason text;

create index if not exists students_departed_idx
  on public.students (is_departed, departed_at desc);

-- 2) سجل مستقل للملاحظات حتى لا تستبدل الملاحظة الجديدة القديمة.
create table if not exists public.student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  halaqa_id uuid not null references public.halaqat(id) on delete restrict,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_by_name text not null,
  note text not null check (length(trim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists student_notes_student_created_idx
  on public.student_notes (student_id, created_at desc);
create index if not exists student_notes_halaqa_idx
  on public.student_notes (halaqa_id, created_at desc);

alter table public.student_notes enable row level security;

-- المدير والمعلمة المرتبطة بالحلقة يستطيعون قراءة ملاحظات طالبات الحلقة.
drop policy if exists student_notes_read_authorized on public.student_notes;
create policy student_notes_read_authorized
on public.student_notes for select to authenticated
using (public.is_manager() or public.can_access_halaqa(halaqa_id));

-- يمكن للمدير أو معلمة الحلقة إضافة ملاحظة باسم حسابها فقط.
drop policy if exists student_notes_insert_authorized on public.student_notes;
create policy student_notes_insert_authorized
on public.student_notes for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    public.is_manager()
    or public.can_access_halaqa(halaqa_id)
  )
  and exists (
    select 1 from public.students s
    where s.id = student_id and s.halaqa_id = student_notes.halaqa_id
  )
);

grant select, insert on public.student_notes to authenticated;
revoke all on public.student_notes from anon;

-- 3) نقل الطالبة إلى المغادرات دون حذف سجلها أو سجلات الحضور والتسميع.
create or replace function public.depart_student(
  p_student_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student public.students%rowtype;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  select * into v_student
  from public.students
  where id = p_student_id
  for update;

  if not found then
    raise exception 'الطالبة غير موجودة';
  end if;

  if not public.is_manager()
     and not public.can_access_halaqa(v_student.halaqa_id) then
    raise exception 'ليس لديك صلاحية نقل هذه الطالبة';
  end if;

  if coalesce(v_student.is_departed, false) then
    raise exception 'الطالبة موجودة مسبقاً في قسم المغادرات';
  end if;

  update public.students
  set is_departed = true,
      departed_at = now(),
      departure_reason = nullif(trim(p_reason), '')
  where id = p_student_id;
end;
$$;

revoke all on function public.depart_student(uuid, text) from public;
grant execute on function public.depart_student(uuid, text) to authenticated;

commit;
