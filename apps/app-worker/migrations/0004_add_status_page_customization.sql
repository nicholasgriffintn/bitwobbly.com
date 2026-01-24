-- Add customization columns to status_pages
ALTER TABLE status_pages ADD COLUMN logo_url TEXT DEFAULT NULL;
ALTER TABLE status_pages ADD COLUMN brand_color TEXT DEFAULT '#007bff';
ALTER TABLE status_pages ADD COLUMN custom_css TEXT DEFAULT NULL;