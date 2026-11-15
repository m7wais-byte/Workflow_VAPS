import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = async entry => { const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')); };
const { applyClientUnits, clientUnitFor, presetOf, unitPresets, unitsSummary } = await bundle('app/client-units.ts');
const { defaultFieldData } = await bundle('app/sample-defaults.ts');

test('a new data sheet opens in the client units; a client with no units keeps the standard defaults', () => {
  const sheet = applyClientUnits(defaultFieldData(), unitPresets.Metric);
  assert.equal(sheet.bhpUnit, 'kPa'); assert.equal(sheet.finalPressureUnit, 'kPa'); assert.equal(sheet.whtUnit, '°C');
  assert.equal(sheet.depthUnit, 'm'); assert.equal(sheet.perforationsUnit, 'm MD'); assert.equal(sheet.gasRateUnit, 'Sm³/d'); assert.equal(sheet.gorUnit, 'Sm³/Sm³');
  assert.equal(applyClientUnits(defaultFieldData(), unitPresets.Field).bhtUnit, '°F');
  assert.equal(sheet.chokeSizeUnit, '/64 in', 'quantities without a client unit are unchanged');
  const plain = defaultFieldData(); assert.equal(applyClientUnits(plain, undefined), plain);
});

test('a value already entered keeps the unit it was entered in; N/A counts as empty', () => {
  const sheet = applyClientUnits({ ...defaultFieldData(), bhp: '3150', whp: 'N/A' }, unitPresets.Metric);
  assert.equal(sheet.bhpUnit, 'psi'); assert.equal(sheet.whpUnit, 'kPa');
  assert.equal(applyClientUnits(defaultFieldData(), unitPresets.Field, '2500').depthUnit, 'm', 'a recorded depth keeps its unit');
});

test('presets are recognised and a changed quantity is shown as Custom', () => {
  assert.equal(presetOf(unitPresets.Field), 'Field'); assert.equal(presetOf(undefined), '');
  const mixed = { ...unitPresets.Field, temperature: '°C' };
  assert.equal(presetOf(mixed), 'Custom'); assert.match(unitsSummary(mixed), /Custom · psi, °C, ft/); assert.equal(unitsSummary(), 'Not set');
  assert.equal(clientUnitFor('separatorPressure', mixed), 'psi'); assert.equal(clientUnitFor('chokeSize', mixed), undefined);
});
