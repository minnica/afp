const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

test('Android only queries the exact eight verified financial sources it accepts', () => {
  const root = resolve(__dirname, '..');
  const policy = readFileSync(resolve(root, 'android/app/src/main/java/com/garatachia/afp/CapturePolicy.kt'), 'utf8');
  const manifest = readFileSync(resolve(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const allowed = [...policy.matchAll(/"([a-z][\w.]+)" to "/g)].map(match => match[1]).sort();
  const visible = [...manifest.matchAll(/<package android:name="([^"]+)"/g)].map(match => match[1]).sort();
  const expected = [
    'com.bancomer.mbanking', 'com.google.android.apps.walletnfcrel', 'mx.hsbc.hsbcmexico',
    'com.citibanamex.banamexmobile', 'mx.bancosantander.supermovil', 'com.nu.production',
    'com.didiglobal.cashloan', 'com.mercadopago.wallet',
  ].sort();
  assert.deepEqual(allowed, expected);
  assert.deepEqual(visible, expected);
  assert.doesNotMatch(manifest, /QUERY_ALL_PACKAGES/);
});
