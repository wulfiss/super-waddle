import {isRole, type Role} from './access.ts';

export type ManagedUser = {id:string;name:string;email:string;role:Role|null};
export type Recipient = {id:string;email:string};
export type UserSettings = {users:ManagedUser[];recipients:Recipient[]};
export type ManagementChange =
 | {action:'create-user';name:string;email:string;role:Role;password:string}
 | {action:'update-user';id:string;name:string;email:string;password?:string}
 | {action:'change-role';id:string;role:Role}
 | {action:'remove-user';id:string}
 | {action:'save-recipient';id?:string;email:string}
 | {action:'remove-recipient';id:string};
export const userSettingsKey='obrador-user-settings-v1';
export const initialUserSettings:UserSettings={users:[
 {id:'preview-bakery',name:'Equipo de panadería',email:'panaderia@example.com',role:'bakery'},
 {id:'preview-warehouse',name:'Equipo de depósito',email:'deposito@example.com',role:'warehouse'},
 {id:'preview-admin',name:'Administrador de prueba',email:'admin@example.com',role:'admin'}
],recipients:[]};
export function normalizeEmail(value:unknown):string {
 if(typeof value!=='string')throw new Error('Ingresá un correo válido.');
 const email=value.trim().toLowerCase();
 if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Ingresá un correo válido.');
 return email;
}
export function validatePassword(value:unknown):string {
 if(typeof value!=='string'||value.length<8)throw new Error('La contraseña debe tener al menos 8 caracteres.');
 if(new TextEncoder().encode(value).length>72)throw new Error('La contraseña es demasiado larga (máximo 72 bytes).');
 return value;
}
export function validateChange(input:unknown):ManagementChange {
 if(!input || typeof input!=='object')throw new Error('Solicitud inválida.');
 const data=input as Record<string,unknown>;
 const id=()=>{if(typeof data.id!=='string'||!data.id||data.id.length>100)throw new Error('Seleccioná un registro válido.');return data.id;};
 const name=()=>{if(typeof data.name!=='string'||!data.name.trim()||data.name.trim().length>120)throw new Error('Ingresá un nombre de hasta 120 caracteres.');return data.name.trim();};
 const role=()=>{if(!isRole(data.role))throw new Error('Seleccioná un rol válido.');return data.role;};
 switch(data.action){
  case 'create-user':return {action:data.action,name:name(),email:normalizeEmail(data.email),role:role(),password:validatePassword(data.password)};
  case 'update-user':return {action:data.action,id:id(),name:name(),email:normalizeEmail(data.email),...(data.password!==undefined&&data.password!==''?{password:validatePassword(data.password)}:{})};
  case 'change-role':return {action:data.action,id:id(),role:role()};
  case 'remove-user':case 'remove-recipient':return {action:data.action,id:id()};
  case 'save-recipient':return {action:data.action,...(data.id?{id:id()}:{}),email:normalizeEmail(data.email)};
  default:throw new Error('Solicitud inválida.');
 }
}
export function changeUserSettings(current:UserSettings,actor:ManagedUser,raw:unknown,newId:string):UserSettings {
 // The demo follows the same administrator boundary as the backend.
 if(current.users.find(user=>user.id===actor.id)?.role!=='admin')throw new Error('Solo administración puede gestionar usuarios.');
 const change=validateChange(raw),next=structuredClone(current);
 if('id' in change && change.id===actor.id && change.action!=='save-recipient' && change.action!=='remove-recipient')throw new Error('No podés modificar tu propia cuenta desde Usuarios.');
 if(change.action==='create-user'||change.action==='update-user'){
  if(next.users.some(user=>user.email===change.email&&user.id!==('id' in change?change.id:null)))throw new Error('Ya existe un usuario con ese correo.');
  if(change.action==='create-user')next.users.push({id:newId,name:change.name,email:change.email,role:change.role});
  else {const user=next.users.find(user=>user.id===change.id);if(!user)throw new Error('El usuario ya no está disponible.');Object.assign(user,{name:change.name,email:change.email});}
 }else if(change.action==='change-role'){
  const user=next.users.find(user=>user.id===change.id);if(!user)throw new Error('El usuario ya no está disponible.');user.role=change.role;
 }else if(change.action==='remove-user'){
  if(!next.users.some(user=>user.id===change.id))throw new Error('El usuario ya no está disponible.');next.users=next.users.filter(user=>user.id!==change.id);
 }else if(change.action==='save-recipient'){
  if(next.recipients.some(recipient=>recipient.email===change.email&&recipient.id!==change.id))throw new Error('Ese correo ya está en la lista de notificaciones.');
  if(change.id){const recipient=next.recipients.find(recipient=>recipient.id===change.id);if(!recipient)throw new Error('El correo ya no está disponible.');recipient.email=change.email;}
  else next.recipients.push({id:newId,email:change.email});
 }else next.recipients=next.recipients.filter(recipient=>recipient.id!==change.id);
 return next;
}
