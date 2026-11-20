import type {Role} from './access.ts';
import type {BatchIngredient,FormulationBatch} from './formulation-batches.ts';

export type BatchWeight={
 id:string;batch_id:string;ingredient_id:string;unit:string;expected_quantity:number;actual_quantity:number;
 lower_limit:number|null;upper_limit:number|null;difference_quantity:number;difference_percent:number|null;within_tolerance:boolean|null;
 lot:string|null;expiry_date:string|null;revision:number;recorded_by:string;recorded_at:string;
 incorporated:boolean;incorporated_by:string|null;incorporated_at:string|null;
};
export type BatchEvent={
 id:string;batch_id:string;ingredient_id:string|null;actor_id:string;actor_name:string|null;
 request_id:string|null;action:'started'|'weight_saved'|'incorporated'|'weight_corrected'|'closed';
 occurred_at:string;note:string|null;before_snapshot:Record<string,unknown>|null;after_snapshot:Record<string,unknown>;
};
export type WeightChange={batch_id:string;ingredient_id:string;expected_revision:number;request_id:string;note?:string|null} & (
 {action:'save'|'correct';actual_quantity:number;lot:string|null;expiry_date:string|null} | {action:'incorporate'}
);
export function weightAmount(value:string):number{
 if(!/^\d+(?:[.,]\d{1,6})?$/.test(value.trim()))return NaN;
 return Number(value.trim().replace(',','.'));
}
export function weightDifference(ingredient:Pick<BatchIngredient,'expected_quantity'|'lower_limit'|'upper_limit'>,actual:number){
 const difference=(Math.round(actual*1e6)-Math.round(ingredient.expected_quantity*1e6))/1e6;
 return {difference,percent:ingredient.expected_quantity===0?null:difference/ingredient.expected_quantity*100,
  within:ingredient.lower_limit===null||ingredient.upper_limit===null?null:actual>=ingredient.lower_limit&&actual<=ingredient.upper_limit};
}
export function validateWeight(actual:number,lot:string|null,expiry:string|null){
 if(!Number.isFinite(actual)||actual<=0||actual>1e9||!/^\d+(?:\.\d{1,6})?$/.test(String(actual)))throw new Error('Ingresá un peso mayor que cero, con hasta 6 decimales.');
 if(lot!==null&&lot.trim().length>120)throw new Error('El lote no puede superar los 120 caracteres.');
 if(expiry){const date=new Date(expiry);if(!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||expiry.startsWith('0000')||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==expiry)throw new Error('Ingresá una fecha de vencimiento válida o dejala vacía.');}
}
export function changePreviewWeight(source:FormulationBatch,role:Role|null,actorId:string,input:WeightChange,actorName=actorId):FormulationBatch{
 if((role!=='bakery'&&role!=='admin')||(role!=='admin'&&source.user_id!==actorId))throw new Error('No tenés permisos para modificar esta elaboración.');
 if((source.events??[]).some(event=>event.actor_id===actorId&&event.request_id===input.request_id))return source;
 const batch=structuredClone(source),ingredient=batch.ingredients.find(line=>line.ingredient_id===input.ingredient_id&&line.included);
 if(!ingredient)throw new Error('El ingrediente no está incluido en la elaboración.');
 batch.weighings??=[];batch.events??=[];
 const previous=batch.weighings.find(weight=>weight.ingredient_id===input.ingredient_id);
 if((previous?.revision??0)!==input.expected_revision)throw new Error('El peso cambió. Actualizá la elaboración antes de continuar.');
 if(input.action==='correct'){
  if(role!=='admin'||!previous?.incorporated)throw new Error('Solo administración puede corregir un registro incorporado.');
 }else if(batch.status==='closed'||previous?.incorporated)throw new Error('El ingrediente ya está confirmado. Administración puede corregir el registro con historial.');
 if((input.note??'').trim().length>500)throw new Error('La observación no puede superar los 500 caracteres.');
 const now=new Date().toISOString(),before=previous?structuredClone(previous):null;
 let weight:BatchWeight;
 if(input.action==='incorporate'){
  if(!previous)throw new Error('Registrá el peso antes de confirmar la incorporación.');
  weight={...previous,incorporated:true,incorporated_by:actorId,incorporated_at:now,revision:previous.revision+1};
 }else{
  validateWeight(input.actual_quantity,input.lot,input.expiry_date);
  const comparison=weightDifference(ingredient,input.actual_quantity);
  weight={id:previous?.id??crypto.randomUUID(),batch_id:batch.id,ingredient_id:ingredient.ingredient_id,unit:ingredient.unit,
   expected_quantity:ingredient.expected_quantity,actual_quantity:input.actual_quantity,lower_limit:ingredient.lower_limit,upper_limit:ingredient.upper_limit,
   difference_quantity:comparison.difference,difference_percent:comparison.percent,within_tolerance:comparison.within,
   lot:input.lot?.trim()||null,expiry_date:input.expiry_date||null,revision:(previous?.revision??0)+1,recorded_by:actorId,recorded_at:now,
   incorporated:previous?.incorporated??false,incorporated_by:previous?.incorporated_by??null,incorporated_at:previous?.incorporated_at??null};
 }
 batch.weighings=previous?batch.weighings.map(row=>row.id===previous.id?weight:row):[...batch.weighings,weight];
 batch.events.push({id:crypto.randomUUID(),batch_id:batch.id,ingredient_id:ingredient.ingredient_id,actor_id:actorId,actor_name:actorName,request_id:input.request_id,
  action:input.action==='save'?'weight_saved':input.action==='correct'?'weight_corrected':'incorporated',occurred_at:now,note:input.note?.trim()||null,
  before_snapshot:before,after_snapshot:structuredClone(weight)});
 batch.has_discrepancies=batch.weighings.some(row=>row.difference_quantity!==0);
 batch.had_incorporated_discrepancies=!!batch.had_incorporated_discrepancies||(weight.incorporated&&weight.difference_quantity!==0);
 if(batch.status!=='closed'&&batch.ingredients.filter(line=>line.included).every(line=>batch.weighings!.some(row=>row.ingredient_id===line.ingredient_id&&row.incorporated))){
  batch.status='closed';batch.closed_at=now;batch.closed_by=actorId;
  const {events,...snapshot}=batch;
  batch.events.push({id:crypto.randomUUID(),batch_id:batch.id,ingredient_id:null,actor_id:actorId,actor_name:actorName,request_id:null,action:'closed',occurred_at:now,note:null,before_snapshot:null,after_snapshot:{batch:structuredClone(snapshot),weighings:structuredClone(batch.weighings)}});
 }
 return batch;
}
export const batchEventLabels:Record<BatchEvent['action'],string>={started:'Elaboración iniciada',weight_saved:'Peso registrado',incorporated:'Incorporación confirmada',weight_corrected:'Registro corregido por administración',closed:'Elaboración cerrada automáticamente'};
