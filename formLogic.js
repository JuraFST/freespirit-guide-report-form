export function validateFreeTourFields(fields, allowedLanguages, allowedTimeSlots) {
  var errors = {};
  if (allowedLanguages.indexOf(fields.language) === -1) errors.language = 'Pick a language.';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date || '')) errors.date = 'Pick a date.';

  if (allowedTimeSlots.indexOf(fields.time) === -1) errors.time = 'Pick a time.';

  var paxNum = Number(fields.pax);
  if (!Number.isInteger(paxNum) || paxNum <= 0) errors.pax = 'Pax must be a positive whole number.';

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

  // War/food: seller rows are a breakdown of Pax - Free (not extra pax), and
  // the payment split must cover exactly the seller pax.
  var sellerSum = 0;
  var sellers = fields.sellers || [];
  for (var s = 0; s < sellers.length; s++) {
    var sellerName = String(sellers[s].name || '').trim();
    var sellerRaw = sellers[s].pax;
    if (!sellerName && (sellerRaw === undefined || sellerRaw === null || sellerRaw === '')) continue;
    var sellerPax = Number(sellerRaw === '' ? 0 : sellerRaw);
    if (!Number.isInteger(sellerPax) || sellerPax < 0) { errors.sellers = 'Seller pax must be whole numbers.'; break; }
    if (sellerPax > 0 && !sellerName) { errors.sellers = 'Each seller needs a name.'; break; }
    if (sellerPax > 0) sellerSum += sellerPax;
  }
  if (fields.sellers && !errors.sellers && sellerSum !== (Number(channels.free) || 0)) {
    errors.sellers = 'Sold by pax must add up to Pax - Free.';
  }
  if (fields.payments) {
    var paymentSum = 0;
    var paymentKeys = Object.keys(fields.payments);
    for (var k = 0; k < paymentKeys.length; k++) {
      var raw2 = fields.payments[paymentKeys[k]];
      if (raw2 === undefined || raw2 === null || raw2 === '') continue;
      var n2 = Number(raw2);
      if (!Number.isInteger(n2) || n2 < 0) { errors.payments = 'Payment pax must be whole numbers.'; break; }
      paymentSum += n2;
    }
    if (!errors.payments && paymentSum !== sellerSum) errors.payments = 'Payment method pax must add up to the Sold by pax.';
  }

  if (fields.costs) {
    var costKeys = Object.keys(fields.costs);
    for (var c = 0; c < costKeys.length; c++) {
      var rawCost = fields.costs[costKeys[c]];
      if (rawCost === undefined || rawCost === null || rawCost === '') continue;
      var cost = Number(rawCost);
      if (!isFinite(cost) || cost < 0) { errors.costs = 'Costs must be amounts in €.'; break; }
    }
  }

  if (!errors.channels && !anyChannel) errors.channels = 'Enter at least one channel pax.';
  if (!errors.channels && !errors.pax && channelSum !== statedPax) {
    var gap = statedPax - channelSum;
    errors.channels = 'Channels add up to ' + channelSum + ', Total Pax is ' + statedPax + '. ' +
      (gap > 0 ? 'Add ' + gap + ' more' : 'Remove ' + (-gap)) + ' or change Total Pax.';
  }

  return errors;
}

// Which step-4 form a tour code uses: war and food get extra sections on
// top of the generic paid form. 'war PR' stays generic paid.
export function flowForTour(tour) {
  if (tour === 'free') return 'free';
  if (tour === 'war') return 'war';
  if (tour === 'food' || tour === 'food PR') return 'food';
  return 'paid';
}

export function sumCosts(costs) {
  var total = 0;
  Object.keys(costs || {}).forEach(function (key) {
    var n = Number(costs[key]);
    if (isFinite(n) && n > 0) total += n;
  });
  return Math.round(total * 100) / 100;
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
    if (fields.sellers) payload.sellers = fields.sellers;
    if (fields.payments) payload.payments = fields.payments;
    if (fields.costs) payload.costs = fields.costs;
    if (flowForTour(fields.tour) === 'food' && fields.invoices && fields.invoices.length) {
      payload.invoices = fields.invoices;
    }
  }
  return payload;
}

export function buildMySalesRequest(city, name, windowDays) {
  return { action: 'mySales', city: city, name: name, windowDays: windowDays };
}

// 'yyyy-mm-dd' -> 'dd.mm.yyyy.' (the header date's format). Anything else is returned as-is.
export function formatSaleDate(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? m[3] + '.' + m[2] + '.' + m[1] + '.' : iso;
}
