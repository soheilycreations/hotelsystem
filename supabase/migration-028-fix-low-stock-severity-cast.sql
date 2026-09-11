-- Fixes a bug in the low-stock alert trigger: the CASE expression's two
-- text-literal branches resolve to type "text" inside the function body,
-- which Postgres then refuses to insert into the "severity" column
-- (log_severity enum) without an explicit cast — surfaced by a plain
-- `update inventory_items set quantity_in_stock = 0` (e.g. a reset script).
create or replace function public.tg_low_stock_alert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.quantity_in_stock < new.reorder_level
     and (old.quantity_in_stock is null or old.quantity_in_stock >= old.reorder_level) then
    insert into public.system_logs (event_type, severity, message, ref_table, ref_id)
    values ('LOW_STOCK',
            (case when new.quantity_in_stock <= 0 then 'critical' else 'warning' end)::log_severity,
            format('"%s" is low: %s %s remaining (reorder level %s %s).',
                   new.name, new.quantity_in_stock, new.unit, new.reorder_level, new.unit),
            'inventory_items', new.id);
  end if;
  return new;
end $$;
