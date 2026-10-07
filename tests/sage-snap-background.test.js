import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
// Recorded from the supplied sage_equation_mock.html, so CI needs no prototype files.
const REFERENCE_ROUTINES=[
  [
    "const SNAP_CONFIG=",
    "ea57496e0fa39b0f0a1197149f40258139923b322b868d5ca3904c48b924a077"
  ],
  [
    "const clamp=",
    "7a0e1d4adf5dfd75e7b33d85fda99054db6bc2cd31c4013b7bc9b5a213eecd15"
  ],
  [
    "let seed=",
    "b55216ed8cef641e4c45ed2022674b7bc40c0ce7e9363bd98165d86a5b88fdce"
  ],
  [
    "const ambient=",
    "2bcf2dffe87c9f4e525f052323d60b2de716ca0085e0a451fdb054723f8f9ccb"
  ],
  [
    "const curves=",
    "7c332f396d6e89d0552da0f2dbdf1eccf48d61500c741811941b4df486f908f6"
  ],
  [
    "const kinds=",
    "3922b872677f3b171501095243dd93709a08510457f3f688a7cf0a75a083914e"
  ],
  [
    "const sparks=",
    "d863b5222e711156263354ab0090cf200bd0daac56d4e81932e8221ae84be1e2"
  ],
  [
    "function prepareContext",
    "f9698cff6c822ae39c37f514265cf43ad48b05dd40b7cb1399ebb76644da1b55"
  ],
  [
    "function pathRange",
    "93a0392ba28256a893a179c7d815363aea95652ee143925fdd6e4e562cc6e53a"
  ],
  [
    "function drawCurves",
    "d4274b9e76ba1ade7d066e48e2e0c63071ada1252c92386deb484c873273d918"
  ],
  [
    "function drawBurst",
    "27c8d6a7438239f61cc4fe8676cd3bef087803096847374f4a04ae25ee3be602"
  ]
];
test('Sage backfx and frontfx routines retain the supplied original source',()=>{
  const production=fs.readFileSync(new URL('../public/sage-snap-background.js',import.meta.url),'utf8');
  for(const [prefix,digest] of REFERENCE_ROUTINES){
    const line=production.split(/\r?\n/).find(line=>line.startsWith(prefix));assert(line);
    assert.equal(createHash('sha256').update(line).digest('hex'),digest,prefix+' must remain unchanged');
  }
  assert(production.includes("goldWash.style.opacity=(dt>=0?Math.exp(-dt*5.5)*.85:0).toFixed(3)"));
});
