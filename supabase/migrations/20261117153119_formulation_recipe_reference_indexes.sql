begin;
create index formulation_recipe_current_reference on public.formulation_recipes(id,current_version);
create index formulation_recipe_latest_reference on public.formulation_recipes(id,latest_version);
commit;
