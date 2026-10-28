// Índice estático de la referencia; las expansiones reales están en scenarios.json.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const ownDirectory = 'artifacts/typescript-tests-migration/phase-0/';
const output = process.argv[2];
if (!output) throw new Error('Uso: node inventory.cjs DIRECTORIO_NUEVO');
fs.mkdirSync(output, { recursive: true });
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const isLiteral = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));

function resolve(from, specifier) {
  const stem = specifier.startsWith('@/') ? `src/${specifier.slice(2)}`
    : specifier.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))
      : /^(src|tests|scripts|public|android|artifacts)\//.test(specifier) ? specifier : null;
  if (!stem) return [];
  const candidates = path.extname(stem) ? [stem] : [stem, ...['.ts', '.tsx', '.cjs', '.mjs', '.js', '.jsx', '.json'].flatMap(ext => [stem + ext, `${stem}/index${ext}`])];
  return candidates.filter(name => tracked.includes(name));
}

const files = tracked.filter(name => /^tests\/.*\.(cjs|tsx?)$/.test(name));
const records = files.map(file => {
  const text = read(file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const position = node => {
    const at = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { line: at.line + 1, column: at.character + 1 };
  };
  const declarations = [], imports = [], loads = [], pathReferences = [], sourceReads = [], controls = [];
  function visit(node, parents = []) {
    let childrenParents = parents;
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source), first = node.arguments[0];
      const testCall = /^(test(?:\.(?:skip|only|todo))?|t\.test)$/.test(callee);
      if (testCall) {
        const entry = { ...position(node), callee, title: isLiteral(first) ? first.text : null,
          runtimeColumn: position(ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression).column,
          titleExpression: first?.getText(source) ?? null, parents,
          options: node.arguments.find(ts.isObjectLiteralExpression)?.getText(source) ?? null };
        declarations.push(entry);
        childrenParents = [...parents, entry.line];
      }
      if (callee === 'require' || node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        imports.push({ ...position(node), kind: callee, specifier: isLiteral(first) ? first.text : null,
          expression: first?.getText(source) ?? null, resolved: isLiteral(first) ? resolve(file, first.text) : [] });
      }
      if (/(?:^|\.)(?:load|loadRoute|routeContext|sourceLoader|resolveSource|buildBrowserModule)$/.test(callee) || callee.startsWith('sourceLoader(')) {
        loads.push({ ...position(node), callee, argument: first?.getText(source) ?? null,
          dynamic: !isLiteral(first), resolved: isLiteral(first) ? resolve(file, first.text) : [],
          exposed: node.arguments[1]?.getText(source) ?? null });
      }
      if (/(?:^|\.)(?:readFileSync|readFile|readdirSync|runInContext|runInNewContext|spawnSync|spawn)$/.test(callee)) {
        sourceReads.push({ ...position(node), callee, arguments: node.arguments.map(arg => arg.getText(source)) });
      }
      if (/(?:^|\.)(?:skip|todo|only)$/.test(callee)) controls.push({ ...position(node), expression: node.getText(source) });
    }
    if (ts.isImportDeclaration(node) && isLiteral(node.moduleSpecifier)) imports.push({
      ...position(node), kind: node.importClause?.isTypeOnly ? 'import type' : 'import',
      specifier: node.moduleSpecifier.text, resolved: resolve(file, node.moduleSpecifier.text),
    });
    if ((isLiteral(node) || ts.isTemplateExpression(node)) && /(?:src\/|@\/|fixtures\/|scripts\/|public\/|android\/|artifacts\/)/.test(node.getText(source))) {
      pathReferences.push({ ...position(node), expression: node.getText(source), dynamic: !isLiteral(node), resolved: isLiteral(node) ? resolve(file, node.text) : [] });
    }
    ts.forEachChild(node, child => visit(child, childrenParents));
  }
  visit(source);
  const role = file.startsWith('tests/types/') ? 'static-contract' : file.includes('/helpers/') ? 'helper' : 'runtime-test';
  const facets = [];
  if (role === 'runtime-test') facets.push(file === 'tests/android-sources.test.cjs' ? 'source-inspection' : 'behavior');
  if (text.includes('AFP_TEST_DATABASE_URL')) facets.push('postgresql');
  if (sourceReads.some(item => /readFile|readdir/.test(item.callee))) facets.push('source-read');
  if (text.includes("require('node:vm')") || text.includes('require("node:vm")')) facets.push('vm');
  if (imports.some(item => item.resolved.some(name => name.startsWith('scripts/')))) facets.push('script-contract');
  if (file === 'tests/source-loader.test.cjs') facets.push('js-jsx-ts-tsx-compatibility');
  if (role === 'static-contract') facets.push('compile-only');
  return { file, role, facets, lines: text.split('\n').length - Number(text.endsWith('\n')), sha256: hash(file),
    usesSourceLoader: /\bsourceLoader\b/.test(text), usesRouteContext: /legacy-route-context/.test(text),
    declarations, imports, loads, pathReferences, sourceReads, controls,
    negativeContracts: text.split('\n').flatMap((line, index) => line.includes('@ts-expect-error') ? [{ line: index + 1, source: line.trim() }] : []) };
});
for (const record of records) record.importedBy = records.filter(other => other.imports.some(item => item.resolved.includes(record.file))).map(other => other.file);

