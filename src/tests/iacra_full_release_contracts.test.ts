import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const migrationPath = process.argv[2];
if (!migrationPath) throw new Error('Informe o caminho do SQL de homologação.');
const sql = readFileSync(migrationPath,'utf8');
const service = readFileSync(new URL('../services/digitalEnrollment.ts',import.meta.url),'utf8');
const rooms = readFileSync(new URL('../views/RoomsAdmin.tsx',import.meta.url),'utf8');
const app = readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
const model = readFileSync(new URL('../utils/enrollmentTermModels.ts',import.meta.url),'utf8');
const sources = [service,rooms];

const names = new Set(sources.flatMap(s => [...s.matchAll(/\.rpc\(\s*['"]([a-z_]+)['"]/g)].map(x=>x[1])));
const required = new Map([
 ['eavra_dev_create_enrollment_offer_with_expiry',['p_model_id','p_teacher_id','p_plan_id','p_group_id','p_start_date','p_enrollment_date','p_due_day','p_monthly_amount','p_term_title','p_term_body','p_expires_on']],
 ['eavra_dev_get_enrollment_offer',['p_token']],
 ['eavra_dev_submit_enrollment',['p_token','p_student','p_accepted']],
 ['eavra_dev_admin_enrollment_inbox',[]],
 ['eavra_dev_admin_review_student_match',['p_submission_id']],
 ['eavra_dev_approve_enrollment_review',['p_submission_id','p_update_student','p_force_new_enrollment']],
 ['eavra_dev_admin_read_term',['p_submission_id']],
 ['eavra_dev_room_overview',['p_day']],
 ['eavra_dev_room_assign',['p_class_id','p_room_slug','p_activity']],
 ['eavra_dev_room_unassign',['p_class_id']],
]);
assert.deepEqual([...names].sort(),[...required.keys()].sort(),'Todas as RPCs do frontend devem estar mapeadas');
for(const [name,args] of required){
 const def = sql.match(new RegExp('(?:create or replace function)\\s+public\\.'+name+'\\s*\\(([\\s\\S]*?)\\)\\s*returns','i'));
 assert.ok(def,'Função SQL ausente: '+name);
 const decl=def[1];
 const clientSource = sources.find(s=>s.includes(".rpc('"+name+"'"));
 assert.ok(clientSource);
 const start=clientSource.indexOf(".rpc('"+name+"'");
 // A chamada pode ter dados agrupados; verificar até o fim do bloco, nunca próxima RPC.
 const next=clientSource.indexOf('.rpc(',start+5);
 const call=clientSource.slice(start,next>=0?next:undefined);
 for(const arg of args) {
   assert.match(decl,new RegExp('\\b'+arg+'\\b'),'SQL sem argumento '+arg+' em '+name);
   assert.match(call,new RegExp('\\b'+arg+'\\s*:'),'Frontend sem argumento '+arg+' em '+name);
 }
 assert.match(sql,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+name+'\\s*\\(','i'),
   'Ausência de concessão de execução explícita para '+name);
}
assert.match(sql,/REVOKE ALL ON SCHEMA app_private FROM PUBLIC,\s*anon,\s*authenticated;/i);
assert.match(sql,/teacher_id uuid not null references public\.teachers\(id\)/i);
assert.match(sql,/student_id uuid primary key references public\.students\(id\)/i);
assert.match(sql,/min\(id::text\)::uuid/i);
assert.doesNotMatch(sql,/\b(?:delete from|truncate)\s+public\.(?:students|enrollments|transactions|competence_billings)\b/i);
assert.match(app,/iacraFeaturesEnabled\(\)\s*\?\s*<PublicEnrollment/);
assert.match(app,/currentUserProfile\?\.role === "super_admin"/);
assert.match(model,/validTermForIssue/);
console.log('PASS: 10 contratos RPC, argumentos, permissões, isolamento das tabelas e gate de produção compatíveis.');
