import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCaseRequest} from '../lib/owner-journey.ts';
const value={school_id:'00000000-0000-4000-8000-000000000011',id:'00000000-0000-4000-8000-000000000081',revision:0,case:{version:1,topic:'packages',blocker:'how_to',assistance:'together',resolution:'pending',status:'open',minutes:10,follow_up:null}};
test('bounded structured support case accepts valid input',()=>assert.deepEqual(parseCaseRequest(value),value));
test('arbitrary data, spoofed actor, invalid times/dates and impossible status are rejected',()=>{
 for(const v of [null,[],{...value,school_id:'bad'},{...value,actor:'owner'},{...value,revision:-1},...[{email:'private'},{minutes:1.5},{minutes:-1},{minutes:481},{follow_up:'2026-02-30'},{follow_up:'2099-01-01'},{topic:'toString'},{assistance:'self'},{status:'resolved'},{resolution:'explained'},{version:2}].map(c=>({...value,case:{...value.case,...c}}))])assert.equal(parseCaseRequest(v),null,JSON.stringify(v));
});
