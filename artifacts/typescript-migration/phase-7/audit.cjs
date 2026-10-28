// Inspect the final application program and record local assertions for review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const configPath = path.join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
assert.equal(parsed.errors.length, 0);
assert.equal(parsed.options.allowJs, false);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noUncheckedIndexedAccess, true);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const localFiles = program.getSourceFiles().filter(file => file.fileName.startsWith(path.join(root, 'src') + path.sep));
const files = fs.readdirSync(path.join(root, 'src'), { recursive: true }).map(name => path.join(root, 'src', name)).filter(file => fs.statSync(file).isFile());
const js = files.filter(file => /\.jsx?$/.test(file));
const empty = files.filter(file => !fs.statSync(file).size);
const assertions = [], violations = [];
function unwrap(node) { return ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node; }
function isAssertion(node) { return ts.isAsExpression(node) || ts.isTypeAssertionExpression(node); }
for (const source of localFiles) {
  const location = node => ({ file: path.relative(root, source.fileName), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
  function scan(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) violations.push({ ...location(node), kind: 'explicit-any' });
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) violations.push({ ...location(node), kind: 'ambient-module' });
    if (isAssertion(node)) {
      if (isAssertion(unwrap(node.expression))) violations.push({ ...location(node), kind: 'double-assertion' });
      if (node.type.getText(source) !== 'const') assertions.push({ ...location(node), type: node.type.getText(source) });
    }
    ts.forEachChild(node, scan);
  }
  scan(source);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, source.languageVariant, source.text);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if ([ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia].includes(token)
      && /@ts-(?:ignore|nocheck|expect-error)\b/.test(scanner.getTokenText())) violations.push({ file: path.relative(root, source.fileName), kind: 'suppression' });
  }
}
const missing = files.filter(file => /\.tsx?$/.test(file) && !localFiles.some(source => source.fileName === file));
const buildConfiguration = fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8');
assert.doesNotMatch(buildConfiguration, /ignoreBuildErrors/);
const result = { sourceTsFiles: localFiles.length, ownJsFiles: js.map(file => path.relative(root, file)),
  emptyFiles: empty.map(file => path.relative(root, file)), filesOutsideTypeProgram: missing.map(file => path.relative(root, file)),
  options: { allowJs: parsed.options.allowJs, strict: parsed.options.strict, noUncheckedIndexedAccess: parsed.options.noUncheckedIndexedAccess },
  violations, localAssertions: assertions };
fs.writeFileSync(path.join(__dirname, 'audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, localAssertions: assertions.length }));
assert.deepEqual([js, empty, missing, violations], [[], [], [], []]);
