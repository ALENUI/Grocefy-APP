-- Home items are filed under a category. "General" is the default category: items added without one go there.
-- Housemates see the categories used in their home, including a custom one someone else created.

insert into public.categories (name, is_default) values ('General', true) on conflict (name, user_id) do nothing;

drop policy "categories: visible" on public.categories;
create policy "categories: visible" on public.categories for select to authenticated using (
  is_default or user_id = auth.uid()
  or exists (select 1 from public.list_items i where i.category_id = categories.id)
  or exists (select 1 from public.shopping_lists l where l.category_id = categories.id)
  or exists (select 1 from public.home_items h where h.category_id = categories.id));

-- Runs before home_items_guard (triggers fire in name order), so the guard sees General, which everyone can see.
create function public.default_home_item_category() returns trigger language plpgsql set search_path = public as $$
begin
  if new.category_id is null then
    select id into new.category_id from public.categories where is_default and name = 'General' and user_id is null limit 1;
  end if;
  return new;
end $$;
create trigger home_items_default_category before insert or update of category_id on public.home_items
  for each row execute function public.default_home_item_category();

update public.home_items set category_id = (select id from public.categories where is_default and name = 'General' and user_id is null limit 1)
where category_id is null;
