-- Full page text and the sparse cell grid, so extraction can cite a specific line or cell.
alter table document_pages
  add column if not exists text_content text;

alter table worksheets
  add column if not exists rows_json jsonb not null default '[]'::jsonb;
