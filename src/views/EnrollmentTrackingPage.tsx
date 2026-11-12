import React,{useState} from 'react';
import {EnrollmentInvitationTracking} from '../components/EnrollmentInvitationTracking';
import {EnrollmentSuccess} from '../components/EnrollmentSuccess';
import {openEnrollmentReceipt} from '../utils/enrollmentReceipt';
import {readTrackingApprovedRequest,readDigitalTermAudit,type DigitalRequest,type DigitalTermAudit} from '../services/digitalEnrollment';

export function EnrollmentTrackingPage({canMarkSent,onNavigate}:{canMarkSent:boolean;onNavigate:(view:'students'|'enrollments')=>void}):React.ReactElement{
 const [approved,setApproved]=useState<DigitalRequest|null>(null);
 const [audit,setAudit]=useState<DigitalTermAudit|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const showConfirmation=async(id:string)=>{
  setBusy(true);setNotice('');setApproved(null);setAudit(null);
  try{
   const match=await readTrackingApprovedRequest(id);
   if(!match||match.status!=='approved'||!match.student_id||!match.enrollment_id)throw new Error('Confirmação não encontrada. A matrícula permanece registrada no sistema.');
   setApproved(match);
  }catch(e){setNotice(e instanceof Error?e.message:'Não foi possível consultar a matrícula');}
  finally{setBusy(false);}
 };
 const printReceipt=async()=>{
  if(!approved)return;
  setBusy(true);setNotice('');
  try{
   const result=audit||await readDigitalTermAudit(approved.id);
   setAudit(result);
   openEnrollmentReceipt(approved,result);
  }catch(e){setNotice(e instanceof Error?e.message:'Não foi possível emitir o comprovante');}
  finally{setBusy(false);}
 };
 return <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-3">
  <EnrollmentInvitationTracking canMarkSent={canMarkSent} revision={0} onShowConfirmation={id=>void showConfirmation(id)}/>
  {busy&&!approved&&<p role="status" className="text-sm">Consultando matrícula…</p>}
  {notice&&<p role="alert" className="text-sm text-amber-800">{notice}</p>}
  {approved&&<div className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-6 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Confirmação da matrícula">
   <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-xl p-3 sm:p-5 space-y-3">
    <div className="flex justify-between items-center gap-3"><h2 className="font-bold text-lg">Confirmação da matrícula</h2>
     <button type="button" className="border rounded-lg px-3 py-2" onClick={()=>{setApproved(null);setAudit(null);}}>Fechar</button>
    </div>
    <EnrollmentSuccess request={approved} onNavigate={onNavigate}/>
    <button type="button" disabled={busy} className="border border-indigo-200 text-indigo-800 rounded-lg px-3 py-2 disabled:opacity-50" onClick={()=>void printReceipt()}>Emitir comprovante em PDF</button>
    {notice&&<p role="alert" className="text-sm text-amber-800">{notice}</p>}
   </div>
  </div>}
 </main>;
}
