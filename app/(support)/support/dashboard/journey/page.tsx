'use client';
import {useEffect,useState} from 'react';
import {useSupportToken} from '../../client';
import {type CaseInput,type JourneyData} from '@/lib/owner-journey';
import JourneyView from './journey-view';
export default function JourneyPage(){
 const {token,status,isCurrentToken}=useSupportToken();
 const [school,setSchool]=useState('');
 const [attempt,setAttempt]=useState(0);
 const [result,setResult]=useState<{token:string;school:string;data?:JourneyData;error?:string}|null>(null);
 const [notice,setNotice]=useState<{token:string;school:string;text:string}|null>(null);
 useEffect(()=>{
  if(!token)return;
  const controller=new AbortController();
  void fetch(`/api/support/dashboard/journey${school?'?school='+encodeURIComponent(school):''}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
   .then(async res=>({res,body:await res.json()})).then(({res,body})=>{
    if(!controller.signal.aborted&&isCurrentToken(token))setResult({token,school,...(res.ok?{data:body}:{error:body.error??'Laden mislukt.'})});
   }).catch(()=>{if(!controller.signal.aborted&&isCurrentToken(token))setResult({token,school,error:'Geen verbinding. Probeer opnieuw.'});});
  return()=>controller.abort();
 },[token,school,attempt,isCurrentToken]);
 const visible=result?.token===token&&result.school===school?result:null;
 const data=visible?.data;
 const noticeText=notice?.token===token&&notice.school===school?notice.text:null;
 async function save(id:string,revision:number,input:CaseInput){
  if(!token||!school)throw new Error('Kies een rijschool en log opnieuw in.');
  const current=token;
  const res=await fetch('/api/support/dashboard/journey',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({school_id:school,id,revision,case:input})});
  const body=await res.json();
  if(!isCurrentToken(current))throw new Error('Je sessie is verlopen.');
  if(!res.ok)throw new Error(body.error??'Opslaan mislukt.');
  setNotice({token:current,school,text:'Supportregistratie opgeslagen.'});setAttempt(n=>n+1);
 }
 return <JourneyView token={token} school={school} onSchool={id=>{setSchool(id);setNotice(null);}} unauthorized={status==='geen-toegang'} error={visible?.error} data={data} notice={noticeText} onRetry={()=>setAttempt(n=>n+1)} onSave={save}/>;
}
