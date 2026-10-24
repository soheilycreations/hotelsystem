-- ============================================================================
-- PHASE 0 — read-only database inventory (pre go-live reset, 2026-10-20)
-- ----------------------------------------------------------------------------
-- SAFE: only SELECTs from catalogs; changes nothing. Paste into the Supabase
-- SQL editor and run. Everything is returned as ONE result grid (the editor
-- only shows the last statement's result), sorted by section.
--   section = 1_table     → exact row count per public table + class
--   section = 2_sequence  → sequences and their current value
--   section = 3_trigger   → triggers on public tables
--   section = 4_function  → functions in public
--   section = 5_policy    → RLS policies (public + storage)
--   section = 6_rls_off   → public tables with RLS DISABLED (should be none)
--   section = 7_bucket    → storage buckets and object counts
--   section = 8_money     → quick money totals used to sanity-check the backup
-- ============================================================================
with
tbl as (
  select c.relname as name,
         (xpath('/row/n/text()',
                query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint as n,
         c.relrowsecurity as rls
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r'
),
cls(name, class) as (values
  ('staff_profiles','MASTER'), ('room_types','MASTER'), ('room_rate_plans','MASTER'),
  ('rooms','MASTER (status→vacant)'), ('restaurant_tables','MASTER (status→vacant)'),
  ('menu_categories','MASTER'), ('menu_items','MASTER'), ('menu_recipe_ingredients','MASTER'),
  ('inventory_items','MASTER (qty→0)'), ('store_items','MASTER (stock→0)'),
  ('expense_categories','MASTER'), ('hotel_settings','MASTER'),
  ('credit_accounts','MASTER (names kept, balance carried fwd)'),
  ('guests','DECIDE: guest registry (PII)'),
  ('bookings','TRANSACTIONAL'), ('booking_charges','TRANSACTIONAL'),
  ('booking_advance_payments','TRANSACTIONAL'),
  ('restaurant_orders','TRANSACTIONAL'), ('order_items','TRANSACTIONAL'),
  ('expenses','TRANSACTIONAL'), ('cash_movements','TRANSACTIONAL'), ('cashier_float','TRANSACTIONAL'),
  ('credit_repayments','TRANSACTIONAL'), ('credit_adjustments','TRANSACTIONAL'),
  ('purchases','TRANSACTIONAL'), ('purchase_items','TRANSACTIONAL'),
  ('store_transactions','TRANSACTIONAL'), ('store_daily_snapshots','TRANSACTIONAL'),
  ('event_bookings','TRANSACTIONAL'), ('system_logs','TRANSACTIONAL')
)
select '1_table' as section, t.name as object,
       coalesce(c.class, 'UNCLASSIFIED — tell Claude') as detail,
       t.n::text as value
from tbl t left join cls c using (name)

union all
select '2_sequence', sequencename,
       'owned by: ' || coalesce((select d.refobjid::regclass::text from pg_depend d
                                 where d.objid = (schemaname||'.'||sequencename)::regclass and d.deptype = 'a' limit 1), '-'),
       coalesce(last_value::text, 'never used')
from pg_sequences where schemaname = 'public'

union all
select '3_trigger', event_object_table || '.' || trigger_name,
       action_timing || ' ' || string_agg(event_manipulation, '/' order by event_manipulation),
       max(action_statement)
from information_schema.triggers where trigger_schema = 'public'
group by event_object_table, trigger_name, action_timing

union all
select '4_function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end,
       pg_get_function_result(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'

union all
select '5_policy', schemaname || '.' || tablename || ' :: ' || policyname,
       cmd || ' to ' || array_to_string(roles, ','),
       coalesce('USING ' || qual, '') || coalesce(' CHECK ' || with_check, '')
from pg_policies where schemaname in ('public', 'storage')

union all
select '6_rls_off', name, 'RLS DISABLED', '' from tbl where not rls

union all
select '7_bucket', b.id, case when b.public then 'public' else 'private' end,
       (select count(*) from storage.objects o where o.bucket_id = b.id)::text || ' objects'
from storage.buckets b

union all
select '8_money', 'settled restaurant revenue (all time)', 'sum(total_amount) completed',
       coalesce(sum(total_amount), 0)::text from public.restaurant_orders where order_status = 'completed'
union all
select '8_money', 'open (active) orders', 'count / sum',
       count(*)::text || ' / ' || coalesce(sum(total_amount), 0)::text from public.restaurant_orders where order_status = 'active'
union all
select '8_money', 'in-house bookings', 'count / sum folio',
       count(*)::text || ' / ' || coalesce(sum(total_folio_amount), 0)::text from public.bookings where status = 'checked_in'
union all
select '8_money', 'pending (future) bookings', 'count / earliest arrival',
       count(*)::text || ' / ' || coalesce(min(check_in_date)::text, '-') from public.bookings where status = 'pending'
union all
select '8_money', 'upcoming functions (event_bookings)', 'count from today',
       count(*)::text from public.event_bookings
       where event_date >= (now() at time zone 'Asia/Colombo')::date and status <> 'cancelled'
union all
select '8_money', 'expenses (all time)', 'sum', coalesce(sum(amount), 0)::text from public.expenses
union all
select '8_money', 'credit outstanding (all accounts)', 'bookings+orders+adjustments-repayments',
       ( coalesce((select sum(total_folio_amount) from public.bookings where payment_method = 'credit' and credit_account_id is not null), 0)
       + coalesce((select sum(total_amount) from public.restaurant_orders where payment_method = 'credit' and credit_account_id is not null), 0)
       + coalesce((select sum(amount) from public.credit_adjustments), 0)
       - coalesce((select sum(amount) from public.credit_repayments), 0) )::text
union all
select '8_money', 'negative-stock inventory items', 'count', count(*)::text from public.inventory_items where quantity_in_stock < 0

order by 1, 2;
