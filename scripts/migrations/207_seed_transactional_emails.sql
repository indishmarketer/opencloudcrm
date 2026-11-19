-- Restore the transactional email templates.
--
-- Migrations 185-195 deleted every fixed email_templates row, on the plan
-- that workflows would replace them. That replacement was never built for
-- these, and every call site treats a missing row as "skip silently":
--
--   coursePurchaseGrant.ts  const grantTpl = await getEmailTemplateOptional("course-access-granted-pro");
--                           if (grantTpl) { ...send... }
--
-- So with the table empty, somebody pays for a course, gets access in the
-- database, and is told nothing. Same for a free enrolment, an admin
-- upgrade, an approved payment claim, and the contact form. The admin
-- alerts for a failed grant or an unmatched Razorpay payment were also
-- silently dropped, which is how a broken purchase could go unnoticed.
--
-- Seeding these rows fixes all of that and, because Console -> Email ->
-- Library lists exactly this table (listEmailTemplates), it is also what
-- makes every transactional email visible and editable in the console.
--
-- House style for the copy below: plain conversational English, active
-- voice, NO em dashes anywhere, inline links rather than buttons, and the
-- sign-off on its own lines with no dash. emailShell.ts already supplies
-- the font, width and colours, so these bodies stay as bare paragraphs.
--
-- ON CONFLICT DO NOTHING: never clobber copy the owner has since edited.

BEGIN;

INSERT INTO email_templates (key, category, label, description, subject, body_html, from_email, critical, track_opens, allowed_vars) VALUES

('course-access-granted-pro', 'courses', 'Course access: PRO purchase',
 'Sent the moment a Razorpay or PayPal payment is captured and PRO access is granted.',
 'You''re in: {{course_title}}',
 '<p>Hi {{first_name}},</p>
<p>Your payment went through and your PRO access to <strong>{{course_title}}</strong> is open now. Nothing else to do.</p>
<p>👉 <a href="{{course_url}}" style="color:#1a0dab;font-weight:600;">Start the course here</a></p>
<p>Everything is unlocked, so you can work through it in order or jump straight to the part you came for. Your progress saves as you go, so you can stop and pick it up later on any device.</p>
<p>If a lesson does not make sense, or something looks broken, just hit reply. It comes straight to me and I read every one.</p>
<p>Shubho<br>Indish Marketer</p>',
 'academy@indishmarketer.com', true, true, ARRAY['first_name','course_title','course_url']),

('course-access-granted-free', 'courses', 'Course access: free enrolment',
 'Sent when someone enrols in the free tier of a course.',
 'Your free access to {{course_title}} is ready',
 '<p>Hi {{first_name}},</p>
<p>You''re enrolled in <strong>{{course_title}}</strong> and the free lessons are open now.</p>
<p>👉 <a href="{{course_url}}" style="color:#1a0dab;font-weight:600;">Open the course</a></p>
<p>Start with the first lesson and go at whatever pace suits you. Your progress saves automatically, so you can close it and come back where you left off.</p>
<p>If you get stuck on anything, reply to this email and tell me what happened. It comes straight to me.</p>
<p>Shubho<br>Indish Marketer</p>',
 'academy@indishmarketer.com', false, true, ARRAY['first_name','course_title','course_url']),

('course-access-upgraded', 'courses', 'Course access: upgraded to PRO',
 'Sent when an admin upgrades an existing learner to PRO.',
 'Your {{course_title}} access is now PRO',
 '<p>Hi {{first_name}},</p>
<p>I''ve upgraded you to PRO on <strong>{{course_title}}</strong>. Every module is open to you now, not just the free ones.</p>
<p>👉 <a href="{{course_url}}" style="color:#1a0dab;font-weight:600;">Pick up where you left off</a></p>
<p>Your existing progress is untouched, so nothing resets. The lessons that were locked before are simply available now.</p>
<p>Any trouble getting in, just reply here.</p>
<p>Shubho<br>Indish Marketer</p>',
 'academy@indishmarketer.com', false, true, ARRAY['first_name','course_title','course_url']),

('course-access-granted-claim-approved', 'courses', 'Course access: payment claim approved',
 'Sent when an admin approves a manually submitted payment claim.',
 'Approved: your access to {{course_title}}',
 '<p>Hi {{first_name}},</p>
<p>I checked your payment and it''s all good. Your access to <strong>{{course_title}}</strong> is open now.</p>
<p>👉 <a href="{{course_url}}" style="color:#1a0dab;font-weight:600;">Start the course</a></p>
<p>Thanks for your patience while I confirmed it. Manual claims get checked by hand, which is why it took a little longer than a card payment would.</p>
<p>Reply here if anything does not look right.</p>
<p>Shubho<br>Indish Marketer</p>',
 'academy@indishmarketer.com', true, true, ARRAY['first_name','course_title','course_url']),

('course-access-granted-manual', 'courses', 'Course access: granted by admin',
 'Sent when an admin grants course access to someone who already has an account.',
 'I''ve given you access to {{course_title}}',
 '<p>Hi {{first_name}},</p>
<p>I''ve added <strong>{{course_title}}</strong> to your account. It''s ready whenever you are.</p>
<p>👉 <a href="{{course_url}}" style="color:#1a0dab;font-weight:600;">Open the course</a></p>
<p>Sign in with the same email this was sent to and it will be waiting in your account.</p>
<p>Shubho<br>Indish Marketer</p>',
 'academy@indishmarketer.com', true, true, ARRAY['first_name','course_title','course_url']),

('course-access-granted-new-account', 'courses', 'Course access: granted, new account',
 'Sent when an admin grants course access and a brand new account was created for them. Carries a one-click sign-in link.',
 'Your account and {{course_title}} are ready',
 '<p>Hi {{first_name}},</p>
<p>I''ve set up an account for you and added <strong>{{course_title}}</strong> to it.</p>
<p>👉 <a href="{{signin_url}}" style="color:#1a0dab;font-weight:600;">Click here to sign in and start</a></p>
<p>That link signs you in without a password, so there''s nothing to remember. Once you''re in you can set a password from your account settings if you want one.</p>
<p>The course itself lives at <a href="{{course_url}}" style="color:#1a0dab;">{{course_url}}</a> any time you come back.</p>
<p>Shubho<br>Indish Marketer</p>',
 'academy@indishmarketer.com', true, true, ARRAY['first_name','course_title','course_url','signin_url'])

('otp-code', 'account', 'Verification code',
 'The code and one-click link sent whenever someone has to prove they own an email address: signup, newsletter opt-in, the free guide, and the contact form. otp.ts falls back to a built-in version of this if the row is missing, so verification can never silently stop working.',
 'Your verification code: {{code}}',
 '<p>Hi,</p>
<p>Here is your verification code:</p>
<p><strong style="font-size:22px;letter-spacing:3px;">{{code}}</strong></p>
<p>Type that in and you''re done. Or if it''s easier, <a href="{{magic_link_url}}" style="color:#1a0dab;font-weight:600;">click here to confirm instead</a>. Both do the same thing.</p>
<p>The code works for the next 10 minutes. After that just ask for a new one, it takes a second.</p>
<p>If you didn''t ask for this, you can ignore this email. Nothing happens until the code is used.</p>
<p>Shubho<br>Indish Marketer</p>',
 'support@indishmarketer.com', true, false, ARRAY['code','magic_link_url'])

ON CONFLICT (key) DO NOTHING;

COMMIT;
