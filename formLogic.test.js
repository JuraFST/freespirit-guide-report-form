import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFreeTourFields, validatePaidTourFields, buildSubmissionPayload } from './formLogic.js';

test('validateFreeTourFields rejects unknown language', () => {
  var errors = validateFreeTourFields(
    { language: 'fra', pax: '2', date: '2026-09-20', time: '10:00' },
    ['eng', 'esp'],
    ['10:00']
  );
  assert.equal(errors.language, 'Pick a language.');
});

test('validateFreeTourFields rejects non-positive pax', () => {
  var errors = validateFreeTourFields(
    { language: 'eng', pax: '0', date: '2026-09-20', time: '10:00' },
    ['eng', 'esp'],
    ['10:00']
  );
  assert.equal(errors.pax, 'Pax must be a positive whole number.');
});

test('validateFreeTourFields rejects a time outside the allowed slots', () => {
  var errors = validateFreeTourFields(
    { language: 'eng', pax: '2', date: '2026-09-20', time: '10:15' },
    ['eng', 'esp'],
    ['10:00', '10:30']
  );
  assert.equal(errors.time, 'Pick a time.');
});

test('validateFreeTourFields accepts a fully valid set with no errors', () => {
  var errors = validateFreeTourFields(
    { language: 'eng', pax: '4', date: '2026-09-20', time: '10:00' },
    ['eng', 'esp'],
    ['10:00']
  );
  assert.deepEqual(errors, {});
});

test('buildSubmissionPayload passes through tour and coerces pax to a number', () => {
  var payload = buildSubmissionPayload({
    accessToken: 'tok123', city: 'zg', name: 'Darko Crnolatac', tour: 'free',
    language: 'eng', pax: '4', date: '2026-09-20', time: '10:00',
  });
  assert.equal(payload.tour, 'free');
  assert.equal(payload.pax, 4);
  assert.equal(typeof payload.pax, 'number');
});

test('buildSubmissionPayload includes channels and noShow for a paid tour', () => {
  var payload = buildSubmissionPayload({
    accessToken: 'tok123', city: 'zg', name: 'Darko Crnolatac', tour: 'krka',
    language: 'eng', pax: '10', date: '2026-09-20', time: '10:00',
    channels: { web: '4', viator: '6' }, noShow: '1',
  });
  assert.equal(payload.tour, 'krka');
  assert.deepEqual(payload.channels, { web: '4', viator: '6' });
  assert.equal(payload.noShow, '1');
});

test('buildSubmissionPayload omits channels and noShow for a free tour', () => {
  var payload = buildSubmissionPayload({
    accessToken: 'tok123', city: 'zg', name: 'Darko Crnolatac', tour: 'free',
    language: 'eng', pax: '4', date: '2026-09-20', time: '10:00',
  });
  assert.equal('channels' in payload, false);
  assert.equal('noShow' in payload, false);
});

test('buildSubmissionPayload includes photo when provided', () => {
  var payload = buildSubmissionPayload({
    accessToken: 'tok123', city: 'zg', name: 'Darko Crnolatac', tour: 'free',
    language: 'eng', pax: '4', date: '2026-09-20', time: '10:00',
    photo: { data: 'AAAA', mimeType: 'image/jpeg', filename: 'x.jpg' },
  });
  assert.deepEqual(payload.photo, { data: 'AAAA', mimeType: 'image/jpeg', filename: 'x.jpg' });
});

test('validatePaidTourFields rejects unknown language', () => {
  var errors = validatePaidTourFields(
    { language: 'xyz', date: '2026-09-20', time: '10:00', pax: '10', channels: { web: '10' } },
    ['eng', 'esp', 'fra'], ['10:00'], ['web', 'viator']
  );
  assert.equal(errors.language, 'Pick a language.');
});

test('validatePaidTourFields rejects when no channel has pax', () => {
  var errors = validatePaidTourFields(
    { language: 'eng', date: '2026-09-20', time: '10:00', pax: '10', channels: {} },
    ['eng'], ['10:00'], ['web', 'viator']
  );
  assert.equal(errors.channels, 'Enter at least one channel pax.');
});

test('validatePaidTourFields rejects when channel pax does not sum to stated pax', () => {
  var errors = validatePaidTourFields(
    { language: 'eng', date: '2026-09-20', time: '10:00', pax: '10', channels: { web: '4', viator: '5' } },
    ['eng'], ['10:00'], ['web', 'viator']
  );
  assert.equal(errors.channels, 'Channel pax must add up to the total Pax.');
});

test('validatePaidTourFields accepts a fully valid set with no errors', () => {
  var errors = validatePaidTourFields(
    { language: 'eng', date: '2026-09-20', time: '10:00', pax: '10', channels: { web: '4', viator: '6' } },
    ['eng'], ['10:00'], ['web', 'viator']
  );
  assert.deepEqual(errors, {});
});
