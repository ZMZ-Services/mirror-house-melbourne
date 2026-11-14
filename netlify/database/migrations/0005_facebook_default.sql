-- The shop's Facebook page (Admin → Settings). Filled in only where it's still empty, so an address already saved
-- in the admin is kept.
UPDATE settings
SET value = jsonb_set(value, '{facebook}', to_jsonb('https://www.facebook.com/profile.php?id=61596421771974'::text)), updated_at = now()
WHERE key = 'store' AND coalesce(value->>'facebook', '') = '';
