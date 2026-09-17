export function validateFreeTourFields(fields, allowedLanguages, allowedTimeSlots) {
  var errors = {};
  if (allowedLanguages.indexOf(fields.language) === -1) errors.language = 'Pick a language.';

  var paxNum = Number(fields.pax);
  if (!Number.isInteger(paxNum) || paxNum <= 0) errors.pax = 'Pax must be a positive whole number.';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date || '')) errors.date = 'Pick a date.';

  if (allowedTimeSlots.indexOf(fields.time) === -1) errors.time = 'Pick a time.';

  return errors;
}

export function validatePaidTourFields(fields, allowedLanguages, allowedTimeSlots, channelCodes) {
  var errors = {};
  if (allowedLanguages.indexOf(fields.language) === -1) errors.language = 'Pick a language.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date || '')) errors.date = 'Pick a date.';
  if (allowedTimeSlots.indexOf(fields.time) === -1) errors.time = 'Pick a time.';

  var statedPax = Number(fields.pax);
  if (!Number.isInteger(statedPax) || statedPax <= 0) errors.pax = 'Pax must be a positive whole number.';

  var channelSum = 0;
  var anyChannel = false;
  var channels = fields.channels || {};
  for (var i = 0; i < channelCodes.length; i++) {
    var raw = channels[channelCodes[i]];
    if (raw === undefined || raw === null || raw === '') continue;
    var n = Number(raw);
    if (!Number.isInteger(n) || n < 0) { errors.channels = 'Channel pax must be whole numbers.'; break; }
    if (n > 0) { anyChannel = true; channelSum += n; }
  }
  if (!errors.channels && !anyChannel) errors.channels = 'Enter at least one channel pax.';
  if (!errors.channels && !errors.pax && channelSum !== statedPax) {
    errors.channels = 'Channel pax must add up to the total Pax.';
  }

  return errors;
}

export function buildSubmissionPayload(fields) {
  var payload = {
    city: fields.city,
    name: fields.name,
    tour: fields.tour,
    language: fields.language,
    pax: Number(fields.pax),
    date: fields.date,
    time: fields.time,
    note: fields.note || '',
  };
  if (fields.photo) payload.photo = fields.photo;
  if (fields.tour !== 'free') {
    payload.channels = fields.channels || {};
    payload.noShow = fields.noShow || '';
  }
  return payload;
}
