"""Referencia local; exige AFP_TEST_DATABASE_URL y nunca carga conexiones de .env."""
import os, json, subprocess, time, pathlib, tempfile, shutil, re, hashlib, sys
from urllib.parse import urlparse
ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = pathlib.Path(__file__).resolve().parent
url = os.environ['AFP_TEST_DATABASE_URL']
u = urlparse(url)
assert u.hostname in ('localhost','127.0.0.1') and re.fullmatch('/afp_test[a-zA-Z0-9_]*',u.path) and not u.query and not u.fragment
base = {k:v for k,v in os.environ.items() if k in ('PATH','HOME','USER','LANG','XDG_RUNTIME_DIR')}
base.update(DATABASE_URL=url,DIRECT_URL=url,AFP_TEST_DATABASE_URL=url,AFP_MIGRATION_TEST_DATABASE_URL=url,NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_ANON_KEY='phase0-fictitious',AFP_APP_ORIGIN='http://localhost:3000',NEXT_TELEMETRY_DISABLED='1')
tracked = sorted(set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=ROOT,text=True).splitlines()))
src = [p for p in tracked if p.startswith('src/') and pathlib.Path(p).suffix in ('.js','.jsx','.ts','.tsx')]
tests = [p for p in tracked if p.startswith('tests/') and p.endswith('.cjs')]
records=[]
for name in src:
    text=(ROOT/name).read_text()
    imports=re.findall(r'(?:from\s+|import\s*\()[\"\']([^\"\']+)',text)
    resolved=[]
    for spec in imports:
        stem=ROOT/'src'/spec[2:] if spec.startswith('@/') else (ROOT/name).parent/spec if spec.startswith('.') else None
        if stem:
            for ext in ('','.js','.jsx','.ts','.tsx'):
                p=pathlib.Path(str(stem)+ext).resolve()
                if p.is_file(): resolved.append(str(p.relative_to(ROOT))); break
    records.append(dict(file=name,module='/'.join(pathlib.Path(name).parts[:3]),lines=len(text.splitlines()),empty=not text.strip(),imports=imports,dependencies=resolved,tests=[t for t in tests if name in (ROOT/t).read_text() or any(s in (ROOT/t).read_text() for s in ('@/'+name[4:].rsplit('.',1)[0],))]))
for r in records:
    r['consumers']=[s['file'] for s in records if r['file'] in s['dependencies']]
    if r['file'].startswith('src/app/api/') and r['file'].endswith('/route.js'):
        r['endpoint']='/'+r['file'].removeprefix('src/app/').removesuffix('/route.js')
        r['httpConsumers']=[name for name in src if r['endpoint'] in (ROOT/name).read_text()]
(OUT/'inventory.json').write_text(json.dumps(records,indent=2,ensure_ascii=False)+'\n')
loads=[]
for name in tracked:
    if name.startswith(('tests/','scripts/')) and pathlib.Path(name).suffix in ('.cjs','.mjs','.js'):
        for n,line in enumerate((ROOT/name).read_text().splitlines(),1):
            if re.search(r'sourceLoader|readFileSync|runInContext|runInNewContext|new Function|jsconfig|src/.*\.jsx?',line): loads.append(dict(file=name,line=n,source=line))
(OUT/'source-loading.json').write_text(json.dumps(loads,indent=2,ensure_ascii=False)+'\n')
if '--inventory-only' in sys.argv: raise SystemExit(0)
meta=json.loads((OUT/'execution.json').read_text()) if '--build-only' in sys.argv else {'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'node':subprocess.check_output(['node','--version'],text=True).strip(),'pnpm':subprocess.check_output(['pnpm','--version'],text=True).strip(),'checks':[]}
meta['schemaSha256']=hashlib.sha256((ROOT/'prisma/schema.prisma').read_bytes()).hexdigest()
meta['lockfileSha256']=hashlib.sha256((ROOT/'pnpm-lock.yaml').read_bytes()).hexdigest()
meta['migrationSha256']={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in tracked if name.startswith('prisma/migrations/') and name.endswith('.sql')}
meta['packages']={name:json.loads((ROOT/'node_modules'/name/'package.json').read_text())['version'] for name in ('next','react','prisma','@prisma/client','@prisma/adapter-pg','zod')}
meta['postgres']=subprocess.check_output(['node','-e',"const {PrismaClient}=require('@prisma/client'); const {PrismaPg}=require('@prisma/adapter-pg'); const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.AFP_TEST_DATABASE_URL})}); db.$queryRawUnsafe('SELECT version()').then(rows=>console.log(rows[0].version)).finally(()=>db.$disconnect());"],cwd=ROOT,env=base,text=True).strip()
def run(label,cmd,cwd=ROOT,env=None):
    start=time.monotonic()
    with (OUT/(label+'.log')).open('w') as log:
        p=subprocess.run(cmd,cwd=cwd,env=env or base,stdout=log,stderr=subprocess.STDOUT)
    item={'name':label,'command':cmd,'exitCode':p.returncode,'seconds':round(time.monotonic()-start,3)}
    meta['checks'].append(item); (OUT/'execution.json').write_text(json.dumps(meta,indent=2)+'\n'); print(json.dumps(item),flush=True)
    return p.returncode
if '--build-only' not in sys.argv:
    run('lint',['pnpm','lint'])
    if run('migrate',['pnpm','exec','prisma','migrate','deploy']): raise SystemExit('Local migration failed')
    run('database-verification',['pnpm','db:verify']) # incluye toda la suite con PostgreSQL
    if '--record' in sys.argv:
        run('transfer-record',['node','artifacts/typescript-migration/phase-0/transfers.cjs','--record'])
    run('transfer-reference',['node','artifacts/typescript-migration/phase-0/transfers.cjs'])
with tempfile.TemporaryDirectory(prefix='afp-ts0-build-') as tmp:
    target=pathlib.Path(tmp)
    for name in tracked:
        if name.startswith(('src/','public/','prisma/')) or name in ('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','prisma.config.ts','next.config.mjs','postcss.config.mjs','jsconfig.json','eslint.config.mjs','components.json'):
            dest=target/name; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(ROOT/name,dest)
    # Turbopack rechaza enlaces fuera de la raíz del proyecto. Copia local real;
    # conserva los enlaces internos de pnpm sin modificar dependencias originales.
    subprocess.run(['cp','-a','--reflink=auto',str(ROOT/'node_modules'),str(target/'node_modules')],check=True)
    run('build',['pnpm','build'],target)
meta['finishedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()); (OUT/'execution.json').write_text(json.dumps(meta,indent=2)+'\n')
raise SystemExit(any(x['exitCode'] for x in meta['checks'] if not x.get('supersededBy')))
