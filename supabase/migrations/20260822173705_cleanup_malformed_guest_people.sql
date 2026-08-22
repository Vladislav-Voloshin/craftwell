-- Preserve any unique source discovered under a spelling/title alias before
-- removing parser-generated people that no longer have an evidence mention.
with alias_mapping(old_name, new_name) as (
  values
    ('abud bakari', 'abud bakri'),
    ('immordino yang', 'mary helen immordino yang'),
    ('matthew walker', 'matt walker'),
    ('u s surgeon general dr vivek murthy', 'vivek murthy')
)
insert into public.person_sources (
  person_id,
  source_kind,
  url,
  title,
  verified,
  metadata,
  first_seen_at,
  last_checked_at
)
select
  target_person.id,
  old_source.source_kind,
  old_source.url,
  old_source.title,
  old_source.verified,
  old_source.metadata,
  old_source.first_seen_at,
  old_source.last_checked_at
from alias_mapping
join public.people old_person on old_person.normalized_name = alias_mapping.old_name
join public.people target_person on target_person.normalized_name = alias_mapping.new_name
join public.person_sources old_source on old_source.person_id = old_person.id
on conflict (person_id, url) do update
set title = coalesce(public.person_sources.title, excluded.title),
    verified = public.person_sources.verified or excluded.verified,
    metadata = public.person_sources.metadata || excluded.metadata,
    first_seen_at = least(public.person_sources.first_seen_at, excluded.first_seen_at),
    last_checked_at = greatest(public.person_sources.last_checked_at, excluded.last_checked_at);

delete from public.people
where normalized_name in (
  'abud bakari',
  'andy galpin how to assess improve all aspects of your fitness',
  'andy galpin how to build physical endurance lose fat',
  'andy galpin maximize recovery to achieve fitness performance goals',
  'andy galpin optimal nutrition supplementation for fitness',
  'andy galpin optimal protocols to build strength grow muscles',
  'andy galpin optimize your training program for fitness longevity',
  'daily tools',
  'effects of light dark on mental health treatments for cancer',
  'immordino yang',
  'mark zuckerberg dr priscilla chan',
  'matt walker how to structure your sleep use naps time caffeine',
  'matt walker improve sleep to boost mood emotional regulation',
  'matt walker protocols to improve your sleep',
  'matt walker the biology of sleep your unique sleep needs',
  'matt walker the science of dreams nightmares lucid dreaming',
  'matt walker using sleep to improve learning creativity memory',
  'matthew walker',
  'metformin for longevity the power of belief effects',
  'paul conti how to build and maintain healthy relationships',
  'paul conti how to improve your mental health',
  'paul conti how to understand assess your mental health',
  'paul conti tools and protocols for mental health',
  'research supported stretching protocols',
  'science based tools',
  'u s surgeon general dr vivek murthy'
)
and not exists (
  select 1
  from public.document_people
  where document_people.person_id = people.id
);
