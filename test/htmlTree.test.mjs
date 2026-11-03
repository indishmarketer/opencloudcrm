import test from "node:test";
import assert from "node:assert/strict";
import {
  appendChild,
  attrsFor,
  directText,
  duplicateNode,
  insertNode,
  isListable,
  isVoidTag,
  listablePositionOf,
  listableSlots,
  nodeAt,
  nodeLabel,
  nudgeNode,
  removeNode,
  reorderAmongListable,
  samePath,
  serializeHtml,
  setDirectText,
  updateNode,
} from "../src/lib/htmlTree.ts";

/** parseHtml borrows the browser's own parser, so these exercise the pure
 * half -- the serializer and the tree edits -- against trees written out
 * longhand. The round trip through a real parser is verified in a
 * browser instead. */
const el = (tag, attrs = [], children = []) => ({ kind: "element", tag, attrs, children });
const text = (value) => ({ kind: "text", text: value });

test("serializes elements, attributes and text", () => {
  const tree = [el("section", [["class", "band"]], [el("h2", [], [text("Pricing")])])];
  assert.equal(serializeHtml(tree), '<section class="band"><h2>Pricing</h2></section>');
});

test("void elements get no closing tag", () => {
  assert.equal(serializeHtml([el("img", [["src", "/a.png"], ["alt", "A"]])]), '<img src="/a.png" alt="A">');
  assert.equal(serializeHtml([el("br")]), "<br>");
  assert.ok(isVoidTag("INPUT") && isVoidTag("hr") && !isVoidTag("div"));
});

test("a valueless attribute stays valueless rather than becoming empty-string", () => {
  assert.equal(serializeHtml([el("video", [["controls", ""], ["muted", ""]])]), "<video controls muted></video>");
});

test("attribute order is preserved, because reordering churns the author's code", () => {
  const attrs = [["data-z", "1"], ["class", "a"], ["id", "b"]];
  assert.equal(serializeHtml([el("div", attrs)]), '<div data-z="1" class="a" id="b"></div>');
});

test("text and attribute values are escaped", () => {
  assert.equal(serializeHtml([text("5 < 6 & 7 > 2")]), "5 &lt; 6 &amp; 7 &gt; 2");
  assert.equal(serializeHtml([el("a", [["title", 'He said "hi" & left']])]), '<a title="He said &quot;hi&quot; &amp; left"></a>');
});

test("style and script content is NOT escaped, or it would be corrupted", () => {
  // A CSS child selector and a JS comparison both contain ">" legally.
  assert.equal(serializeHtml([el("style", [], [text(".a > .b { color: red }")])]), "<style>.a > .b { color: red }</style>");
  assert.equal(serializeHtml([el("script", [], [text("if (a < b && c) go();")])]), "<script>if (a < b && c) go();</script>");
});

test("whitespace between elements survives verbatim", () => {
  // It is the space between two inline spans: reindenting or dropping it
  // would change what the visitor sees.
  const tree = [el("p", [], [el("span", [], [text("a")]), text(" "), el("span", [], [text("b")])])];
  assert.equal(serializeHtml(tree), "<p><span>a</span> <span>b</span></p>");
  const pretty = [el("div", [], [text("\n  "), el("h2", [], [text("Hi")]), text("\n")])];
  assert.equal(serializeHtml(pretty), "<div>\n  <h2>Hi</h2>\n</div>");
});

test("comments round-trip", () => {
  assert.equal(serializeHtml([{ kind: "comment", text: " keep me " }]), "<!-- keep me -->");
});

test("nodeAt walks a path, counting text nodes so paths match the live DOM", () => {
  const tree = [el("div", [], [text("\n  "), el("h2", [], [text("Hi")]), text("\n")])];
  assert.equal(nodeAt(tree, [0]).tag, "div");
  // Index 1, not 0: the whitespace text node is a real child.
  assert.equal(nodeAt(tree, [0, 1]).tag, "h2");
  assert.equal(nodeAt(tree, [0, 1, 0]).text, "Hi");
  assert.equal(nodeAt(tree, [0, 9]), null);
  assert.equal(nodeAt(tree, [0, 0, 0]), null, "a text node has no children");
});

