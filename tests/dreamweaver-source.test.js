import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
test('Dreamweaver drawing engine preserves the supplied demo byte for byte',()=>{
 const copied=fs.readFileSync(new URL('../public/dreamweaver-fx.js',import.meta.url));
 assert.equal(createHash('sha256').update(copied).digest('hex'),'9027a719b2fe8d829fbee6fb6b94686225e16cc329622ba1490511cd2d2140cf');
});
