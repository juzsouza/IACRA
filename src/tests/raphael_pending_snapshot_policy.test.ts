import assert from 'node:assert/strict';
import { shouldRecalculatePendingRaphaelSnapshot as should } from '../utils/raphaelPendingSnapshotPolicy';

const legacy = {
 status:'pending', is_frozen:false, transaction_id:null,
 metadata:{source:'due_competence_materializer',raphaelBilling:{regularLessons:7,extraLessons:5,finalAmount:1050}},
};
assert.equal(should(legacy as any, false), true, 'legacy pending must recompute');
assert.equal(should({...legacy,is_frozen:true} as any, false), false);
assert.equal(should({...legacy,status:'paid'} as any, true), false);
assert.equal(should({...legacy,transaction_id:'receipt-id'} as any, false), false);
assert.equal(should({...legacy,metadata:{source:'manual_adjustment'}} as any,false), false);
assert.equal(should(null,false),false);
console.log('OK: only automatic, unfrozen pending billing snapshot can be recalculated');
