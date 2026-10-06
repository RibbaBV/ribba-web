import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCbrRecovery } from '../lib/support-event-recovery.ts';
const event = (when, ok, soort = 'exams', bron = 'cbr') => ({ wanneer: when, ok, soort, bron, detail: 'melding' });
const at = n => `2026-10-04T${String(n).padStart(2,'0')}:00:00Z`;
test('historische fout toont eerste latere herstelmoment, ook bij een nieuwe storing', () => {
  const input = [event(at(18), false), event(at(16), true), event(at(15), true), event(at(14), false)];
  const output = withCbrRecovery(input);
  assert.equal(output[3].hersteldOp, at(15));
  assert.equal(output[0].hersteldOp, null);
  assert.equal(output[3].detail, 'melding');
  assert.equal(output[3].ok, false);
  assert.ok(!('hersteldOp' in input[3]));
});
test('andere bron of ander CBR-type bewijst geen herstel', () => {
  assert.equal(withCbrRecovery([event(at(14), false, 'health_check'), event(at(15), true)])[0].hersteldOp, null);
  assert.equal(withCbrRecovery([event(at(14), false, 'exams', 'webhook'), event(at(15), true)])[0].hersteldOp, null);
});
test('ontbrekende, ongeldige, gelijke en eerdere tijdstippen bewijzen geen herstel', () => {
  for (const timestamp of [null, 'ongeldig', at(13), at(14)]) {
    assert.equal(withCbrRecovery([event(at(14), false), event(timestamp, true)])[0].hersteldOp, null);
  }
  assert.equal(withCbrRecovery([event(null, false), event(at(15), true)])[0].hersteldOp, null);
});
