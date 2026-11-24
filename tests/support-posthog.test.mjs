import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSupportPosthog,supportPosthogQuery} from '../lib/support-posthog.ts';
test('PostHog aggregate query is bounded and contains no names or emails',()=>{
 for(const days of [7,30,90]){
  const sql=supportPosthogQuery(days);
  assert.match(sql,new RegExp(`INTERVAL ${days} DAY`));
  assert.match(sql,/LIMIT 20/);assert.doesNotMatch(sql,/email|person\.properties|SELECT \*/);
 }
});
test('PostHog missing configuration, valid aggregates and failures stay distinct',async()=>{
 const key=process.env.POSTHOG_PERSONAL_API_KEY,project=process.env.POSTHOG_PROJECT_ID,originalFetch=globalThis.fetch;
 try{
  delete process.env.POSTHOG_PERSONAL_API_KEY;delete process.env.POSTHOG_PROJECT_ID;
  assert.equal((await readSupportPosthog(7)).status,'not_configured');
  process.env.POSTHOG_PERSONAL_API_KEY='fixture';process.env.POSTHOG_PROJECT_ID='12';
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://eu.posthog.com/api/projects/12/query/');
   assert.equal(options.headers.Authorization,'Bearer fixture');
   return {ok:true,json:async()=>({results:[['lesson_requested',12,4]]})};
  };
  assert.deepEqual((await readSupportPosthog(7)).rows,[{event:'lesson_requested',label:'Les aangevraagd',occurrences:12,identities:4}]);
  globalThis.fetch=async()=>({ok:false});await assert.rejects(readSupportPosthog(7));
  globalThis.fetch=async()=>({ok:true,json:async()=>({results:[['constructor',1,1]]})});await assert.rejects(readSupportPosthog(7));
 }finally{
  globalThis.fetch=originalFetch;
  if(key===undefined)delete process.env.POSTHOG_PERSONAL_API_KEY;else process.env.POSTHOG_PERSONAL_API_KEY=key;
  if(project===undefined)delete process.env.POSTHOG_PROJECT_ID;else process.env.POSTHOG_PROJECT_ID=project;
 }
});
