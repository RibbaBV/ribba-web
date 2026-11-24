'use client';
import Link from 'next/link';
import {useSupportToken} from '../../client';
import {Page,PageHeader} from '../../ui/kit';
import Overview from './overview';
export default function UsersPage(){
 const {token,status,isCurrentToken}=useSupportToken();
 return <Page><PageHeader eyebrow="Ribba · alleen eigenaar" title="Gebruikers." subtitle="Nieuwe leerlingen, dagelijks gebruik en wie nu in Ribba zit."/>
 {token?<Overview key={token} token={token} isCurrentToken={isCurrentToken}/>:status==='laden'?<p role="status">Sessie controleren…</p>:<p>Log in met tweefactor om dit overzicht te bekijken. <Link href="/support">Inloggen</Link></p>}</Page>;
}
