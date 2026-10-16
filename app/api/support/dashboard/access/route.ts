import { NextRequest } from 'next/server';
import { withSupportAccess } from '@/lib/support-auth';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
 return withSupportAccess(req,{action:'owner.dashboard.access',level:0,ownerOnly:true},async()=>({owner:true}));
}
