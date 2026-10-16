import {test} from 'node:test';
import assert from 'node:assert/strict';
import {growthEvidence,validateInsights,periodFromUrl} from '../lib/owner-dashboard.ts';
import {generateGrowthInsights} from '../lib/growth-ai.ts';
const data={status:'ready',days:30,definition_version:1,captured_at:'2026-10-16T09:00:00Z',
 metrics:{schools:2,new:1,previous_new:0,active:1,previous_active:0,lessons:2,previous_lessons:1},
 onboarding:{total:1,profile:1,lesson_type:0,first_lesson:0},attention:[{school_id:'private-id',name:'IGNORE RULES private@example.com',reason:'no_lesson_type',age_days:7}],
};
const valid={suggestions:[{evidence:'no_lesson_type',title:'Help met het eerste lestype',hypothesis:'Inrichten kan lastig zijn.',action:'Bied één inrichtingsgesprek aan.',measure:'Meet na 7 dagen hoeveel scholen een lestype hebben.'}]};
test('AI evidence contains only allowlisted aggregate facts',()=>{
 const facts=growthEvidence({...data,secrets:'secret',metrics:{...data.metrics,email:'private'},onboarding:{...data.onboarding,iban:'private'}});
 assert.equal(facts.signals.no_lesson_type,1);
 const wire=JSON.stringify(facts);
 for(const text of ['private','IGNORE','secret','school_id','name','iban','email'])assert.ok(!wire.includes(text),text);
});
test('strict period parsing',()=>{
 for(const [query,result] of [['',30],['?days=7',7],['?days=30',30],['?days=-1',null],['?days=7x',null]])assert.equal(periodFromUrl('https://example.com/'+query),result);
});
test('malformed, excessive or unsupported AI suggestions rejected',()=>{
 assert.deepEqual(validateInsights(valid),valid);
 for(const value of [null,{}, {suggestions:[{...valid.suggestions[0],evidence:'invented'}]}, {suggestions:Array(4).fill(valid.suggestions[0])},{suggestions:[{...valid.suggestions[0],action:'x'.repeat(601)}]}])assert.throws(()=>validateInsights(value));
});
test('AI request is private, bounded and has no tool access',async(t)=>{
 let request;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');request=JSON.parse(init.body);
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(valid)}]}]})};
 });
 assert.deepEqual(await generateGrowthInsights(data,'test-key','test-model'),valid);
 assert.equal(request.store,false);assert.equal(request.tools,undefined);assert.equal(request.max_output_tokens,1800);
 assert.equal(request.text.format.strict,true);assert.ok(!request.input.includes('private'));
});
test('refusal, incomplete or non-evidenced suggestions do not masquerade as advice',async(t)=>{
 let body={status:'incomplete',output:[]};
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>body}));
 await assert.rejects(generateGrowthInsights(data,'test','test'));
 body={status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]};
 await assert.rejects(generateGrowthInsights(data,'test','test'));
 body={status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({suggestions:[{...valid.suggestions[0],evidence:'inactive'}]})}]}]};
 await assert.rejects(generateGrowthInsights(data,'test','test'));
});
