import { supabase } from '../lib/supabase';
import { validTermForIssue,type TermModelId,type TermDraft } from '../utils/enrollmentTermModels';
import { iacraFeaturesEnabled } from '../lib/iacraFeatureGate';

function requireFeature() {
  if (!iacraFeaturesEnabled()) throw new Error('Matrícula digital não ativada para produção.');
}
export type DigitalOffer = {
 model_id:TermModelId; teacher_name:string; plan_name:string; group_name:string|null;
 instrument:string|null;
 start_date:string; enrollment_date:string; due_day:number; monthly_amount:number;
 term_title:string; term_body:string; expires_at:string;
};
export type DigitalOfferTracking = {
 id:string;
 created_at:string;
 expires_at:string;
 first_opened_at:string|null;
 sent_at:string|null;
 recipient_label:string|null;
 submitted_at:string|null;
 term_title:string;
 model_id:TermModelId;
 plan_name:string;
 teacher_name:string;
 group_name:string|null;
 submission_status:'pending'|'approved'|'changes_requested'|null;
};
export async function readDigitalOfferTracking():Promise<DigitalOfferTracking[]>{
 requireFeature();
 const {data,error}=await supabase.rpc('eavra_dev_admin_enrollment_offers');
 if(error)throw error;
 return (data||[]) as DigitalOfferTracking[];
}
export async function markDigitalOfferSent(id:string,label:string):Promise<void>{
 requireFeature();
 const {data,error}=await supabase.rpc('eavra_dev_admin_mark_enrollment_sent',{p_offer_id:id,p_recipient_label:label.trim()||null});
 if(error)throw error;
 if(!data?.updated)throw new Error('Não foi possível registrar o envio.');
}
/** Called only after the active enrollment form was actually rendered in the browser. */
export async function trackDigitalOfferOpened(token:string):Promise<void>{
 requireFeature();
 if(!/^[0-9a-f]{64}$/.test(token))return;
 // Tracking is best-effort. Viewing and accepting a term do not depend on telemetry.
 await supabase.rpc('eavra_dev_track_enrollment_open',{p_token:token});
}
export type DigitalRequest = {
 id:string; status:'pending'|'approved'|'changes_requested'; student:Record<string,string>;
 plan_name:string;teacher_name:string;group_name:string|null;monthly_amount:number;
 accepted_at:string;enrollment_id:string|null; student_id:string|null;
 start_date?:string; enrollment_date?:string; due_day?:number;
};
export async function createDigitalOffer(input:{
 modelId:TermModelId;teacherId:string;planId:string;groupId:string|null;startDate:string;
 enrollmentDate:string;dueDay:number;monthlyAmount:number;term:TermDraft;expiresOn:string;instrument:string;
}):Promise<string>{
 requireFeature();
 if(!validTermForIssue(input.term))throw new Error('O termo precisa estar preenchido e revisado.');
 if(input.instrument.trim().length<2||input.instrument.trim().length>120)throw new Error('Informe o instrumento ou atividade (2 a 120 caracteres).');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn))throw new Error('Informe uma data de validade válida.');
 const {data,error}=await supabase.rpc('eavra_dev_create_enrollment_offer_with_instrument',{
 p_model_id:input.modelId,p_teacher_id:input.teacherId,p_plan_id:input.planId,p_group_id:input.groupId,
 p_start_date:input.startDate,p_enrollment_date:input.enrollmentDate,p_due_day:input.dueDay,
 p_monthly_amount:input.monthlyAmount,p_term_title:input.term.title,p_term_body:input.term.body,
 p_expires_on:input.expiresOn,p_instrument:input.instrument.trim()
 });
 if(error)throw error;
 const token=String(data?.token||'');
 if(!/^[0-9a-f]{64}$/.test(token))throw new Error('Token inválido');
 return new URL('/matricula?convite='+encodeURIComponent(token),window.location.origin).href;
}
export async function readDigitalOffer(token:string):Promise<DigitalOffer>{
 requireFeature();
 const {data,error}=await supabase.rpc('eavra_dev_get_enrollment_offer',{p_token:token});
 if(error)throw error;
 return data as DigitalOffer;
}
export async function submitDigitalOffer(token:string,student:Record<string,string>):Promise<void>{
 requireFeature();
 const {data,error}=await supabase.rpc('eavra_dev_submit_enrollment',{p_token:token,p_student:student,p_accepted:true});
 if(error)throw error;
 if(!data?.submitted)throw new Error('Solicitação não recebida');
}
export async function readDigitalInbox():Promise<DigitalRequest[]>{
 requireFeature();
 const {data,error}=await supabase.rpc('eavra_dev_admin_enrollment_inbox');
 if(error)throw error;
 return (data||[]) as DigitalRequest[];
}
export type DigitalStudentMatch={
 match_count:number; multiple_matches?:boolean;
 student?:{id:string;name:string;email:string|null;phone:string|null;instrument:string|null;birth_date:string|null;status:string};
 matching_enrollment_id?:string|null;
};
export async function reviewDigitalStudentMatch(id:string):Promise<DigitalStudentMatch>{
 requireFeature();
 const {data,error}=await supabase.rpc('eavra_dev_admin_review_student_match',{p_submission_id:id});
 if(error)throw error;
 return data as DigitalStudentMatch;
}
export async function approveDigitalRequest(id:string,options:{updateStudent:boolean;forceNewEnrollment:boolean}):Promise<{student_id:string;enrollment_id:string;student_reused:boolean;enrollment_reused:boolean}>{
 requireFeature();
 const {data,error}=await supabase.rpc('eavra_dev_approve_enrollment_review',{p_submission_id:id,p_update_student:options.updateStudent,p_force_new_enrollment:options.forceNewEnrollment});
 if(error)throw error;
 if(!data?.approved)throw new Error('Aprovação não confirmada');
 return {student_id:data.student_id,enrollment_id:data.enrollment_id,student_reused:!!data.student_reused,enrollment_reused:!!data.enrollment_reused};
}

export type DigitalTermAudit = {
 status:string; term_title:string; term_body:string; accepted_at:string;
 reviewed_at:string|null; reviewed_by:string|null;
 student_id:string|null; enrollment_id:string|null;
 guardian_name?:string|null;guardian_email?:string|null;guardian_phone?:string|null;guardian_relationship?:string|null;guardian_cpf?:string|null;
};
export async function readDigitalTermAudit(id:string):Promise<DigitalTermAudit>{
 requireFeature();
 const {data,error}=await supabase.rpc('eavra_dev_admin_read_term',{p_submission_id:id});
 if(error)throw error;
 if(!data||typeof data.term_body!=='string')throw new Error('Histórico indisponível no banco');
 return data as DigitalTermAudit;
}
