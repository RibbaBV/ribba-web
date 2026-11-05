import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {jsx,jsxs,Fragment} from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';

// Render the real component with controlled hook state: incomplete successful
// responses must offer recovery, while a valid zero-account cohort is not an error.
function render(result){
 const source=readFileSync(new URL('../app/(support)/support/dashboard/learners/MarketingOverview.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};let index=0;let retry;
 const values=[0,result,'none'];
 vm.runInNewContext(compiled,{exports,require(id){
  if(id==='react/jsx-runtime')return {jsx,jsxs,Fragment};
  if(id==='react')return {useEffect(){},useState(){const current=index++;return [values[current],value=>{if(current===0)retry=value(0);}];}};
  return {default:{}};
 }});
 const tree=exports.default({token:'current',isCurrentToken:()=>true});
 const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
 return {html:renderToStaticMarkup(tree),buttons:walk(tree).filter(n=>n.type==='button'),get retry(){return retry;}};
}
test('missing selected scope offers retry instead of endless loading',()=>{
 for(const data of [{groups:[]},{groups:[{scope:'all'}]},{}]){
  const view=render({token:'current',data});assert.match(view.html,/doelgroep ontbreekt/);assert.doesNotMatch(view.html,/Voorkeuren laden/);
  assert.equal(view.buttons.length,1);view.buttons[0].props.onClick();assert.equal(view.retry,1);
 }
});
test('pending or previous-session response never displays private data',()=>{
 for(const value of [null,{token:'old',data:{groups:[]}}]){
  const view=render(value);assert.match(view.html,/Voorkeuren laden/);assert.equal(view.buttons.length,0);
 }
});
test('valid zero-account cohort renders zero counts, not missing-data error',()=>{
 const view=render({token:'current',data:{captured_at:'2026-11-05T12:00:00Z',groups:[{scope:'none',accounts:0,eligible:0,not_asked:0,declined:0,withdrawn:0,age_or_profile_blocked:0,legacy_unconfirmed:0,granted:0}]}});
 assert.match(view.html,/0 accounts in deze doelgroep/);assert.doesNotMatch(view.html,/doelgroep ontbreekt|Voorkeuren laden/);
});
