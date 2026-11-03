-- Featured image alt text was always just the post title, hardcoded --
-- not editable, and not necessarily an accurate description of the
-- image itself. Adds a real column with the console UI to manage it;
-- falls back to the title when blank so nothing regresses.
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS feature_image_alt text;
