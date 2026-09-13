-- Bill numbers used to be burned the instant a table/order was opened
-- (order_number is a `serial`, auto-assigned at INSERT). If that order was
-- later cancelled or just never went anywhere, its number vanished forever,
-- leaving a gap in the visible bill sequence — bad for an audit trail.
--
-- From now on, order_number is assigned lazily, the first time a bill is
-- actually printed or the order is settled, via rpc_ensure_order_number()
-- below. An order that's opened and abandoned never consumes a number.

alter table public.restaurant_orders alter column order_number drop not null;
alter table public.restaurant_orders alter column order_number drop default;

create or replace function public.rpc_ensure_order_number(p_order_id uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_role   staff_role;
  v_number int;
begin
  v_role := public.get_my_role();
  if v_role is null then
    raise exception 'Not authorized.';
  end if;

  select order_number into v_number
  from public.restaurant_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_number is null then
    v_number := nextval('public.restaurant_orders_order_number_seq');
    update public.restaurant_orders set order_number = v_number where id = p_order_id;
  end if;

  return v_number;
end;
$$;

grant execute on function public.rpc_ensure_order_number(uuid) to authenticated;
