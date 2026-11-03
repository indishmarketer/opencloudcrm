-- Adds a third timed-interaction type ("question") for on-demand audience
-- research, separate from the existing "quiz" (which can be scored) and
-- "cta". A question is never scored -- it exists purely to record what a
-- specific attendee said, tied to that attendee and that webinar, so the
-- owner can review it later and follow up individually. It can be answered
-- either by picking one of several options or by typing a free-text reply.
--
-- Also renames webinar_quiz_responses -> webinar_event_responses and adds
-- response_text, since this table now records answers to both quiz and
-- question interactions, not quiz alone. The rename is cosmetic only --
-- existing indexes/constraints keep their old auto-generated names, no
-- functional change.
--
-- "chat" display mode is renamed to "qa" -- the standalone chat feature
-- doesn't exist in this product anymore; a timed interaction shown outside
-- a popup now appears in the room's existing Q&A sidebar instead.

ALTER TABLE webinar_timed_events DROP CONSTRAINT webinar_timed_events_check;
ALTER TABLE webinar_timed_events DROP CONSTRAINT webinar_timed_events_event_type_check;
ALTER TABLE webinar_timed_events DROP CONSTRAINT webinar_timed_events_display_mode_check;

ALTER TABLE webinar_timed_events ADD COLUMN IF NOT EXISTS response_type TEXT CHECK (response_type IN ('choice', 'text'));

UPDATE webinar_timed_events SET display_mode = 'qa' WHERE display_mode = 'chat';

ALTER TABLE webinar_timed_events
  ADD CONSTRAINT webinar_timed_events_event_type_check CHECK (event_type IN ('quiz', 'cta', 'question')),
  ADD CONSTRAINT webinar_timed_events_display_mode_check CHECK (display_mode IN ('popup', 'qa', 'both')),
  ADD CONSTRAINT webinar_timed_events_check CHECK (
    (event_type = 'quiz' AND jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2 AND cta_label IS NULL AND cta_url IS NULL)
    OR
    (event_type = 'cta' AND options = '[]'::jsonb AND correct_option IS NULL AND cta_label IS NOT NULL AND cta_url IS NOT NULL)
    OR
    (event_type = 'question' AND correct_option IS NULL AND cta_label IS NULL AND cta_url IS NULL AND (
      (response_type = 'choice' AND jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2)
      OR
      (response_type = 'text' AND options = '[]'::jsonb)
    ))
  );

ALTER TABLE webinar_quiz_responses RENAME TO webinar_event_responses;
ALTER TABLE webinar_event_responses ALTER COLUMN selected_option DROP NOT NULL;
ALTER TABLE webinar_event_responses ADD COLUMN IF NOT EXISTS response_text TEXT;
ALTER TABLE webinar_event_responses DROP CONSTRAINT webinar_quiz_responses_selected_option_check;
ALTER TABLE webinar_event_responses ADD CONSTRAINT webinar_event_responses_selected_option_check CHECK (selected_option IS NULL OR selected_option >= 0);
ALTER TABLE webinar_event_responses ADD CONSTRAINT webinar_event_responses_answer_check CHECK (
  selected_option IS NOT NULL OR (response_text IS NOT NULL AND length(trim(response_text)) > 0)
);
