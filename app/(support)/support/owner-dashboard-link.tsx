'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useSupportToken} from './client';
export default function OwnerDashboardLink(){
 const {token,isCurrentToken}=useSupportToken();
 const [allowedToken,setAllowedToken]=useState<string|null>(null);
 useEffect(()=>{
  if(!token)return;
  const controller=new AbortController();
  void fetch('/api/support/dashboard/access',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'})
   .then(async res=>res.ok&&(await res.json()).owner===true)
   .then(allowed=>{if(!controller.signal.aborted&&isCurrentToken(token))setAllowedToken(allowed?token:null);})
   .catch(()=>{});
  return()=>controller.abort();
 },[token,isCurrentToken]);
 return token&&allowedToken===token?<Link href="/support/dashboard" style={{color:'#2563eb'}}>Dashboard ↗</Link>:null;
}
