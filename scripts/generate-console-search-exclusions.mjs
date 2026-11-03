import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const appRoot = path.join(root, "src", "app", "console");
const output = path.join(root, "public", "console-search-excluded-routes.json");
const excluded = new Set();

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/^page\.(?:tsx?|jsx?)$/.test(entry.name)) inspect(absolute);
  }
}

function inspect(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const redirectNames = new Set();
  let hasJsx = false;
  let callsRedirect = false;

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.getText(sourceFile).replaceAll(/["']/g, "") !== "next/navigation") continue;
    if (!statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
    for (const specifier of statement.importClause.namedBindings.elements) {
      if ((specifier.propertyName || specifier.name).text === "redirect") redirectNames.add(specifier.name.text);
    }
  }

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) hasJsx = true;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && redirectNames.has(node.expression.text)) callsRedirect = true;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  // A route with no rendered JSX that only calls Next's redirect is a legacy
  // alias. Keep it working for old bookmarks, but don't index it as a page.
  if (!callsRedirect || hasJsx) return;
  const relative = path.relative(path.join(root, "src", "app"), filePath).split(path.sep);
  const segments = relative
    .filter((segment) => !/^\([^/]+\)$/.test(segment))
    .filter((segment) => !/^page\.(?:tsx?|jsx?)$/.test(segment));
  if (segments[0] !== "console") return;
  excluded.add(`/${segments.join("/")}`);
}

walk(appRoot);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify([...excluded].sort(), null, 2)}\n`);
