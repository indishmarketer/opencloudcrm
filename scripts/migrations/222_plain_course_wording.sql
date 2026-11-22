-- The course subtitle and description were rewritten for someone who has
-- never read the free guide, but the curriculum kept the same insider
-- wording underneath: "from empty folder", "ship a page", "its own door".
-- Those sit on the public course page, so a first-time visitor still met
-- phrases that assume context, and a couple that are just metaphors.
--
-- Every change is matched on the exact old text, so re-running does
-- nothing and a title edited by hand afterwards is never clobbered.

UPDATE course_modules SET
  title = 'Your first page, live on your domain',
  description = 'Protect your keys, let the agent set up the code, and put a page online that collects signups.'
WHERE title = 'From empty folder to live page';

UPDATE course_modules SET title = 'Keeping it running'
WHERE title = 'Run it without fear';

UPDATE course_lessons SET title = 'Protect your keys first'
WHERE title = 'The first thing you type, every time';

UPDATE course_lessons SET title = 'Letting the agent work on its own'
WHERE title = 'Giving the agent its own door';

UPDATE course_lessons SET title = 'Let it set up the code for you'
WHERE title = 'Let it make the repository';
