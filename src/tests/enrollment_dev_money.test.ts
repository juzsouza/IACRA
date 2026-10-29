import assert from 'node:assert/strict';
import {isValidDevMonthlyAmount,parseDevMonthlyAmount} from '../utils/enrollmentDevMoney.ts';
assert.equal(parseDevMonthlyAmount('0'),0);
assert.equal(parseDevMonthlyAmount('0.00'),0);
assert.equal(parseDevMonthlyAmount('350.50'),350.5);
for(const v of ['', '-1','abc','1.234','100000.01']) assert.equal(parseDevMonthlyAmount(v),null);
assert.equal(isValidDevMonthlyAmount(0),true);
console.log('PASS: gratuidade, valor personalizado e limites monetários');
