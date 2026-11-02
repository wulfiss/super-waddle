import type {SupabaseClient} from '@supabase/supabase-js';
import {validateChange, type ManagedUser,type UserSettings} from '../../../src/lib/user-management.ts';

const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
class RequestError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status;}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function list(admin:SupabaseClient):Promise<UserSettings>{
 const [assigned,recipients]=await Promise.all([admin.from('user_roles').select('user_id,role'),admin.from('notification_recipients').select('id,email').order('email')]);
 if(assigned.error||recipients.error)throw new RequestError('No pudimos cargar la configuración. Verificá que las migraciones estén aplicadas.',503);
 const roleMap=new Map((assigned.data??[]).map(row=>[row.user_id,row.role]));
 const users:ManagedUser[]=[];
 for(let page=1;;page++){
  const result=await admin.auth.admin.listUsers({page,perPage:200});
  if(result.error)throw new RequestError('No pudimos cargar las cuentas.',503);
  for(const user of result.data.users){
   if('deleted_at' in user&&user.deleted_at)continue;
   users.push({id:user.id,email:user.email??'',name:typeof user.user_metadata?.name==='string'?user.user_metadata.name:'',role:roleMap.get(user.id)??null});
  }
  if(result.data.users.length<200)break;
 }
 return {users:users.sort((a,b)=>a.email.localeCompare(b.email)),recipients:recipients.data??[]};
}
export async function handleAdminRequest(request:Request,admin:SupabaseClient):Promise<Response>{
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({error:'Método no permitido.'},405);
 try{
  const token=request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)throw new RequestError('Ingresá con tu cuenta para continuar.',401);
  const identity=await admin.auth.getUser(token);
  if(identity.error||!identity.data.user)throw new RequestError('La sesión venció. Volvé a ingresar.',401);
  const actor=identity.data.user.id;
  const assigned=await admin.from('user_roles').select('role').eq('user_id',actor).maybeSingle();
  if(assigned.error)throw new RequestError('No pudimos verificar tus permisos.',503);
  if(assigned.data?.role!=='admin')throw new RequestError('Solo administración puede gestionar usuarios.',403);
  const text=await request.text();if(text.length>16384)throw new RequestError('Solicitud demasiado grande.',413);
  let input;try{input=JSON.parse(text);}catch{throw new RequestError('Solicitud inválida.');}
  if(input?.action==='list')return reply(await list(admin));
  let change;try{change=validateChange(input);}catch(failure){throw new RequestError(failure instanceof Error?failure.message:'Solicitud inválida.');}
  if('id' in change&&change.id&&!uuid.test(change.id))throw new RequestError('Registro inválido.');
  if('id' in change&&change.id===actor&&['update-user','change-role','remove-user'].includes(change.action))throw new RequestError('No podés modificar tu propia cuenta desde Usuarios.');
  const setRole=async(id:string,role:string|null)=>{
   const result=await admin.rpc('admin_set_user_role',{p_actor:actor,p_user:id,p_role:role});
   if(result.error)throw new RequestError('No se pudo cambiar el acceso. Actualizá la lista y verificá que quede un administrador.',409);
  };
  if(change.action==='create-user'){
   // Passwords go only to Auth, never to metadata, user lists or application tables.
   const result=await admin.auth.admin.createUser({email:change.email,password:change.password,email_confirm:true,user_metadata:{name:change.name}});
   if(result.error?.code==='weak_password')throw new RequestError('La contraseña no cumple los requisitos de seguridad. Probá una más larga y difícil de adivinar.');
   if(result.error||!result.data.user)throw new RequestError('No se pudo crear el usuario. El correo puede estar en uso.',409);
   try{await setRole(result.data.user.id,change.role);}catch(failure){await admin.auth.admin.deleteUser(result.data.user.id);throw failure;}
  }else if(change.action==='update-user'){
   const result=await admin.auth.admin.updateUserById(change.id,{email:change.email,email_confirm:true,user_metadata:{name:change.name},...(change.password?{password:change.password}:{})});
   if(result.error?.code==='weak_password')throw new RequestError('La contraseña no cumple los requisitos de seguridad. Probá una más larga y difícil de adivinar.');
   if(result.error)throw new RequestError('No se pudo guardar el usuario. Verificá que el correo no esté en uso.',409);
  }else if(change.action==='change-role')await setRole(change.id,change.role);
  else if(change.action==='remove-user'){
   // Removing the database role blocks existing JWTs before soft-deleting Auth.
   await setRole(change.id,null);
   const result=await admin.auth.admin.deleteUser(change.id,true);
   if(result.error)throw new RequestError('Se quitó el acceso, pero no se pudo eliminar la cuenta. Actualizá la lista e intentá nuevamente.',409);
  }else if(change.action==='save-recipient'){
   const query=change.id?admin.from('notification_recipients').update({email:change.email}).eq('id',change.id):admin.from('notification_recipients').insert({email:change.email});
   const result=await query.select('id').single();
   if(result.error)throw new RequestError(result.error.code==='23505'?'Ese correo ya está en la lista de notificaciones.':'No se pudo guardar el correo. Actualizá la lista e intentá nuevamente.',409);
  }else {
   const result=await admin.from('notification_recipients').delete().eq('id',change.id).select('id').single();
   if(result.error)throw new RequestError('No se pudo eliminar el correo. Actualizá la lista e intentá nuevamente.',409);
  }
  return reply(await list(admin));
 }catch(failure){return reply({error:failure instanceof RequestError?failure.message:'No pudimos completar la operación. Actualizá la lista antes de intentar nuevamente.'},failure instanceof RequestError?failure.status:500);}
}
