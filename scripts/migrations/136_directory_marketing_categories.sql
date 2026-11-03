-- Marketing-side directory categories. 135 widened the AI/product side;
-- the owner's follow-up was that the marketing categories a marketer would
-- actually search for were still missing (affiliate, content, copywriting,
-- link building, local SEO, CRO).
--
-- These sit between the existing SEO (110) and social (130) blocks so the
-- marketing categories read as one run in the picker. The picker filters by
-- typing now, so the length of the list is no longer the constraint it was.
INSERT INTO directory_categories (slug, name, description, sort_order) VALUES
('content-marketing-tools', 'Content Marketing',
 'Content marketing tools plan, brief, and track blog posts, newsletters, and videos. Compare calendars, briefs, repurposing, and content analytics tools.', 106),
('copywriting-tools', 'Copywriting Tools',
 'Copywriting tools help you write headlines, landing pages, ads, and emails that convert. Compare AI writers, swipe files, and readability and tone checkers.', 107),
('affiliate-marketing-tools', 'Affiliate Marketing',
 'Affiliate marketing tools find programmes, track links and commissions, and manage disclosures. Compare link cloakers, dashboards, and affiliate networks.', 108),
('link-building-tools', 'Link Building and Outreach',
 'Link building tools find prospects, pitch them, and track the links you earn. Compare outreach inboxes, backlink monitors, and digital PR platforms.', 111),
('local-seo-tools', 'Local SEO and Maps',
 'Local SEO tools manage your Google Business Profile, citations, and map rankings. Compare listing managers, rank grids, and review request tools.', 112),
('landing-pages-and-cro', 'Landing Pages and CRO',
 'Landing page and CRO tools build pages and then improve what they convert. Compare page builders, popup and form tools, and conversion rate optimisation suites.', 113),
('ab-testing-tools', 'A/B Testing and Experiments',
 'Testing tools run A/B and multivariate experiments on pages, pricing, and emails. Compare platforms by traffic needed, setup effort, and statistics they report.', 114),
('heatmaps-and-recordings', 'Heatmaps and Session Recording',
 'Heatmap and recording tools show where people click, scroll, and give up. Compare session replay, funnel drop-off, and on-page feedback tools.', 151),
('marketing-automation', 'Marketing Automation',
 'Marketing automation tools run multi-step journeys across email, SMS, and ads from one place. Compare automation builders for small teams and solo marketers.', 104),
('newsletter-platforms', 'Newsletter Platforms',
 'Newsletter platforms host your list, send the issues, and handle paid subscriptions. Compare platforms for writers, creators, and paid community newsletters.', 102),
('competitor-research', 'Competitor Research',
 'Competitor research tools show what rivals rank for, advertise, and ship. Compare ad libraries, traffic estimators, and change monitoring tools.', 116),
('market-research-tools', 'Market and Audience Research',
 'Research tools tell you what your audience searches, asks, and complains about. Compare survey tools, forum and review miners, and keyword demand research.', 117),
('reputation-and-reviews', 'Reviews and Reputation',
 'Review tools collect testimonials, request ratings, and show them on your site. Compare review widgets, request automation, and reputation monitoring.', 136),
('branding-and-identity', 'Branding and Identity',
 'Branding tools make logos, palettes, type pairings, and brand guidelines. Compare identity generators and brand asset managers for small businesses.', 159),
('community-platforms', 'Community Platforms',
 'Community platforms host paid or free member spaces with discussions, courses, and events. Compare platforms by moderation, mobile apps, and pricing.', 175),
('podcast-tools', 'Podcast Tools',
 'Podcast tools record, edit, host, and promote episodes and their clips. Compare remote recording, audio cleanup, hosting, and show note generators.', 67)
ON CONFLICT (slug) DO NOTHING;
