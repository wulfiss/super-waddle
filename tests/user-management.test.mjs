import{test}from'node:test';
import assert from'node:assert/strict';
import{initialUserSettings,changeUserSettings,validateChange,normalizeEmail,validatePassword}from'../src/lib/user-management.ts';
const actor=initialUserSettings.users[2];
test('admin manages users, independent notification emails, normalized duplicates and self protection',()=>{
 let current=structuredClone(initialUserSettings);
 const change=(input,id='new')=>current=changeUserSettings(current,actor,input,id);
 change({action:'create-user',password:'Test-only-password-41',name:' Nuevo ',email:' NEW@EXAMPLE.COM ',role:'warehouse'});
 assert.deepEqual(current.users.at(-1),{id:'new',name:'Nuevo',email:'new@example.com',role:'warehouse'});
 change({action:'update-user',id:'new',name:'Editado',email:'edited@example.com'});
 change({action:'change-role',id:'new',role:'bakery'});assert.equal(current.users.at(-1).role,'bakery');
 assert.throws(()=>change({action:'create-user',password:'Test-only-password-41',name:'Duplicado',email:'EDITED@example.com',role:'admin'}),/existe/);
 assert.throws(()=>change({action:'change-role',id:actor.id,role:'bakery'}),/propia cuenta/);
 assert.throws(()=>change({action:'remove-user',id:actor.id}),/propia cuenta/);
 change({action:'save-recipient',email:'NOTIFY@example.com'},'recipient');
 change({action:'save-recipient',email:'second@example.com'},'recipient-2');
 assert.equal(current.recipients.length,2);
 assert.throws(()=>change({action:'save-recipient',email:'Notify@example.com'}),/ya está/);
 change({action:'save-recipient',id:'recipient',email:'updated@example.com'});
 change({action:'remove-user',id:'new'});assert.equal(current.recipients.length,2);
 change({action:'remove-recipient',id:'recipient'});assert.equal(current.recipients.length,1);
 assert.throws(()=>changeUserSettings(current,current.users[0],{action:'save-recipient',email:'bad@example.com'},'x'),/Solo administración/);
});
test('passwords are validated but never saved in the demo; blank edit means no password change',()=>{
 const password='Test-only-password-41';
 let next=changeUserSettings(initialUserSettings,actor,{action:'create-user',name:'Nuevo',email:'new@example.com',role:'warehouse',password},'new');
 assert.ok(!Object.hasOwn(next.users.at(-1),'password'));assert.ok(!JSON.stringify(next).includes(password));
 next=changeUserSettings(next,actor,{action:'update-user',id:'new',name:'Nuevo',email:'new@example.com',password:'New-test-password-42'},'unused');
 assert.doesNotMatch(JSON.stringify(next),/password|New-test-password-42/);
 assert.ok(!Object.hasOwn(validateChange({action:'update-user',id:'new',name:'Nuevo',email:'new@example.com',password:''}),'password'));
 for(const bad of[undefined,'short','x'.repeat(73),'é'.repeat(37),{}])assert.throws(()=>validatePassword(bad));
 assert.equal(validatePassword('  abcdefgh  '),'  abcdefgh  ');
});
test('rejects malformed payloads and role escalation inputs',()=>{
 for(const email of['bad','x@y','x y@example.com','x@@example.com','a'.repeat(255)+'@example.com'])assert.throws(()=>normalizeEmail(email));
 for(const payload of[null,{}, {action:'change-role',id:'id',role:'owner'},{action:'create-user',password:'Test-only-password-41',name:' ',email:'ok@example.com',role:'bakery'},{action:'save-recipient',email:3}])assert.throws(()=>validateChange(payload));
 assert.deepEqual(validateChange({action:'save-recipient',email:' A@EXAMPLE.COM ',role:'admin'}),{action:'save-recipient',email:'a@example.com'});
});
