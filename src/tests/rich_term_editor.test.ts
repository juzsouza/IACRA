import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isRichTerm,richTermFromEditor,termToSafeHtml,RICH_TERM_PREFIX} from '../utils/richTermMarkup';
import {validTermForIssue} from '../utils/enrollmentTermModels';

const legacy='A instituição oferece **duas aulas** mensais.\nConforme o contrato.';
assert.equal(isRichTerm(legacy),false);
assert.equal(termToSafeHtml(legacy),'A instituição oferece <strong>duas aulas</strong> mensais.<br>Conforme o contrato.');
assert.ok(validTermForIssue({title:'Termo original',body:legacy}));
assert.ok(!validTermForIssue({title:'Termo',body:'** **'}));
assert.equal(isRichTerm(RICH_TERM_PREFIX+'<p>Teste</p>'),true);
assert.ok(!validTermForIssue({title:'Termo',body:'a'.repeat(20001)}));

const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
const admin=read('../views/DigitalEnrollmentAdmin.tsx');
const student=read('../views/PublicEnrollment.tsx');
const receipt=read('../utils/enrollmentReceipt.ts');
const editor=read('../components/RichTermEditor.tsx');
const sanitize=read('../utils/richTermMarkup.ts');
assert.match(admin,/<RichTermEditor/);
assert.match(admin,/termToSafeHtml\(audit\.term_body\)/);
assert.match(student,/termToSafeHtml\(offer\.term_body\)/);
assert.match(receipt,/termToSafeHtml\(audit\.term_body/);
for(const command of ['bold','italic','underline','justifyCenter','insertOrderedList','insertUnorderedList','fontSize','fontName','foreColor']){
 assert.ok(editor.includes(command),'editor command missing: '+command);
}
for(const blocked of ['script','iframe','svg','img','form','input']){
 assert.ok(sanitize.includes("'"+blocked+"'"),'blocked tag missing: '+blocked);
}
assert.match(sanitize,/allowedElements\.has\(tag\)/);
assert.match(sanitize,/escapeHtml\(html\)/);
assert.match(sanitize,/RICH_TERM_PREFIX/);
assert.ok(typeof richTermFromEditor==='function');
console.log('PASS: editor wiring, legacy terms, safe rendering and receipt formatting');
