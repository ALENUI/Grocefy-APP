insert into public.currencies (code, name, symbol, decimal_digits) values
  ('USD', 'US Dollar', '$', 2), ('EUR', 'Euro', '€', 2), ('GBP', 'British Pound', '£', 2),
  ('XAF', 'Central African CFA Franc', 'FCFA', 0), ('NGN', 'Nigerian Naira', '₦', 2),
  ('GHS', 'Ghanaian Cedi', 'GH₵', 2), ('KES', 'Kenyan Shilling', 'KSh', 2), ('ZAR', 'South African Rand', 'R', 2),
  ('CAD', 'Canadian Dollar', 'CA$', 2), ('AUD', 'Australian Dollar', 'A$', 2), ('JPY', 'Japanese Yen', '¥', 0)
on conflict (code) do update set name = excluded.name, symbol = excluded.symbol, decimal_digits = excluded.decimal_digits;

insert into public.categories (name, is_default) values
  ('Food Stuffs', true), ('Kitchen', true), ('Bathroom', true), ('Cleaning', true), ('Home Appliances', true),
  ('Electronics', true), ('Office Supplies', true), ('Clothing', true), ('Personal Care', true), ('Household', true), ('Other', true)
on conflict (name, user_id) do nothing;
