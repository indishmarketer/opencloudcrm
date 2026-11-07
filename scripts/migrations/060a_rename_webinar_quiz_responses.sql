-- Not a missing-table gap like 001_bootstrap_base_schema.sql -- this one
-- table (created under its original name by migration 052) was renamed
-- on production at some point without a committed migration capturing
-- it, and 061_webinar_ask_question_interaction.sql (which runs right
-- after this) already assumes the new name. Numbered to sort between
-- 052 (creates it) and 061 (alters it) without renumbering either.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webinar_quiz_responses')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webinar_event_responses') THEN
    ALTER TABLE webinar_quiz_responses RENAME TO webinar_event_responses;
  END IF;
END $$;
