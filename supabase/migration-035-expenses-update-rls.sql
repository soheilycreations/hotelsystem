-- The expenses table had RLS enabled with policies for select/insert/delete
-- but NONE for update. Postgres RLS with no matching UPDATE policy doesn't
-- raise an error — it just silently matches zero rows, so every "Edit
-- expense" save from the UI appeared to succeed but changed nothing at all.
create policy "finance update expenses" on public.expenses for update
  using (public.get_my_role() in ('admin', 'manager'))
  with check (public.get_my_role() in ('admin', 'manager'));
