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
 term_title:string; term_body:string;
};
export type RealDevRequest = {
 id:string; status:'pending'|'approved'|'changes_requested'; student:Record<string,string>;
 plan_name:string;teacher_name:string;group_name:string|null;monthly_amount:number;
 accepted_at:string;enrollment_id:string|null; student_id:string|null;
};
export async function createRealDevOffer(input:{
 modelId:TermModelId;teacherId:string;planId:string;groupId:string|null;startDate:string;
 enrollmentDate:string;dueDay:number;monthlyAmount:number;term:TermDraft;
}):Promise<string>{
 requireDev();
 const {data,error}=await supabase.rpc('eavra_dev_create_enrollment_offer',{
 p_model_id:input.modelId,p_teacher_id:input.teacherId,p_plan_id:input.planId,p_group_id:input.groupId,
 p_start_date:input.startDate,p_enrollment_date:input.enrollmentDate,p_due_day:input.dueDay,
 p_monthly_amount:input.monthlyAmount,p_term_title:input.term.title,p_term_body:input.term.body
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
export async function approveRealDevRequest(id:string):Promise<{student_id:string;enrollment_id:string}>{
 requireDev();
 const {data,error}=await supabase.rpc('eavra_dev_approve_enrollment',{p_submission_id:id});
 if(error)throw error;
 if(!data?.approved)throw new Error('Aprovação não confirmada');
 return {student_id:data.student_id,enrollment_id:data.enrollment_id};
}
