BEGIN;

-- New prompts used by the "Pinterest Affiliate Marketing Has Changed
-- Forever with AI" guide (owner's own YouTube video). The video describes
-- three prompts by what they do, not their literal text, so these are
-- written to match that described purpose.

INSERT INTO prompts (slug, title, category_id, description, prompt_text, status)
VALUES
  (
    'reference-video-analysis-prompt',
    'Reference Video Analysis Prompt',
    (SELECT id FROM prompt_categories WHERE slug = 'agents'),
    'Give Claude Code a downloaded reference video and get back a condensed concept, a character design prompt, and the featured product name.',
    'You are analyzing a downloaded reference video to reverse-engineer it for a new AI-generated video in the same style.

Niche: {niche}
Video file path: {file_path}

Using ffmpeg to sample frames and a transcription API (e.g. AssemblyAI) for the full spoken transcript, do the following:
1. Extract and read the full transcript of the video.
2. Sample frames throughout the video and describe what is visually happening at each key moment (hook, transitions, product reveal, ending).
3. Identify the video''s structure: the hook (first 3 seconds), the pacing, the on-screen character (if any), and the product being promoted.
4. Write a condensed 30-second concept for a new video that follows the same hook and structure, adapted to my niche.
5. Write a detailed character design prompt for an AI presenter that fits this niche and concept (appearance, setting, wardrobe, tone).
6. Write three follow-up angle prompts for the same character (3/4 turn, full side profile, rear view, close-up portrait), worded so they can be pasted immediately after the first character image in the same chat to keep the character consistent.
7. Identify and name the specific product featured or implied in the reference video.

Return the transcript, the visual breakdown, the condensed concept, the character prompt, the angle prompts, and the product name, clearly labeled.',
    'published'
  ),
  (
    'product-photo-cleanup-prompt',
    'Product Photo Cleanup Prompt',
    (SELECT id FROM prompt_categories WHERE slug = 'images'),
    'Strip marketing text, badges, and callouts from a real product photo while leaving the product itself untouched.',
    'Here is a product photo pulled from an e-commerce listing.

Remove all text, dimension callouts, badges, watermarks, and marketing overlays from this image. Do not alter the product itself in any way, keep its exact shape, color, materials, proportions, and position in the frame untouched. The background can be simplified if it contains overlay graphics, but keep it realistic and neutral. Output a clean, photorealistic product image suitable for use as a reference image in a video generation tool.',
    'published'
  ),
  (
    'ai-video-generation-prompt-builder',
    'AI Video Generation Prompt Builder',
    (SELECT id FROM prompt_categories WHERE slug = 'videos'),
    'Turn a reference video''s hook/pacing plus a confirmed product name into a ready-to-paste prompt for an AI video tool.',
    'Using the video concept, hook, pacing, and character details you identified earlier, write a complete video generation prompt for an AI video tool that:

1. Opens with the same hook and pacing as the reference video, adapted to this product.
2. Describes the scene, camera framing, and character actions in concrete, filmable detail, not abstract adjectives.
3. Names the on-screen AI character exactly as it is set up in the video tool, so the tool recognizes it as the character reference rather than plain text.
4. Naturally introduces the product using this confirmed title and description: {product_title} — {product_description}.
5. Ends with a clear call to action appropriate for the platform (e.g. "tap the tag to shop").
6. Is written as one continuous prompt block, 30 seconds of spoken/visual content, ready to paste directly into the video tool.

Keep the prompt specific enough that the generated product closely matches the real reference photos, explicitly instruct the model to closely match the attached product reference images rather than inventing its own version of the product.',
    'published'
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO prompt_guides (slug, title, description, video_url, body, status)
VALUES (
  'pinterest-affiliate-marketing-has-changed-forever-with-ai',
  'Pinterest Affiliate Marketing Has Changed Forever with AI',
  'How one Pinterest video becomes a new AI-presenter affiliate pin, using Claude Code, ChatGPT, and Higgsfield AI.',
  'https://youtu.be/MZcoovOcwzg',
  'This workflow turns one already-successful Pinterest video into a brand-new affiliate pin, without filming a face or recording a voice. It uses one consistent AI presenter, a real Amazon product, and three prompts working together across Claude Code, ChatGPT, and Higgsfield AI.

The short version: find a Pinterest video that''s already performing well in your niche and has a product tagged on it, download it, and hand it to Claude Code along with the video analysis prompt below. Claude breaks the video down frame by frame, pulls the transcript, and returns a condensed concept, a character design prompt, and the product name.

From there, generate five reference images of one consistent AI character across different angles, find the real product on a marketplace like Amazon (only if it''s rated four stars or higher), and clean up two of its photos with the second prompt. Bring the character and the cleaned product photos into Higgsfield AI, use the third prompt to build the final video generation prompt, and generate a 30-second video. Publish it as a new pin, mark it as AI-generated, and tag the product so the affiliate link attaches automatically.

Watch the video below, then use each prompt at the point it''s needed.',
  'published'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO prompt_guide_items (guide_id, position, item_type, prompt_id, timestamp_label, instruction)
SELECT
  (SELECT id FROM prompt_guides WHERE slug = 'pinterest-affiliate-marketing-has-changed-forever-with-ai'),
  v.position,
  'prompt',
  (SELECT id FROM prompts WHERE slug = v.prompt_slug),
  v.timestamp_label,
  v.instruction
FROM (VALUES
  (0, 'reference-video-analysis-prompt', '2:22', 'At this point, the reference Pinterest video has been downloaded. This prompt is pasted into Claude Code (not the browser chat, it needs direct file access) along with the niche and the video''s file path. Claude analyzes the video frame by frame, pulls the full transcript, and hands back a condensed concept, a character design prompt with follow-up angles, and the product name.'),
  (1, 'product-photo-cleanup-prompt', '4:16', 'After downloading two real product photos from the product''s listing, this prompt is used in ChatGPT (attach one photo at a time) to strip out marketing text, badges, and callouts while leaving the product itself untouched, giving two clean reference images.'),
  (2, 'ai-video-generation-prompt-builder', '6:38', 'With the character and the two cleaned product photos already attached inside Higgsfield AI, this prompt is used back in the same Claude Code session to build the final video generation prompt, filling in the confirmed product title and description from the listing before pasting the result into Higgsfield.')
) AS v(position, prompt_slug, timestamp_label, instruction)
WHERE NOT EXISTS (
  SELECT 1 FROM prompt_guide_items
  WHERE guide_id = (SELECT id FROM prompt_guides WHERE slug = 'pinterest-affiliate-marketing-has-changed-forever-with-ai')
);

COMMIT;
