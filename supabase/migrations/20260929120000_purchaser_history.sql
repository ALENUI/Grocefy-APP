-- Purchasers keep their own purchase history (and the product names in it) after leaving or being removed from a
-- list or group. List members continue to see all purchases on lists they can view.
create policy "purchases: purchaser views own" on public.purchases for select to authenticated using (user_id = auth.uid());

drop policy "products: owned or on a visible list" on public.products;
create policy "products: owned, on a visible list, or purchased" on public.products for select to authenticated using (
  owner_id = auth.uid()
  or exists (select 1 from public.list_items i where i.product_id = products.id)
  or exists (select 1 from public.purchases p where p.product_id = products.id and p.user_id = auth.uid()));
