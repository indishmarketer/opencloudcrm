-- Moves every hardcoded meeting-related email (src/lib/meetingEmails.ts) into
-- the console-editable email_templates system, same as migration 053 did for
-- webinars. Attendee-facing templates track opens; owner/admin alert
-- templates don't, matching the convention set by the *-admin-notify rows in
-- migration 032.

INSERT INTO email_templates
  (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars)
VALUES

('meeting-confirmation', 'meetings', 'Meeting booking confirmed',
 'Sent to the attendee immediately after they book a meeting.',
 $s$Meeting confirmed: {{meeting_name}}$s$,
 $b$<p>Hi {{first_name}},</p><p>Your <strong>{{meeting_name}}</strong> is confirmed for {{session_date}}.</p><p><a href="{{join_url}}">Join the meeting</a> when it is time.</p><p>Need a different time? <a href="{{manage_url}}">Reschedule or cancel</a>.</p>$b$,
 'support@example.com', false, true,
 ARRAY['first_name','meeting_name','session_date','join_url','manage_url']),

('meeting-cancelled', 'meetings', 'Meeting cancelled',
 'Sent to the attendee when their meeting is cancelled.',
 $s$Meeting cancelled: {{meeting_name}}$s$,
 $b$<p>Hi {{first_name}},</p><p>Your <strong>{{meeting_name}}</strong> booking has been cancelled.</p><p>Reason: {{reason}}</p><p>You can book a new time whenever you are ready.</p>$b$,
 'support@example.com', false, true,
 ARRAY['first_name','meeting_name','reason']),

('meeting-rescheduled', 'meetings', 'Meeting rescheduled',
 'Sent to the attendee when their meeting is moved to a new time.',
 $s$Meeting rescheduled: {{meeting_name}}$s$,
 $b$<p>Hi {{first_name}},</p><p>Your <strong>{{meeting_name}}</strong> is now scheduled for {{session_date}}.</p><p><a href="{{join_url}}">Join the meeting</a> when it is time.</p><p>Need a different time? <a href="{{manage_url}}">Reschedule or cancel</a>.</p>$b$,
 'support@example.com', false, true,
 ARRAY['first_name','meeting_name','session_date','join_url','manage_url']),

('meeting-reminder-24h', 'meetings', 'Meeting reminder, 24 hours',
 'Sent about one day before an attendee''s booked meeting.',
 $s$Reminder: {{meeting_name}} tomorrow$s$,
 $b$<p>Hi {{first_name}},</p><p>Your <strong>{{meeting_name}}</strong> is tomorrow, at {{session_date}}.</p><p><a href="{{join_url}}">Join the meeting</a> when it is time.</p>$b$,
 'support@example.com', false, true,
 ARRAY['first_name','meeting_name','session_date','join_url']),

('meeting-reminder-1h', 'meetings', 'Meeting reminder, 1 hour',
 'Sent about one hour before an attendee''s booked meeting.',
 $s$Reminder: {{meeting_name}} starts soon$s$,
 $b$<p>Hi {{first_name}},</p><p>Your <strong>{{meeting_name}}</strong> starts in about one hour, at {{session_date}}.</p><p><a href="{{join_url}}">Join the meeting</a> when it is time.</p>$b$,
 'support@example.com', false, true,
 ARRAY['first_name','meeting_name','session_date','join_url']),

('meeting-no-show-recovery', 'meetings', 'No-show recovery',
 'Sent once, the first time an attendee is reported as a no-show for their meeting.',
 $s$Sorry we missed each other$s$,
 $b$<p>Hi {{first_name}},</p><p>Looks like we missed each other for your <strong>{{meeting_name}}</strong>. No worries at all, it happens.</p><p><a href="{{rebook_url}}">Grab another time</a> whenever works for you.</p>$b$,
 'support@example.com', false, true,
 ARRAY['first_name','meeting_name','rebook_url']),

