import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { array, record } from './dynamic-values';

// Auditoría reproducible de la migración. También pertenece al programa
// estricto de pruebas; no se descubre ni ejecuta como escenario de node:test.
const root = path.resolve(__dirname, '../..');
const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');

function configuration(name: string) {
  const filename = path.join(root, name);
  const config = ts.readConfigFile(filename, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.options.allowJs, false);
  assert.equal(parsed.options.strict, true);
  assert.equal(parsed.options.noUncheckedIndexedAccess, true);
  assert.equal(parsed.options.noEmit, true);
  return parsed;
}

export async function auditMigration() {
  const config = configuration('tsconfig.tests.json');
  const negativeConfig = configuration('tsconfig.type-tests.json');
  const program = ts.createProgram(config.fileNames, config.options);
  const included = new Set(program.getSourceFiles().map(source => relative(source.fileName)));
  const negatives = new Set(negativeConfig.fileNames.map(relative).filter(file => file.startsWith('tests/types/')));
  const files = ts.sys.readDirectory(path.join(root, 'tests'), ['.ts', '.tsx', '.cts', '.mts', '.js', '.jsx', '.cjs', '.mjs']).map(relative).sort();
  const javascript = files.filter(file => /\.(?:cjs|mjs|js|jsx)$/.test(file));
  assert.deepEqual(javascript, [], 'No deben quedar pruebas ni helpers JavaScript activos');
  const missing = files.filter(file => !included.has(file) && !negatives.has(file));
  assert.deepEqual(missing, [], 'Todos los módulos de pruebas deben comprobarse');
  assert.ok([...negatives].every(file => !included.has(file)), 'Los casos negativos tienen un programa separado');
  const declarations = ts.sys.readDirectory(path.join(root, 'scripts'), ['.cts']).map(relative).filter(file => file.endsWith('.d.cts')).sort();
  assert.equal(declarations.length, 3);
  assert.ok(declarations.every(file => included.has(file)));

  const original: unknown = JSON.parse(readFileSync(path.join(root, 'artifacts/typescript-tests-migration/phase-0/reference/inventory.json'), 'utf8'));
  const resolutions = array(record(original).files).map(record).filter(row => typeof row.file === 'string' && row.file.endsWith('.cjs')).map(row => {
    assert.equal(typeof row.file, 'string');
    if (typeof row.file !== 'string') throw new Error('Inventario sin ruta');
    const target = row.file.replace(/\.cjs$/, '.ts');
    assert.ok(files.includes(target) && included.has(target), `Falta el módulo convertido: ${target}`);
    const sha256 = createHash('sha256').update(readFileSync(path.join(root, target))).digest('hex');
    return { original: row.file, target, resolution: 'converted', sha256 };
  });
  assert.equal(resolutions.length, 117);

  const eslint = new ESLint({ cwd: root });
  const linted = [];
  for (const file of [...files, ...declarations]) {
    assert.equal(await eslint.isPathIgnored(path.join(root, file)), false, file);
    const lintConfig: unknown = await eslint.calculateConfigForFile(path.join(root, file));
    const rules = record(record(lintConfig).rules);
    for (const rule of ['@typescript-eslint/no-explicit-any', '@typescript-eslint/no-unsafe-assignment', '@typescript-eslint/no-unsafe-call', '@typescript-eslint/no-unsafe-return', '@typescript-eslint/no-unsafe-member-access', '@typescript-eslint/no-unsafe-argument', 'no-restricted-syntax', '@typescript-eslint/ban-ts-comment']) {
      const setting = rules[rule];
      const severity: unknown = Array.isArray(setting) ? setting[0] : setting;
      assert.ok(severity === 2 || severity === 'error', `${file}: falta ${rule}`);
    }
    linted.push(file);
  }

  const assertions: { file: string; line: number; target: string; expression: string }[] = [];
  const violations: { file: string; line: number; reason: string }[] = [];
  const negativeComments: { file: string; line: number; text: string }[] = [];
  const sourceModules: { route: string; source: string }[] = [];
  const audited = [...files, ...declarations, ...ts.sys.readDirectory(path.join(root, 'types'), ['.ts']).map(relative)];
  for (const file of audited) {
    const source = ts.createSourceFile(file, readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
    const line = (offset: number) => source.getLineAndCharacterOfPosition(offset).line + 1;
    const fail = (node: ts.Node, reason: string) => violations.push({ file, line: line(node.getStart(source)), reason });
    function visit(node: ts.Node) {
      if (node.kind === ts.SyntaxKind.AnyKeyword) fail(node, 'any explícito');
      if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name) && node.name.text.includes('*')) fail(node, 'declaración comodín');
      if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
        assertions.push({ file, line: line(node.getStart(source)), target: node.type.getText(source), expression: node.expression.getText(source) });
        let expression = node.expression;
        while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
        if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) fail(node, 'conversión doble');
      }
      if (file === 'tests/helpers/source-contracts.ts' && ts.isInterfaceDeclaration(node) && node.name.text === 'SourceModules') {
        for (const member of node.members) {
          assert.ok(ts.isPropertySignature(member) && member.type && ts.isStringLiteral(member.name));
          assert.ok(ts.isImportTypeNode(member.type) && member.type.isTypeOf && ts.isLiteralTypeNode(member.type.argument) && ts.isStringLiteral(member.type.argument.literal), 'Contrato público sin typeof import real');
          sourceModules.push({ route: member.name.text, source: member.type.argument.literal.text });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    // Escanear comentarios reales: las cadenas de fixtures no son supresiones.
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source.text);
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
      const text = scanner.getTokenText();
      const location = { file, line: line(scanner.getTokenPos()) };
      if (/eslint-(?:disable|enable)/.test(text)) violations.push({ ...location, reason: 'supresión ESLint' });
      if (!/@ts-(?:ignore|nocheck|expect-error)/.test(text)) continue;
      if (negatives.has(file) && /@ts-expect-error\s+\S.{9,}/.test(text) && !/@ts-(?:ignore|nocheck)/.test(text)) negativeComments.push({ ...location, text });
      else violations.push({ ...location, reason: 'supresión TypeScript fuera de contratos negativos explicados' });
    }
  }
  assert.deepEqual(violations, []);
  assert.ok(sourceModules.length > 0);
  return {
    configurations: { allowJs: config.options.allowJs, strict: config.options.strict, noUncheckedIndexedAccess: config.options.noUncheckedIndexedAccess, noEmit: config.options.noEmit },
    originalFiles: resolutions,
    inclusion: { active: files.filter(file => included.has(file)), negativeContracts: [...negatives].sort(), scriptDeclarations: declarations, javascript, missing, eslint: linted },
    sourceModules, assertions, negativeComments, violations,
  };
}

if (require.main === module) {
  const destination = process.argv[2];
  assert.ok(destination, 'Uso: node --import tsx tests/helpers/migration-audit.ts ARCHIVO_NUEVO.json');
  void auditMigration().then(result => {
    writeFileSync(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(`${result.originalFiles.length} originales resueltos; ${result.inclusion.active.length} módulos activos comprobados; ${result.assertions.length} conversiones inventariadas.`);
  }).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
