import{test}from'node:test';
import assert from'node:assert/strict';
import{handleAdminRequest}from'../supabase/functions/admin-users/handler.ts';

const adminId='11111111-1111-4111-8111-111111111111',staffId='22222222-2222-4222-8222-222222222222';
function fixture(){
 const users=[{id:adminId,email:'admin@example.com',user_metadata:{name:'Admin'}},{id:staffId,email:'staff@example.com',user_metadata:{name:'Staff',role:'admin'}}];
 const roles=[{user_id:adminId,role:'admin'},{user_id:staffId,role:'bakery'}],recipients=[];const calls=[],authInputs=[];
 let failRoles=false;
 const client={
  auth:{getUser:async token=>({data:{user:token==='admin'?users[0]:token==='staff'?users[1]:null},error:null}),admin:{
   listUsers:async()=>({data:{users},error:null}),
   createUser:async data=>{calls.push('create');authInputs.push(data);const user={id:'33333333-3333-4333-8333-333333333333',email:data.email,user_metadata:data.user_metadata};users.push(user);return{data:{user},error:null};},
   updateUserById:async(id,data)=>{calls.push('update');authInputs.push(data);Object.assign(users.find(user=>user.id===id),data);return{error:null};},
   deleteUser:async(id,soft)=>{calls.push(soft?'soft-delete':'cleanup');const user=users.find(user=>user.id===id);if(user)user.deleted_at='now';return{error:null};}
  }},
  from(table){let operation='select',payload,filter;const rows=table==='user_roles'?roles:recipients;
   const execute=()=>{if(operation==='insert'){const row={id:'44444444-4444-4444-8444-444444444444',...payload};if(rows.some(r=>r.email===row.email))return{error:{code:'23505'}};rows.push(row);return{data:row,error:null};}const row=rows.find(r=>!filter||r[filter[0]]===filter[1]);if(operation==='update'&&row)Object.assign(row,payload);if(operation==='delete'&&row)rows.splice(rows.indexOf(row),1);return{data:row,error:row?null:{code:'PGRST116'}};};
   const query={select:()=>query,eq:(key,value)=>{filter=[key,value];return query;},maybeSingle:async()=>execute(),single:async()=>execute(),order:async()=>({data:rows,error:null}),then:resolve=>Promise.resolve({data:rows,error:null}).then(resolve),insert:data=>{operation='insert';payload=data;return query;},update:data=>{operation='update';payload=data;return query;},delete:()=>{operation='delete';return query;}};return query;
  },
  rpc:async(_name,args)=>{calls.push('role');if(failRoles)return{error:{message:'failed'}};const row=roles.find(row=>row.user_id===args.p_user);if(args.p_role===null){if(row)roles.splice(roles.indexOf(row),1);}else if(row)row.role=args.p_role;else roles.push({user_id:args.p_user,role:args.p_role});return{error:null};}
 };
 const request=(body,token='admin')=>handleAdminRequest(new Request('https://example.com/admin-users',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)}),client);
 return{request,users,roles,recipients,calls,authInputs,failRoles:()=>{failRoles=true;}};
}
test('API rejects missing/invalid sessions and staff even with admin metadata',async()=>{
 const f=fixture();for(const [token,status]of[['bad',401],['staff',403]]){const result=await f.request({action:'create-user',password:'Test-only-password-41',name:'X',email:'x@example.com',role:'admin'},token);assert.equal(result.status,status);}
 assert.deepEqual(f.calls,[]);
});
test('API creates, edits and changes roles; soft removal preserves history and revokes access first',async()=>{
 const f=fixture();assert.equal((await f.request({action:'list'})).status,200);
 assert.equal((await f.request({action:'create-user',password:'Test-only-password-41',name:'Nuevo',email:'new@example.com',role:'warehouse'})).status,200);
 assert.equal(f.roles.at(-1).role,'warehouse');
 assert.equal((await f.request({action:'update-user',id:staffId,name:'Editado',email:'edited@example.com'})).status,200);
 assert.equal(f.users[1].email,'edited@example.com');
 assert.equal((await f.request({action:'change-role',id:staffId,role:'warehouse'})).status,200);
 const result=await f.request({action:'remove-user',id:staffId});assert.equal(result.status,200);assert.ok(!f.roles.some(row=>row.user_id===staffId));assert.deepEqual(f.calls.slice(-2),['role','soft-delete']);assert.ok(!(await result.json()).users.some(user=>user.id===staffId));
});
test('API cleans up newly created Auth accounts if role assignment fails',async()=>{
 const f=fixture();f.failRoles();assert.equal((await f.request({action:'create-user',password:'Test-only-password-41',name:'Nuevo',email:'new@example.com',role:'warehouse'})).status,409);assert.deepEqual(f.calls,['create','role','cleanup']);
});
test('API protects own account, validates ids and maintains notification emails independently',async()=>{
 const f=fixture();for(const action of['remove-user','change-role','update-user'])assert.equal((await f.request({action,id:adminId,name:'Admin',email:'admin@example.com',role:'bakery'})).status,400);
 assert.equal((await f.request({action:'remove-user',id:'bad-id'})).status,400);
 assert.equal((await f.request({action:'save-recipient',email:'one@example.com'})).status,200);const id=f.recipients[0].id;
 assert.equal((await f.request({action:'save-recipient',email:'ONE@example.com'})).status,409);
 assert.equal((await f.request({action:'save-recipient',id,email:'updated@example.com'})).status,200);
 assert.equal(f.recipients[0].email,'updated@example.com');
 assert.equal((await f.request({action:'remove-recipient',id})).status,200);assert.equal(f.recipients.length,0);assert.equal(f.users.length,2);
});
test('passwords reach only Auth; omitted or blank edits preserve passwords, and bad passwords are rejected',async()=>{
 const f=fixture(),password='Test-only-password-41';
 const created=await f.request({action:'create-user',name:'Nuevo',email:'new@example.com',role:'warehouse',password});
 assert.equal(created.status,200);assert.equal(f.authInputs[0].password,password);
 assert.doesNotMatch(await created.text(),/Test-only-password-41|password/);
 for(const extra of[{}, {password:''}]){
  assert.equal((await f.request({action:'update-user',id:staffId,name:'Staff',email:'staff@example.com',...extra})).status,200);
  assert.ok(!Object.hasOwn(f.authInputs.at(-1),'password'));
 }
 const updated=await f.request({action:'update-user',id:staffId,name:'Staff',email:'staff@example.com',password:'New-test-password-42'});
 assert.equal(updated.status,200);assert.equal(f.authInputs.at(-1).password,'New-test-password-42');
 assert.doesNotMatch(await updated.text(),/New-test-password-42|password/);
 const count=f.authInputs.length;
 for(const bad of['short','x'.repeat(73),'é'.repeat(37),123])assert.equal((await f.request({action:'update-user',id:staffId,name:'Staff',email:'staff@example.com',password:bad})).status,400);
 assert.equal((await f.request({action:'create-user',name:'Nuevo',email:'another@example.com',role:'bakery'})).status,400);
 assert.equal(f.authInputs.length,count);
});