const consumers = [];
for (const file of tracked.filter(name => !name.startsWith(ownDirectory) && !name.startsWith('tests/') && /\.(?:md|cjs|mjs|js|py|sh|json)$/.test(name))) {
  // Logs y JSON son evidencia; no se confunden con ejecutores/órdenes vigentes.
  if (file.endsWith('.json') && file !== 'package.json') continue;
  for (const [index, line] of read(file).split('\n').entries()) {
    if (/tests\/helpers|tests\/[^\s`'"()]+\.test\.|tests\/\*|node --test|pnpm (?:test|db:verify)|phase-0\/transfers\.cjs|\.test\.cjs|browser-server\.cjs/.test(line)) {
      consumers.push({ file, line: index + 1, source: line.trim(),
        kind: file.endsWith('.md') ? 'documentation' : file.startsWith('artifacts/') ? 'artifact-executor' : 'active-tool',
        helperTargets: records.filter(item => item.role === 'helper' && (line.includes(item.file) || line.includes(path.basename(item.file)))).map(item => item.file),
        lastChangedCommit: execFileSync('git', ['log', '-1', '--format=%H', '--', file], { cwd: root, encoding: 'utf8' }).trim() });
    }
  }
}
const manifest = JSON.parse(read('package.json'));
const loaderSource = ts.createSourceFile('load-source.cjs', read('tests/helpers/load-source.cjs'), ts.ScriptTarget.Latest, true);
let loaderAllowlist = [];
function readAllowlist(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(loaderSource) === 'allowedPackages'
      && node.initializer && ts.isNewExpression(node.initializer) && node.initializer.arguments?.[0]
      && ts.isArrayLiteralExpression(node.initializer.arguments[0])) {
    loaderAllowlist = node.initializer.arguments[0].elements.filter(isLiteral).map(item => item.text);
  }
  ts.forEachChild(node, readAllowlist);
}
readAllowlist(loaderSource);
const packageSpecifier = specifier => specifier?.includes('/node_modules/') ? specifier.split('/node_modules/')[1] : specifier;
const packageNames = [...new Set([...loaderAllowlist, ...records.flatMap(record => record.imports.map(item => packageSpecifier(item.specifier)).filter(Boolean))]
  .filter(specifier => !specifier.startsWith('.') && !specifier.startsWith('@/') && !specifier.startsWith('node:'))
  .map(specifier => specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]))].sort();
const packages = packageNames.map(name => ({ name, declared: manifest.dependencies?.[name] ?? manifest.devDependencies?.[name] ?? null,
  installed: JSON.parse(read(`node_modules/${name}/package.json`)).version,
  consumers: records.filter(record => record.imports.some(item => packageSpecifier(item.specifier) === name || packageSpecifier(item.specifier)?.startsWith(name + '/'))).map(record => record.file),
  allowedBySourceLoader: loaderAllowlist.some(specifier => specifier === name || specifier.startsWith(name + '/')) }));
const fixtures = tracked.filter(name => name.startsWith('tests/fixtures/')).map(file => ({ file, sha256: hash(file),
  consumers: records.filter(record => [...record.imports, ...record.pathReferences].some(item => item.resolved.includes(file))).map(record => record.file) }));
save('inventory.json', {
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  method: 'AST TypeScript sin ejecutar módulos; referencias dinámicas conservan expresión y línea. El manifiesto runtime identifica las expansiones y subtests; el índice estático no demuestra cobertura.',
  counts: { runtimeFiles: records.filter(item => item.role === 'runtime-test').length, helpers: records.filter(item => item.role === 'helper').length,
    cjsLines: records.filter(item => item.file.endsWith('.cjs')).reduce((total, item) => total + item.lines, 0),
    staticContracts: records.filter(item => item.role === 'static-contract').length,
    fixtures: fixtures.length, declarations: records.reduce((total, item) => total + item.declarations.length, 0),
    sourceLoaderTests: records.filter(item => item.role === 'runtime-test' && item.usesSourceLoader).length,
    routeContextTests: records.filter(item => item.role === 'runtime-test' && item.usesRouteContext).length,
    postgresqlFiles: records.filter(item => item.role === 'runtime-test' && item.facets.includes('postgresql')).length },
  commands: manifest.scripts, declaredDependencies: manifest.dependencies, declaredDevDependencies: manifest.devDependencies,
  packageManager: manifest.packageManager, loaderAllowlist, packages, fixtures, files: records,
});
save('consumers.json', consumers);

const protectedFiles = {}, historicalArtifacts = {}, mutableConfiguration = {};
const configurations = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.type-tests.json', 'eslint.config.mjs', 'next.config.mjs', 'postcss.config.mjs', 'components.json', 'prisma.config.ts', 'scripts/verify-database-reproduction.cjs'];
for (const file of tracked) {
  if (file.startsWith('src/') || file.startsWith('types/') || file === 'prisma/schema.prisma' || file.startsWith('prisma/migrations/') || file === 'public/sw.js' || file.startsWith('tests/fixtures/') || file.startsWith('android/') && /\.(kt|kts|xml)$/.test(file)) protectedFiles[file] = hash(file);
  if (file.startsWith('artifacts/') && !file.startsWith('artifacts/typescript-tests-migration/')) historicalArtifacts[file] = hash(file);
  if (configurations.includes(file)) mutableConfiguration[file] = hash(file);
}
save('hashes.json', { algorithm: 'sha256', protectedFiles, historicalArtifacts, mutableConfiguration,
  policy: 'Fase 0 conserva todos los hashes. En fases posteriores solo dependencias/configuración y ejecutores expresamente inventariados pueden cambiar; conservar logs, snapshots y fixtures históricos. Las pruebas/helpers se convierten manteniendo escenarios.' });
console.log(JSON.stringify({ files: records.length, fixtures: fixtures.length, consumers: consumers.length, protectedFiles: Object.keys(protectedFiles).length, historicalArtifacts: Object.keys(historicalArtifacts).length }));