test("updateNode changes attributes without touching the rest of the tree", () => {
  const tree = [el("a", [["href", "/old"]], [text("Go")]), el("p", [], [text("keep")])];
  const next = updateNode(tree, [0], { attrs: [["href", "/new"], ["class", "cta"]] });
  assert.equal(serializeHtml(next), '<a href="/new" class="cta">Go</a><p>keep</p>');
  // The original is untouched: the tree is React state, so an in-place
  // mutation would be an edit nothing re-rendered for.
  assert.equal(serializeHtml(tree), '<a href="/old">Go</a><p>keep</p>');
});

test("updateNode retypes a text node", () => {
  const tree = [el("h2", [], [text("Old")])];
  assert.equal(serializeHtml(updateNode(tree, [0, 0], { text: "New" })), "<h2>New</h2>");
});

test("removeNode deletes one node and leaves its siblings", () => {
  const tree = [el("h2"), el("p"), el("a")];
  assert.equal(serializeHtml(removeNode(tree, [1])), "<h2></h2><a></a>");
  assert.equal(serializeHtml(removeNode(tree, [7])), serializeHtml(tree), "a bad path is a no-op");
});

test("duplicateNode inserts a deep copy right after the original", () => {
  const tree = [el("ul", [], [el("li", [["class", "x"]], [text("one")])])];
  const next = duplicateNode(tree, [0, 0]);
  assert.equal(serializeHtml(next), '<ul><li class="x">one</li><li class="x">one</li></ul>');
  // Deep, not shared: editing the copy must not change the original.
  const edited = updateNode(next, [0, 1, 0], { text: "two" });
  assert.equal(serializeHtml(edited), '<ul><li class="x">one</li><li class="x">two</li></ul>');
});

test("a duplicate brings its indentation along, so the source stays readable", () => {
  const tree = [el("ul", [], [text("\n  "), el("li", [], [text("one")]), text("\n")])];
  assert.equal(serializeHtml(duplicateNode(tree, [0, 1])), "<ul>\n  <li>one</li>\n  <li>one</li>\n</ul>");
  // Three in a row still reads as three lines, not one long one.
  let next = duplicateNode(tree, [0, 1]);
  next = duplicateNode(next, [0, 3]);
  assert.equal(serializeHtml(next), "<ul>\n  <li>one</li>\n  <li>one</li>\n  <li>one</li>\n</ul>");
  // With no indentation to copy, it is still just the node.
  const tight = [el("ul", [], [el("li", [], [text("x")])])];
  assert.equal(serializeHtml(duplicateNode(tight, [0, 0])), "<ul><li>x</li><li>x</li></ul>");
});

test("insertNode and appendChild put a new element in place", () => {
  const tree = [el("h2"), el("p")];
  assert.equal(serializeHtml(insertNode(tree, [1], el("img", [["src", "/a.png"]]))), '<h2></h2><img src="/a.png"><p></p>');
  assert.equal(serializeHtml(appendChild(tree, [0], text("Title"))), "<h2>Title</h2><p></p>");
  assert.equal(serializeHtml(appendChild(tree, [], el("a"))), "<h2></h2><p></p><a></a>");
  // A void element can never take children.
  const withImg = [el("img")];
  assert.equal(serializeHtml(appendChild(withImg, [0], text("x"))), "<img>");
});

test("directText reads an element that holds only text, and nothing else", () => {
  assert.equal(directText(el("h2", [], [text("Hi")])), "Hi");
  assert.equal(directText(el("h2", [], [text("a"), text("b")])), "ab");
  assert.equal(directText(el("h2")), "");
  assert.equal(directText(text("plain")), "plain");
  // Mixed content can't be represented by one field without throwing the
  // elements away, so the inspector must not offer one.
  assert.equal(directText(el("p", [], [text("a"), el("em", [], [text("b")])])), null);
});

