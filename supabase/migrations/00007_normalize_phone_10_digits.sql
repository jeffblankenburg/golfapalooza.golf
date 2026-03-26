-- Normalize all phone numbers to 10 digits (strip leading US country code "1")
UPDATE public.users
SET phone = RIGHT(phone, 10)
WHERE LENGTH(phone) = 11 AND phone LIKE '1%';
