/**
 * Validação pública alinhada aos limites do RPC eavra_dev_submit_enrollment.
 * Não substitui a validação no banco.
 */
export type EnrollmentStudentFields = {
  name:string; email:string; phone:string; cpf:string; birth_date:string; instrument:string;
  guardian_name:string; guardian_email:string; guardian_phone:string;
  guardian_relationship:string; guardian_cpf:string;
};
export type EnrollmentInputError = {field:keyof EnrollmentStudentFields;message:string};
const onlyDigits=(s:string)=>s.replace(/\D/g,'');
const emailOk=(s:string)=>s.trim().length>=6 && s.trim().length<=150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const validBirth=(s:string)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+'T12:00:00Z');
  if(Number.isNaN(d.valueOf()) || d.toISOString().slice(0,10)!==s)return false;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return s>='1900-01-01'&&s<=today;
};
export function validateEnrollmentStudent(v:EnrollmentStudentFields,isMinor:boolean):EnrollmentInputError|null {
 const name=v.name.trim(),email=v.email.trim(),instrument=v.instrument.trim();
 if(name.length<3||name.length>120)return {field:'name',message:'Informe o nome completo do aluno (3 a 120 caracteres).'};
 if(!emailOk(email))return {field:'email',message:'Informe um e-mail válido para o aluno.'};
 if(onlyDigits(v.phone).length<10||onlyDigits(v.phone).length>15)return {field:'phone',message:'Informe o telefone do aluno com DDD (10 a 15 números).'};
 if(onlyDigits(v.cpf).length!==11)return {field:'cpf',message:'Informe os 11 números do CPF do aluno.'};
 if(!validBirth(v.birth_date))return {field:'birth_date',message:'Informe uma data de nascimento válida.'};
 if(instrument.length<2||instrument.length>120)return {field:'instrument',message:'Informe a atividade ou instrumento do aluno.'};
 if(isMinor){
  if(v.guardian_name.trim().length<3)return {field:'guardian_name',message:'Informe o nome completo do responsável legal.'};
  if(v.guardian_relationship.trim().length<2||v.guardian_relationship.trim().length>60)return {field:'guardian_relationship',message:'Informe o vínculo do responsável com o aluno.'};
  if(!emailOk(v.guardian_email))return {field:'guardian_email',message:'Informe um e-mail válido para o responsável.'};
  if(onlyDigits(v.guardian_phone).length<10||onlyDigits(v.guardian_phone).length>15)return {field:'guardian_phone',message:'Informe o telefone do responsável com DDD.'};
 }
 if(v.guardian_cpf.trim()&&onlyDigits(v.guardian_cpf).length!==11)return {field:'guardian_cpf',message:'Informe os 11 números do CPF do responsável ou deixe esse campo em branco.'};
 return null;
}
