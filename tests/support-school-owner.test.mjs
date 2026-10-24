import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSchoolOwners} from '../lib/support-school-owner.ts';
function client(permission=true, profiles=[{id:'u1',first_name:' Ada ',last_name:' Lovelace ',name:'Old'}]) {
 const calls=[];
 return {calls,rpc:async(name,args)=>{calls.push([name,args]);return {data:permission,error:null};},from(table){calls.push(table);return {select(fields){calls.push(fields);return this;},eq(key,value){calls.push([key,value]);return key==='school_role'?Promise.resolve({data:[{user_id:'u1'}],error:null}):this;},in(key,ids){calls.push([key,ids]);return Promise.resolve({data:profiles,error:null});}};}};
}
test('non-owner and ambiguous permission never query personal names',async()=>{for(const p of [false,null,'true']){const db=client(p);assert.equal(await readSchoolOwners(db,'viewer','school'),null);assert.equal(db.calls.length,1);}});
test('name belongs to owner membership in the requested school; no email returned',async()=>{const db=client();assert.deepEqual(await readSchoolOwners(db,'viewer','school'),{status:'ready',names:['Ada Lovelace']});assert.deepEqual(db.calls[0],['is_platform_owner',{p_user_id:'viewer'}]);assert.ok(db.calls.some(c=>Array.isArray(c)&&c[0]==='drivingschool_id'&&c[1]==='school'));assert.ok(db.calls.some(c=>Array.isArray(c)&&c[0]==='school_role'&&c[1]==='owner'));});
test('missing profile is not replaced with school name',async()=>{assert.deepEqual(await readSchoolOwners(client(true,[]),'viewer','school'),{status:'ready',names:['Naam niet ingevuld']});});
test('lookup failure does not expose partial personal data',async()=>{const db=client();db.from=()=>{throw Error('offline');};assert.deepEqual(await readSchoolOwners(db,'viewer','school'),{status:'unavailable'});});
