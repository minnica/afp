const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { sourceLoader } = require('./helpers/load-source.ts');

test('Android and API accept the same eleven exact sources, including three services in review', () => {
  const root = resolve(__dirname, '..');
  const policy = readFileSync(resolve(root, 'android/app/src/main/java/com/garatachia/afp/CapturePolicy.kt'), 'utf8');
  const manifest = readFileSync(resolve(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const allowed = [...policy.matchAll(/"([a-z][\w.]+)" to "/g)].map(match => match[1]).sort();
  const visible = [...manifest.matchAll(/<package android:name="([^"]+)"/g)].map(match => match[1]).sort();
  const expected = [
    'com.bancomer.mbanking', 'com.google.android.apps.walletnfcrel', 'mx.hsbc.hsbcmexico',
    'com.citibanamex.banamexmobile', 'mx.bancosantander.supermovil', 'com.nu.production',
    'com.didiglobal.cashloan', 'com.mercadopago.wallet',
    'com.ubercab', 'com.didiglobal.passenger', 'com.ubercab.eats',
  ].sort();
  assert.deepEqual(allowed, expected);
  assert.deepEqual(visible, expected);
  const load = sourceLoader({ 'next/server': { NextResponse: {} } });
  assert.deepEqual(Array.from(load('src/lib/captureProtocol.ts').capturePackages).sort(), expected);
  assert.doesNotMatch(manifest, /QUERY_ALL_PACKAGES/);
});