('meeting-follow-up', 'meetings', 'Post-meeting follow-up',
 'Sent once, right after a meeting is reported as completed.',
 $s$Thanks for the call$s$,
 $b$<p>Hi {{first_name}},</p><p>Thanks for taking the time for your <strong>{{meeting_name}}</strong> today. It was great speaking with you.</p><p>If anything comes to mind after we talked, just reply to this email, it comes straight through.</p>$b$,
 'support@example.com', false, true,
 ARRAY['first_name','meeting_name']),

('meeting-owner-new-booking', 'meetings', 'New booking (owner alert)',
 'Sent to you whenever someone books a meeting.',
 $s$New booking: {{meeting_name}} with {{attendee_name}}$s$,
 $b$<p>New booking on <strong>{{meeting_name}}</strong> with {{attendee_name}} ({{attendee_email}}).</p><p><strong>{{session_date}}</strong> (your timezone).</p>{{notes_block}}<p><a href="{{console_url}}">View in console</a></p>$b$,
 'support@example.com', false, false,
 ARRAY['attendee_name','attendee_email','meeting_name','session_date','notes_block','console_url']),

('meeting-owner-cancelled-notice', 'meetings', 'Attendee cancelled (owner alert)',
 'Sent to you when an attendee cancels their own meeting via their manage link.',
 $s$Cancelled: {{meeting_name}} with {{attendee_name}}$s$,
 $b$<p><strong>{{attendee_name}}</strong> ({{attendee_email}}) just cancelled their <strong>{{meeting_name}}</strong>, which was booked for <strong>{{session_date}}</strong> (your timezone).</p><p>Reason: {{reason}}</p><p><a href="{{console_url}}">View in console</a></p>$b$,
 'support@example.com', false, false,
 ARRAY['attendee_name','attendee_email','meeting_name','session_date','reason','console_url']),

('meeting-owner-rescheduled-notice', 'meetings', 'Attendee rescheduled (owner alert)',
 'Sent to you when an attendee reschedules their own meeting via their manage link.',
 $s$Rescheduled: {{meeting_name}} with {{attendee_name}}$s$,
 $b$<p><strong>{{attendee_name}}</strong> ({{attendee_email}}) moved their <strong>{{meeting_name}}</strong> to <strong>{{session_date}}</strong> (your timezone).</p><p><a href="{{console_url}}">View in console</a></p>$b$,
 'support@example.com', false, false,
 ARRAY['attendee_name','attendee_email','meeting_name','session_date','console_url']),

('meeting-unrecognized-type-alert', 'meetings', 'Unrecognized booking (owner alert)',
 'Sent to you when a booking comes in for an event type that has no matching meeting type in the console.',
 $s$A booking wasn't recorded on the site$s$,
 $b$<p>Someone just booked <strong>{{event_info}}</strong> with {{attendee_info}}, but that event type doesn't match anything created in the Meetings console here, so this booking was not saved, and no confirmation or reminder emails went out for it.</p><p>This usually means an event type was created directly on the scheduling calendar instead of from <a href="{{console_url}}">the console</a>. Create it there instead so future bookings against it are tracked properly.</p>$b$,
 'support@example.com', false, false,
 ARRAY['event_info','attendee_info','console_url']),

('meeting-reconciliation-orphan-alert', 'meetings', 'Missing bookings (owner alert)',
 'Sent by the daily reconciliation check when bookings exist on the scheduling calendar but not on the site.',
 $s${{count}} booking(s) missing from the site$s$,
 $b$<p>The daily check against the scheduling calendar found {{count}} booking(s) that exist there but have no matching record here (for example, booking <code>{{example_uid}}</code>). This usually means a booking-created notification never arrived. No confirmation or reminder email went out for the affected booking(s).</p><p>Check the scheduling calendar directly for the details, since it's not recorded here to reference.</p>$b$,
 'support@example.com', false, false,
 ARRAY['count','example_uid'])

ON CONFLICT (key) DO NOTHING;
