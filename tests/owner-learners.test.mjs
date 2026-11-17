import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLearnerQuery} from '../lib/owner-learners.ts';
import {learnerEvidence} from '../lib/owner-dashboard.ts';
const valid={filter:'without_active',query:' person@example.test ',page:0,reason:'Registratieproblemen onderzoeken'};
test('learner query bounds and reason are validated',()=>{
 assert.equal(parseLearnerQuery(valid).query,'person@example.test');
 for(const v of [null,{}, {...valid,reason:' '},{...valid,page:-1},{...valid,page:1.5},{...valid,page:10001},{...valid,filter:'toString'},{...valid,query:'x'.repeat(101)}])assert.equal(parseLearnerQuery(v),null);
});
test('AI learner evidence only includes aggregate allowlist, never identities or metadata',()=>{
 const facts=learnerEvidence({captured_at:'2026-11-04T12:00:00Z',definition_version:1,metrics:{accounts:1,new_30:1,without_active_school:1,no_school:1,waitlist:0,never_signed_in:1,incomplete_without_school:1,email:'PRIVATE'},rows:[{name:'PRIVATE',email:'PRIVATE'}],secret:'PRIVATE'});
 assert.ok(!JSON.stringify(facts).includes('PRIVATE'));assert.equal('window_days' in facts,false);assert.equal(facts.new_30,1);assert.equal(facts.accounts,1);
});
