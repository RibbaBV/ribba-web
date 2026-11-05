import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {jsx,jsxs} from 'react/jsx-runtime';

// Exercise the actual page's rendered session boundary, without loading CSS or Next.
test('session loss removes the entire private learner component, including its state',()=>{
 let token='session-one';
 const source=readFileSync(new URL('../app/(support)/support/dashboard/learners/page.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};
 vm.runInNewContext(compiled,{exports,require(id){
  if(id==='react/jsx-runtime')return {jsx,jsxs};
  if(id==='react')return {useState(){throw new Error('Private state must live below session boundary');},useEffect(){}};
  if(id==='../../client')return {useSupportToken:()=>({token,isCurrentToken:t=>t===token})};
  return {default:{}};
 }});
 const boundary=()=>exports.default().props.children.props.children[1];
 const first=boundary();assert.equal(typeof first.type,'function');assert.equal(first.props.token,'session-one');
 token=null;const signedOut=boundary();assert.equal(signedOut.type,'p');assert.match(signedOut.props.children,/Log in/);
 token='session-two';const next=boundary();assert.equal(next.type,first.type);assert.equal(next.props.token,'session-two');
 // React removes the child at signout; returning later mounts fresh private state.
});