test("setDirectText replaces the children, and empties cleanly", () => {
  assert.equal(serializeHtml([setDirectText(el("h2", [], [text("Old")]), "New")]), "<h2>New</h2>");
  assert.equal(serializeHtml([setDirectText(el("h2", [], [text("Old")]), "")]), "<h2></h2>");
  assert.equal(serializeHtml([setDirectText(text("old"), "new")]), "new");
});

test("nodeLabel reads like a browser's element picker", () => {
  assert.equal(nodeLabel(el("section", [["class", "hero band"]])), "section.hero");
  assert.equal(nodeLabel(el("a", [["id", "cta"], ["class", "btn"]])), "a#cta", "id wins over class");
  assert.equal(nodeLabel(el("div")), "div");
  assert.equal(nodeLabel(el("div", [["class", "   "]])), "div", "blank class is not a label");
  assert.equal(nodeLabel(text("x")), "text");
  assert.equal(nodeLabel({ kind: "comment", text: "x" }), "comment");
});

test("whitespace-only text is kept in the data but not listed in the tree", () => {
  assert.equal(isListable(text("\n   ")), false);
  assert.equal(isListable(text("Real copy")), true);
  assert.equal(isListable(el("div")), true);
});

test("samePath compares paths by value", () => {
  assert.ok(samePath([0, 1, 2], [0, 1, 2]));
  assert.ok(!samePath([0, 1], [0, 1, 2]));
  assert.ok(!samePath([0, 1], [0, 2]));
  assert.ok(!samePath(null, [0]));
  assert.ok(!samePath([0], null));
});

test("attrsFor offers the attributes that are the point of the tag", () => {
  assert.ok(attrsFor("img").includes("src") && attrsFor("img").includes("alt"));
  assert.ok(attrsFor("a").includes("href"));
  assert.ok(attrsFor("IMG").includes("src"), "case-insensitive");
  assert.deepEqual(attrsFor("section"), ["class", "id", "style"]);
});

test("a realistic section survives a full edit sequence", () => {
  const tree = [
    el("section", [["class", "hero"]], [
      text("\n  "),
      el("h1", [], [text("Make your work work smarter.")]),
      text("\n  "),
      el("p", [["class", "lead"]], [text("A clearer way to build.")]),
      text("\n  "),
      el("img", [["src", "/a.webp"], ["alt", "Old"]]),
      text("\n"),
    ]),
  ];
  let next = updateNode(tree, [0, 1, 0], { text: "Work smarter." });
  next = updateNode(next, [0, 5], { attrs: [["src", "/b.webp"], ["alt", "New"]] });
  // Move the image up past the paragraph. Only the visible children swap
  // slots, so every newline-and-two-spaces stays exactly where it was.
  next = nudgeNode(next, [0, 5], -1);
  next = duplicateNode(next, [0, 5]);
  const html = serializeHtml(next);
  assert.ok(html.includes("<h1>Work smarter.</h1>"));
  assert.ok(html.includes(String.raw`<img src="/b.webp" alt="New">`));
  assert.ok(html.indexOf("<img") < html.indexOf(String.raw`<p class="lead"`), "image moved above the paragraph");
  assert.equal(html.match(/<p class="lead">/g).length, 2, "paragraph duplicated");
  // Byte-exact: the indentation scaffold is untouched by any of it.
  assert.equal(
    html,
    String.raw`<section class="hero">`+"\n  "+String.raw`<h1>Work smarter.</h1>`+"\n  "+
      String.raw`<img src="/b.webp" alt="New">`+"\n  "+String.raw`<p class="lead">A clearer way to build.</p>`+"\n  "+
      String.raw`<p class="lead">A clearer way to build.</p>`+"\n"+String.raw`</section>`
  );
});

// A literal newline, spelled without a backslash escape so the
// indentation in these fixtures is unmistakable when reading them.
const NL = String.fromCharCode(10);
const indent = NL + "  ";

