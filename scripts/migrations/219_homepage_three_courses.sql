-- The homepage "Learn it yourself" section listed two courses in two
-- spacious columns. There are three courses now, so it moves to three
-- columns at normal density: the spacious padding and gap were sized for
-- two wide cards and make three look cramped.
--
-- Order is deliberate and not by date: the new course first because it
-- follows on from the free guide the hero offers, then Medium, then
-- Reddit.
--
-- Patched in SQL rather than by resending the whole page through the
-- editor API, so only this one block is touched and the other eleven
-- sections cannot be damaged in transit. Both the draft `blocks` and the
-- `published` snapshot are updated, otherwise the change would sit
-- invisible as an unpublished draft.
DO $$
DECLARE
  new_items jsonb := jsonb_build_array(
    jsonb_build_object(
      'href', '/courses/build-your-own-system',
      'text', 'Watch me take an empty folder to a live site on one server, with an AI agent doing the work. Four modules, fourteen short lessons.',
      'badge', '',
      'image', 'https://images.indishmarketer.com/courses/build-your-own-system-cover.webp',
      'title', 'Build Your Own System With AI',
      'eyebrow', 'Course',
      'imageAlt', 'Build Your Own System With AI cover',
      'linkLabel', 'Explore course'
    ),
    jsonb_build_object(
      'href', '/courses/medium-writing-monetization-challenge',
      'text', 'Write, publish and monetize on Medium using AI. Eleven modules, forty-one lessons, built from what actually works.',
      'badge', '',
      'image', 'https://images.indishmarketer.com/courses/medium-writing-monetization-challenge-cover.webp',
      'title', 'Medium Writing & Monetization Challenge',
      'eyebrow', 'Course',
      'imageAlt', 'Medium Writing and Monetization Challenge cover',
      'linkLabel', 'Explore course'
    ),
    jsonb_build_object(
      'href', '/courses/3-day-reddit-marketing-challenge',
      'text', 'Turn Reddit traffic into leads and sales. Five modules, fourteen lessons, three days.',
      'badge', '',
      'image', 'https://images.indishmarketer.com/courses/3-day-reddit-marketing-challenge-cover.webp',
      'title', '3-Day Reddit Marketing Challenge',
      'eyebrow', 'Course',
      'imageAlt', '3-Day Reddit Marketing Challenge cover',
      'linkLabel', 'Explore course'
    )
  );
  patch jsonb := jsonb_build_object('columns', '3', 'density', 'normal') || jsonb_build_object('items', new_items);
BEGIN
  -- draft
  UPDATE site_pages
  SET blocks = (
        SELECT jsonb_agg(
                 CASE WHEN element->>'id' = 'home-courses'
                      THEN jsonb_set(element, '{props}', (element->'props') || patch)
                      ELSE element END
                 ORDER BY ordinality)
        FROM jsonb_array_elements(blocks) WITH ORDINALITY AS t(element, ordinality)
      ),
      updated_at = now()
  WHERE kind = 'page' AND path = '/'
    AND blocks @> '[{"id": "home-courses"}]';

  -- published snapshot, so the change is live rather than a pending draft
  UPDATE site_pages
  SET published = jsonb_set(
        published,
        '{blocks}',
        (
          SELECT jsonb_agg(
                   CASE WHEN element->>'id' = 'home-courses'
                        THEN jsonb_set(element, '{props}', (element->'props') || patch)
                        ELSE element END
                   ORDER BY ordinality)
          FROM jsonb_array_elements(published->'blocks') WITH ORDINALITY AS t(element, ordinality)
        )
      ),
      published_at = now()
  WHERE kind = 'page' AND path = '/'
    AND published IS NOT NULL
    AND published->'blocks' @> '[{"id": "home-courses"}]';
END $$;
