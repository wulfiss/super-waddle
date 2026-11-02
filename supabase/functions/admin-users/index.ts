import {createClient} from '@supabase/supabase-js';
import {handleAdminRequest} from './handler.ts';

Deno.serve((request:Request)=>{
 const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}').default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!secret)return new Response(JSON.stringify({error:'La administración de usuarios todavía no está configurada.'}),{status:503,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
 const admin=createClient(Deno.env.get('SUPABASE_URL')??'',secret,{auth:{persistSession:false,autoRefreshToken:false}});
 return handleAdminRequest(request,admin);
});
