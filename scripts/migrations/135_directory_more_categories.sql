-- More directory categories. The owner asked for a wider set after the
-- category browse grid came off /tools and the category became a filter:
-- a filter can hold 36 options without looking cluttered, a grid of 36
-- cards cannot, so the two changes go together.
--
-- sort_order slots into the gaps left by 106_directory_review_flow.sql
-- (10..180 in tens) so related categories stay next to each other in the
-- filter rather than being appended in insertion order.
INSERT INTO directory_categories (slug, name, description, sort_order) VALUES
('ai-search-tools', 'AI Search and Research',
 'AI search tools answer questions with sources instead of a list of links. Compare research assistants that summarise the web, papers, and your own documents.', 35),
('video-editing-tools', 'Video Editing Tools',
 'Video editors for cutting, captioning, and resizing content for YouTube, Reels, and ads. Compare desktop and browser editors by speed, price, and export quality.', 62),
('transcription-tools', 'Transcription and Captions',
 'Transcription tools turn audio and video into text, subtitles, and searchable notes. Compare accuracy, languages supported, and how they handle accents.', 64),
('ai-audio-tools', 'AI Audio and Voice Tools',
 'AI audio tools clone voices, read scripts aloud, and generate music and sound effects. Compare text to speech, voice cloning, and audio cleanup tools.', 66),
('whatsapp-marketing', 'WhatsApp and SMS Marketing',
 'WhatsApp and SMS tools send campaigns, reminders, and support replies to phones. Compare official API providers, pricing, and how each handles templates.', 105),
('ads-and-ppc-tools', 'Ads and PPC Tools',
 'Ad tools help you write, launch, and track paid campaigns on Google, Meta, and LinkedIn. Compare creative generators, bid managers, and reporting dashboards.', 115),
('lead-generation-tools', 'Lead Generation and Enrichment',
 'Lead tools find prospects, verify emails, and fill in missing company details. Compare databases, enrichment APIs, and outreach tools for small teams.', 118),
('chatbots-and-live-chat', 'Chatbots and Live Chat',
 'Chat tools answer visitors on your site, capture leads, and hand off to a human. Compare AI chatbots, live chat widgets, and shared inboxes for support.', 122),
('affiliate-and-influencer-tools', 'Affiliate and Influencer Tools',
 'Affiliate and creator tools run referral programmes, track commissions, and find influencers. Compare options for coaches, SaaS, and ecommerce brands.', 135),
('no-code-app-builders', 'No-Code App Builders',
 'No-code builders let you ship internal tools, client portals, and small apps without a developer. Compare builders by database, logic, and hosting limits.', 142),
('hosting-and-deployment', 'Hosting and Deployment',
 'Hosting platforms put your site, app, or self-hosted tool online. Compare free tiers, deploy flow, and what each costs once real traffic arrives.', 146),
('ecommerce-tools', 'Ecommerce Tools',
 'Ecommerce tools run storefronts, carts, and order flows for physical and digital products. Compare platforms and add-ons for selling in India and worldwide.', 162),
('data-and-scraping-tools', 'Data and Scraping Tools',
 'Scraping and data tools collect, clean, and structure information from websites and APIs. Compare no-code scrapers, crawlers, and data enrichment pipelines.', 166),
('course-platforms', 'Course and Membership Platforms',
 'Course platforms host lessons, take payments, and manage students and members. Compare platforms for coaches, creators, and small education businesses.', 174),
('webinars-and-meetings', 'Webinars and Meetings',
 'Webinar and meeting tools run live sessions, sales calls, and recorded replays. Compare hosting limits, recording quality, and scheduling and booking features.', 176),
('project-management', 'Project Management',
 'Project tools track tasks, deadlines, and client work for small teams and solo operators. Compare boards, docs, and time tracking without enterprise pricing.', 178)
ON CONFLICT (slug) DO NOTHING;
