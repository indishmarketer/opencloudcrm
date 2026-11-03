import test from "node:test";
import assert from "node:assert/strict";

const { heroLogoWindow, HERO_LOGO_COUNT } = await import("../src/lib/directoryHero.ts");

const tool = (n) => ({ slug: `t${n}`, name: `Tool ${n}`, logo_url: `https://cdn/${n}.png` });
const many = (count) => Array.from({ length: count }, (_, i) => tool(i));

test("heroLogoWindow drops tools without a logo", () => {
  const result = heroLogoWindow([
    tool(1),
    { slug: "no-logo", name: "No Logo", logo_url: null },
    tool(2),
  ]);
  assert.deepEqual(
    result.map((t) => t.slug),
    ["t1", "t2"],
  );
});

test("heroLogoWindow returns everything when there is not enough to rotate", () => {
  const tools = many(HERO_LOGO_COUNT);
  assert.equal(heroLogoWindow(tools).length, HERO_LOGO_COUNT);
  assert.equal(heroLogoWindow(many(3)).length, 3);
});

test("heroLogoWindow always returns exactly the strip length once it can rotate", () => {
  const tools = many(HERO_LOGO_COUNT + 5);
  for (const now of [0, 300_000, 1_234_567_890_000]) {
    assert.equal(heroLogoWindow(tools, 300_000, now).length, HERO_LOGO_COUNT);
  }
});

test("heroLogoWindow is stable inside one bucket and moves on to the next", () => {
  const tools = many(40);
  const a = heroLogoWindow(tools, 300_000, 600_000);
  const sameBucket = heroLogoWindow(tools, 300_000, 600_000 + 299_999);
  const nextBucket = heroLogoWindow(tools, 300_000, 900_000);

  assert.deepEqual(a, sameBucket, "same bucket must render identically, or hydration mismatches");
  assert.notDeepEqual(a, nextBucket, "the next bucket should show a different window");
  // One bucket advances the window by exactly one tool, so the strip walks
  // the whole directory rather than jumping around it.
  assert.equal(a[0].slug, "t2");
  assert.equal(nextBucket[0].slug, "t3");
});

test("heroLogoWindow wraps around the end of the list without gaps", () => {
  const tools = many(HERO_LOGO_COUNT + 1);
  // Offset lands on the last entry, so the window must wrap to the front.
  const window = heroLogoWindow(tools, 1, HERO_LOGO_COUNT);
  assert.equal(window.length, HERO_LOGO_COUNT);
  assert.equal(window[0].slug, `t${HERO_LOGO_COUNT}`);
  assert.equal(window[1].slug, "t0");
  assert.equal(new Set(window.map((t) => t.slug)).size, HERO_LOGO_COUNT, "no repeats in one pass");
});

test("heroLogoWindow returns only the three fields the strip renders", () => {
  // Guards the payload-weight fix: the strip is a prop on a client
  // component, so anything carried along here is serialised into the page.
  const heavy = Array.from({ length: 20 }, (_, i) => ({
    ...tool(i),
    description: "x".repeat(5000),
    screenshots: ["a", "b", "c"],
    website_url: "https://example.com",
  }));
  for (const entry of heroLogoWindow(heavy)) {
    assert.deepEqual(Object.keys(entry).sort(), ["logo_url", "name", "slug"]);
  }
});