test("the arrows move an element past the next visible one, leaving indentation alone", () => {
  // Indented HTML has a newline-and-spaces text node between every pair
  // of elements. Moving the element itself through the raw child list
  // would drag it away from its indentation and clump the leftovers; the
  // visible children are permuted among their existing slots instead.
  const tree = [
    el("div", [], [text(indent), el("h2", [], [text("A")]), text(indent), el("p", [], [text("B")]), text(indent), el("a", [], [text("C")]), text(NL)]),
  ];
  const swapped = "<div>" + indent + "<p>B</p>" + indent + "<h2>A</h2>" + indent + "<a>C</a>" + NL + "</div>";
  assert.equal(serializeHtml(nudgeNode(tree, [0, 3], -1)), swapped);
  assert.equal(serializeHtml(nudgeNode(tree, [0, 1], 1)), swapped, "the same move, driven from the other side");
});

test("repeated moves never degrade the formatting", () => {
  const tree = [
    el("div", [], [text(indent), el("h2", [], [text("A")]), text(indent), el("p", [], [text("B")]), text(indent), el("a", [], [text("C")]), text(NL)]),
  ];
  const source = serializeHtml(tree);
  // Down then back up returns the exact original bytes, which is the
  // property that stops the source rotting as someone nudges things.
  let next = nudgeNode(tree, [0, 1], 1);
  assert.equal(serializeHtml(nudgeNode(next, [0, 3], -1)), source);
  // A full three-step cycle also comes home.
  let cycle = nudgeNode(tree, [0, 1], 1);
  cycle = nudgeNode(cycle, [0, 3], 1);
  cycle = nudgeNode(cycle, [0, 5], -1);
  cycle = nudgeNode(cycle, [0, 3], -1);
  assert.equal(serializeHtml(cycle), source);
});

test("a nudge at either visible end is a no-op, even with whitespace beyond it", () => {
  const tree = [el("div", [], [text(indent), el("h2"), text(indent), el("p"), text(NL)])];
  // h2 is the first *visible* child though its raw index is 1, and p is
  // the last though a text node follows it.
  assert.equal(serializeHtml(nudgeNode(tree, [0, 1], -1)), serializeHtml(tree));
  assert.equal(serializeHtml(nudgeNode(tree, [0, 3], 1)), serializeHtml(tree));
});

test("listableSlots and listablePositionOf describe the visible children", () => {
  const children = [text(NL), el("h2"), text(NL), el("p"), text(NL)];
  const tree = [el("div", [], children)];
  assert.deepEqual(listableSlots(tree, [0]), [1, 3]);
  assert.equal(listablePositionOf(tree, [0, 1]), 0);
  assert.equal(listablePositionOf(tree, [0, 3]), 1);
  assert.deepEqual(listableSlots(tree, []), [0]);
});

test("a drag drop to an arbitrary position also preserves the scaffold", () => {
  const item = (n) => el("li", [], [text(n)]);
  const tree = [el("ul", [], [text(indent), item("1"), text(indent), item("2"), text(indent), item("3"), text(NL)])];
  const expect = (a, b, c) =>
    "<ul>" + indent + `<li>${a}</li>` + indent + `<li>${b}</li>` + indent + `<li>${c}</li>` + NL + "</ul>";
  // First item dropped last, and each <li> still sits on its own
  // indented line.
  assert.equal(serializeHtml(reorderAmongListable(tree, [0, 1], 2)), expect("2", "3", "1"));
  assert.equal(serializeHtml(reorderAmongListable(tree, [0, 5], 0)), expect("3", "1", "2"));
  // Out-of-range and no-move targets change nothing.
  assert.equal(serializeHtml(reorderAmongListable(tree, [0, 1], 0)), serializeHtml(tree));
  assert.equal(serializeHtml(reorderAmongListable(tree, [0, 1], 9)), serializeHtml(tree));
  assert.equal(serializeHtml(reorderAmongListable(tree, [0, 1], -1)), serializeHtml(tree));
});

test("nudging at the top level works the same way", () => {
  const tree = [el("section", [["class", "a"]]), text(NL), el("section", [["class", "b"]])];
  assert.equal(serializeHtml(nudgeNode(tree, [2], -1)), `<section class="b"></section>` + NL + `<section class="a"></section>`);
});
