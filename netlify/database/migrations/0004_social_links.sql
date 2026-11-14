-- Social media links (Admin → Settings). Instagram starts with the shop's account; Facebook is empty until there's a page.
UPDATE settings
SET value = jsonb_build_object('instagram', 'https://www.instagram.com/mirrorhousemelbourne/', 'facebook', '') || value, updated_at = now()
WHERE key = 'store' AND NOT (value ? 'instagram');
