import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {jsx,jsxs} from 'react/jsx-runtime';

// Exercise the actual page's rendered session boundary, without loading CSS or Next.
test('session loss removes the entire private learner component, including its state',()=>{
 let token='session-one';let status='ok';
 const source=readFileSync(new URL('../app/(support)/support/dashboard/learners/page.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};
 vm.runInNewContext(compiled,{exports,require(id){
  if(id==='react/jsx-runtime')return {jsx,jsxs};
  if(id==='react')return {useState(){throw new Error('Private state must live below session boundary');},useEffect(){}};
  if(id==='../../client')return {useSupportToken:()=>({token,status,isCurrentToken:t=>t===token})};
  return {default:{}};
 }});
 const boundary=()=>exports.default().props.children.props.children[1];
 const first=boundary();assert.equal(typeof first.type,'function');assert.equal(first.props.token,'session-one');
 token=null;status='geen-toegang';const signedOut=boundary();assert.equal(typeof signedOut.type,'function');assert.notEqual(signedOut.type,first.type);
 // The shell hides its navigation without a session; the page itself must link back to the login.
 const [text,login]=signedOut.type().props.children;assert.match(text.props.children,/Log in/);assert.equal(login.props.href,'/support');assert.equal(login.props.children,'Inloggen');
 token='session-two';status='ok';const next=boundary();assert.equal(next.type,first.type);assert.equal(next.props.token,'session-two');
 // React removes the child at signout; returning later mounts fresh private state.
});

test('while the session is still being checked, the page shows a neutral status instead of the login prompt',()=>{
 const source=readFileSync(new URL('../app/(support)/support/dashboard/learners/page.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};
 vm.runInNewContext(compiled,{exports,require(id){
  if(id==='react/jsx-runtime')return {jsx,jsxs};
  if(id==='react')return {useState(){throw new Error('unused');},useEffect(){}};
  if(id==='../../client')return {useSupportToken:()=>({token:null,status:'laden',isCurrentToken:()=>false})};
  return {default:{}};
 }});
 const loading=exports.default().props.children.props.children[1];
 assert.equal(loading.type,'p');assert.equal(loading.props.role,'status');
});
