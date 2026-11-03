-- Yandex Webmaster integration removed: the VPS (and even a Cloudflare
-- Worker, tested directly) cannot reach api.webmaster.yandex.net at all,
-- confirmed as a network routing block rather than a token/config issue.
-- Drops the now-orphaned cached row; nothing in the app writes or reads
-- the "yandex" key any more.
DELETE FROM analytics_cache WHERE key = 'yandex';
