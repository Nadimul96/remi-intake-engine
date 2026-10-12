do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = any (con.conkey)
    where con.contype = 'f'
      and con.conrelid = 'asset_organization_relationship_proposals'::regclass
      and con.confrelid = 'accepted_relationship_records'::regclass
      and att.attname = 'accepted_record_id'
  loop
    execute format(
      'alter table asset_organization_relationship_proposals drop constraint %I',
      constraint_name
    );
  end loop;

  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = any (con.conkey)
    where con.contype = 'f'
      and con.conrelid = 'accepted_asset_organization_relationship_links'::regclass
      and con.confrelid = 'accepted_relationship_records'::regclass
      and att.attname = 'accepted_record_id'
  loop
    execute format(
      'alter table accepted_asset_organization_relationship_links drop constraint %I',
      constraint_name
    );
  end loop;
end
$$;
