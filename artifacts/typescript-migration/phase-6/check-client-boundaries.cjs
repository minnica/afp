const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = process.cwd();
const files = fs.readdirSync('src', { recursive: true }).filter(name => /\.tsx?$/.test(name)).map(name => path.resolve('src', name));
const roots = files.filter(file => /^\s*["']use client["']/.test(fs.readFileSync(file, 'utf8')));
const visited = new Set(), violations = [];
function resolve(specifier, from) {
  const base = specifier.startsWith('@/') ? path.resolve('src', specifier.slice(2)) : specifier.startsWith('.') ? path.resolve(path.dirname(from), specifier) : null;
  return base && [base, ...['.ts', '.tsx', '/index.ts', '/index.tsx'].map(ext => base + ext)].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
}
function visit(file, trail) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = [];
  function scan(node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyNamedTypes = !clause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.every(item => item.isTypeOnly);
      if (!clause?.isTypeOnly && !onlyNamedTypes) imports.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier) {
      if (!node.exportClause || !ts.isNamedExports(node.exportClause) || node.exportClause.elements.some(item => !item.isTypeOnly)) imports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    ts.forEachChild(node, scan);
  }
  scan(source);
  for (const specifier of imports) {
    if (/^(node:|@prisma\/client$|server-only$)/.test(specifier) || /^@\/lib\/(prisma|apiAuth)$/.test(specifier) || specifier.startsWith('@/app/api/')) violations.push({ trail: [...trail, path.relative(root, file)], specifier });
    const target = resolve(specifier, file);
    if (target) visit(target, [...trail, path.relative(root, file)]);
  }
}
for (const file of roots) visit(file, []);
const result = { clientRoots: roots.length, reachableLocalModules: visited.size, violations };
fs.writeFileSync('artifacts/typescript-migration/phase-6/client-boundaries.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
if (violations.length) process.exitCode = 1;
