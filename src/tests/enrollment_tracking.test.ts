import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {invitationStatus} from '../components/EnrollmentInvitationTracking';
import type {DigitalOfferTracking} from '../services/digitalEnrollment';
const now=Date.parse('2026-11-12T20:00:00Z');
const row:DigitalOfferTracking={
 id:'fictitious',created_at:'2026-11-11T12:00:00Z',expires_at:'2026-11-14T03:00:00Z',
 first_opened_at:null,sent_at:null,recipient_label:null,submitted_at:null,
 term_title:'Termo fictício',model_id:'raphael_individual',plan_name:'Individual',teacher_name:'Professor',
 group_name:null,submission_status:null,submission_id:null,student_id:null,student_name:null,enrollment_id:null,
};
assert.equal(invitationStatus(row,now),'created');
assert.equal(invitationStatus({...row,sent_at:'2026-11-12T14:00:00Z'},now),'sent');
assert.equal(invitationStatus({...row,first_opened_at:'2026-11-12T15:00:00Z'},now),'opened');
assert.equal(invitationStatus({...row,expires_at:'2026-11-12T19:00:00Z'},now),'expired');
assert.equal(invitationStatus({...row,expires_at:'2026-11-12T19:00:00Z',submitted_at:'2026-11-12T16:00:00Z'},now),'submitted');
assert.equal(invitationStatus({...row,submission_status:'approved'},now),'approved');
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf-8');
const page=read('../views/EnrollmentTrackingPage.tsx');
const publicForm=read('../views/PublicEnrollment.tsx');
const service=read('../services/digitalEnrollment.ts');
const sql=read('../../docs/revisao-producao/CANDIDATO_acompanhamento_termos_20261112.sql');
assert.match(page,/<EnrollmentInvitationTracking/);
assert.match(publicForm,/readDigitalOffer\(token\)\.then\(x=>\{if\(active\)\{setOffer\(x\);void trackDigitalOfferOpened/);
assert.match(service,/eavra_dev_track_enrollment_open/);
assert.match(service,/eavra_dev_admin_enrollment_offers/);
assert.match(sql,/first_opened_at IS NULL/);
assert.match(sql,/eavra_actor_has_feature_permission\('digital_enrollment\.view'\)/);
assert.match(sql,/eavra_actor_has_feature_permission\('digital_enrollment\.create'\)/);
assert.match(sql,/token_hash=pg_catalog\.encode/);
assert.ok(!/delete\s+from\s+app_private\.eavra_dev_enrollment_offers/i.test(sql));
console.log('PASS invitation monitoring statuses, first-open tracking and privacy protections');
