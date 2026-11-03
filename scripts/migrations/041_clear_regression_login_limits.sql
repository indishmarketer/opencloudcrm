-- Clear only transient login counters accumulated while the strict login
-- payload validator rejected the production AuthForm's known fields.
DELETE FROM rate_limits WHERE key LIKE 'login:%';
