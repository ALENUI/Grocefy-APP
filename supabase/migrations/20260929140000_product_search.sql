-- Ranked product search for item entry. Runs with the caller's RLS, so it only returns products the caller can
-- already see (their own, those on lists shared with them, and those they purchased). Products with the same name
-- (e.g. the caller's "Rice" and a collaborator's "rice") collapse to one result, preferring the caller's own, so
-- reusing a suggestion keeps a single price history.
create function public.search_products(query text, result_limit integer default 10)
returns setof public.products language sql stable set search_path = public, extensions as $$
  with term as (
    select trim(query) as value, replace(replace(replace(trim(query), '\', '\\'), '%', '\%'), '_', '\_') as pattern
  ), matches as (
    select distinct on (lower(p.name)) p.*
    from public.products p, term
    where length(term.value) > 0 and p.archived_at is null
      and (p.name ilike '%' || term.pattern || '%' or p.name % term.value)
    order by lower(p.name), (p.owner_id = auth.uid()) desc, p.created_at
  )
  select m.* from matches m, term
  order by lower(m.name) = lower(term.value) desc, m.name ilike term.pattern || '%' desc, similarity(m.name, term.value) desc, m.name
  limit least(greatest(result_limit, 1), 50)
$$;
revoke execute on function public.search_products(text, integer) from public, anon;
grant execute on function public.search_products(text, integer) to authenticated;
