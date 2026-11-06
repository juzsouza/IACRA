import { supabase } from '../lib/supabase';
import type { TermModelId } from '../utils/enrollmentTermsDemo';
import type { TermDraft } from '../utils/enrollmentTermsDraft';
import { checkPermissionDevEnvironment, getPermissionDevEnvironment } from '../utils/permissionAdminConfig';

function requireDev() {
  if (!checkPermissionDevEnvironment(getPermissionDevEnvironment()).ok) throw new Error('Ambiente DEV não autorizado');
}
export type RealDevOffer = {
 model_id:TermModelId; teacher_name:string; plan_name:string; group_name:string|null;
 start_date:string; enrollment_date:string; due_day:number; monthly_amount:number;
 term_title:string; term_body:string; expires_at:string;
};
export type RealDevRequest = {
 id:string; status:'pending'|'approved'|'changes_requested'; student:Record<string,string>;
 plan_name:string;teacher_name:string;group_name:string|null;monthly_amount:number;
 accepted_at:string;enrollment_id:string|null; student_id:string|null;
 start_date?:string; enrollment_date?:string; due_day?:number;
};
export async function createRealDevOffer(input:{
 modelId:TermModelId;teacherId:string;planId:string;groupId:string|null;startDate:string;
 enrollmentDate:string;dueDay:number;monthlyAmount:number;term:TermDraft;expiresOn:string;
}):Promise<string>{
 requireDev();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn))throw new Error('Informe uma data de validade válida.');
 const {data,error}=await supabase.rpc('eavra_dev_create_enrollment_offer_with_expiry',{
 p_model_id:input.modelId,p_teacher_id:input.teacherId,p_plan_id:input.planId,p_group_id:input.groupId,
 p_start_date:input.startDate,p_enrollment_date:input.enrollmentDate,p_due_day:input.dueDay,
 p_monthly_amount:input.monthlyAmount,p_term_title:input.term.title,p_term_body:input.term.body,
 p_expires_on:input.expiresOn
 });
 if(error)throw error;
 const token=String(data?.token||'');
 if(!/^[0-9a-f]{64}$/.test(token))throw new Error('Token DEV inválido');
 return new URL('/matricula-dev?convite='+encodeURIComponent(token),window.location.origin).href;
}
export async function readRealDevOffer(token:string):Promise<RealDevOffer>{
 requireDev();
 const {data,error}=await supabase.rpc('eavra_dev_get_enrollment_offer',{p_token:token});
 if(error)throw error;
 return data as RealDevOffer;
}
export async function submitRealDevOffer(token:string,student:Record<string,string>):Promise<void>{
 requireDev();
 const {data,error}=await supabase.rpc('eavra_dev_submit_enrollment',{p_token:token,p_student:student,p_accepted:true});
 if(error)throw error;
 if(!data?.submitted)throw new Error('Solicitação não recebida');
}
export async function readRealDevInbox():Promise<RealDevRequest[]>{
 requireDev();
 const {data,error}=await supabase.rpc('eavra_dev_admin_enrollment_inbox');
 if(error)throw error;
 return (data||[]) as RealDevRequest[];
}
export type RealDevStudentMatch={
 match_count:number; multiple_matches?:boolean;
 student?:{id:string;name:string;email:string|null;phone:string|null;instrument:string|null;birth_date:string|null;status:string};
 matching_enrollment_id?:string|null;
};
export async function reviewRealDevStudentMatch(id:string):Promise<RealDevStudentMatch>{
 requireDev();
 const {data,error}=await supabase.rpc('eavra_dev_admin_review_student_match',{p_submission_id:id});
 if(error)throw error;
 return data as RealDevStudentMatch;
}
export async function approveRealDevRequest(id:string,options:{updateStudent:boolean;forceNewEnrollment:boolean}):Promise<{student_id:string;enrollment_id:string;student_reused:boolean;enrollment_reused:boolean}>{
 requireDev();
 const {data,error}=await supabase.rpc('eavra_dev_approve_enrollment_review',{p_submission_id:id,p_update_student:options.updateStudent,p_force_new_enrollment:options.forceNewEnrollment});
 if(error)throw error;
 if(!data?.approved)throw new Error('Aprovação não confirmada');
 return {student_id:data.student_id,enrollment_id:data.enrollment_id,student_reused:!!data.student_reused,enrollment_reused:!!data.enrollment_reused};
}

export type RealDevTermAudit = {
 status:string; term_title:string; term_body:string; accepted_at:string;
 reviewed_at:string|null; reviewed_by:string|null;
 student_id:string|null; enrollment_id:string|null;
 guardian_name?:string|null;guardian_email?:string|null;guardian_phone?:string|null;guardian_relationship?:string|null;guardian_cpf?:string|null;
};
export async function readRealDevTermAudit(id:string):Promise<RealDevTermAudit>{
 requireDev();
 const {data,error}=await supabase.rpc('eavra_dev_admin_read_term',{p_submission_id:id});
 if(error)throw error;
 if(!data||typeof data.term_body!=='string')throw new Error('Histórico indisponível no banco DEV');
 return data as RealDevTermAudit;
}
