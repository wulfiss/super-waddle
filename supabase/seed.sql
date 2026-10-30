-- Optional example catalog for development; not applied by production migrations.
insert into public.products(name,unit) values
 ('Pan de campo','unidades'),('Medialunas','docenas'),('Masa para pizza','kg'),
 ('Salsa de tomate','litros'),('Empanadas','unidades'),('Budín de limón','unidades')
on conflict (name) do nothing;
