alter table asset_organization_relationship_proposals
  drop constraint if exists asset_organization_relationship_proposals_accepted_record_id_fkey;

alter table accepted_asset_organization_relationship_links
  drop constraint if exists accepted_asset_organization_relationship_links_accepted_record_id_fkey;

update asset_organization_relationship_proposals
set metadata_json = metadata_json || jsonb_build_object(
  'acceptedRecordStatus',
  coalesce(metadata_json ->> 'acceptedRecordStatus', 'active')
)
where coalesce(metadata_json ->> 'acceptedRecordStatus', '') = '';
