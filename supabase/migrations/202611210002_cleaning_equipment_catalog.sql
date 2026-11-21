update public.cleaning_equipment
set is_active = false
where name in ('Vacuum', 'Mop', 'Ladder', 'Window squeegee', 'Steamer');

insert into public.cleaning_equipment(organisation_id, name)
select organisations.id, equipment.name
from public.organisations
cross join (values
  ('Glass cleaner'),
  ('Window washer'),
  ('Window wiper'),
  ('Window scraper'),
  ('Telescopic poles'),
  ('Grout brush'),
  ('Floor cleaner'),
  ('Mop and mop bucket'),
  ('Sponge'),
  ('Scrub brush'),
  ('Microfiber cloths'),
  ('Cleaning cloths'),
  ('Floor scraper'),
  ('Trash bags'),
  ('Paper towels'),
  ('Dusters'),
  ('Cleaning caddy'),
  ('Dishwashing liquid'),
  ('Magic eraser'),
  ('Plastic buckets'),
  ('Vacuum cleaner'),
  ('Toothbrush'),
  ('Broom and dustpan'),
  ('Duster'),
  ('Toilet bowl cleaner'),
  ('Toilet brush'),
  ('Bathroom squeegee'),
  ('White chemical'),
  ('Microwave cleaner'),
  ('Drain cleaner'),
  ('Griddle scraper'),
  ('Floor squeegee'),
  ('Floor polish liquid'),
  ('Air freshener'),
  ('Step stool'),
  ('Floor scrubbing machine'),
  ('Floor polishing machine'),
  ('Carpet cleaning machine'),
  ('Sofa cleaning machine'),
  ('Steam cleaner'),
  ('Step ladder'),
  ('Floor brush'),
  ('Hand drill machine'),
  ('Micro mop')
) as equipment(name)
on conflict (organisation_id, name) do nothing;
