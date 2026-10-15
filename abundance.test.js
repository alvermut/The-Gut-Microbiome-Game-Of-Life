import test from 'node:test';
import assert from 'node:assert/strict';
import {relativeAbundances} from './abundance.js';
test('relative abundance is a fraction, not a percentage',()=>assert.deepEqual(relativeAbundances([120,60,20]),['0.6000','0.3000','0.1000']));
test('display rounding preserves a sum of one',()=>{
  assert.deepEqual(relativeAbundances([1,1,1]),['0.3334','0.3333','0.3333']);
  for(const counts of [[1,2,3,4,5],[99,11,7],[0,1,0,0,0]])assert.equal(relativeAbundances(counts).reduce((s,n)=>s+Math.round(Number(n)*10000),0),10000);
});
test('no sample has no defined relative abundance',()=>assert.deepEqual(relativeAbundances([0,0,0,0,0]),[null,null,null,null,null]));
