import { CONFIG } from './config.js';
import { validateFreeTourFields, validatePaidTourFields, buildSubmissionPayload, flowForTour, sumCosts, buildMySalesRequest, buildMyReviewsRequest, formatReviewDelta, monthStats, formatSaleDate } from './formLogic.js';

var state = { city: null, name: null, tour: null, language: null, paidLanguage: null };

var STEP_NUMBERS = {
  'step-city': 1,
  'step-name': 2,
  'step-tour': 3,
  'step-details-free': 4,
  'step-details-paid': 4,
};
var TOTAL_STEPS = 4;
var stepHistory = ['step-city'];
var backButtonVisible = false;
var titleIconVisible = false;
var backButtonRevealTimer = null;
var titleIconRevealTimer = null;

// Slides the back button in from the left the first time it appears, and
// back out to the left (retracing the same path) when stepHistory drops
// back to the first step, instead of the old instant visibility toggle.
// No-ops on steps where it's already showing (step 2 -> 3 -> 4), so it
// only animates at the true boundary.
function updateBackButton_() {
  var shouldShow = stepHistory.length > 1;
  if (shouldShow === backButtonVisible) return;
  backButtonVisible = shouldShow;
  var btn = document.getElementById('back-button');
  clearTimeout(backButtonRevealTimer);
  if (shouldShow) {
    btn.style.transition = 'none';
    btn.style.transform = 'translateX(-14px)';
    btn.style.opacity = '0';
    void btn.offsetWidth; // force reflow so the left start position applies before animating in
    btn.style.transition = '';
    btn.style.visibility = 'visible';
    // Held for a beat before sliding in, so it doesn't compete with the
    // step's own fade-in for attention.
    backButtonRevealTimer = setTimeout(function () {
      btn.style.pointerEvents = 'auto';
      btn.style.transform = 'translateX(0)';
      btn.style.opacity = '1';
    }, 200);
  } else {
    btn.style.pointerEvents = 'none';
    btn.style.transform = 'translateX(-14px)';
    btn.style.opacity = '0';
    // After the slide-out finishes, drop it from the tab order.
    backButtonRevealTimer = setTimeout(function () { btn.style.visibility = 'hidden'; }, 250);
  }
}

var CITY_ICONS = {
  zg: 'city-icons/zagreb.png',
  du: 'city-icons/dubrovnik.png',
  zd: 'city-icons/zadar.png',
  st: 'city-icons/split.png',
};

// Shows the chosen city's landmark icon on the "Tour Log" title row, once a
// city has been picked. Hidden back on step-city itself (in case a
// different city gets picked) and on step-result, where the title becomes
// "Logged! :)". Mirrors updateBackButton_'s slide, but from/to the right,
// since the icon sits on the opposite side of the header — and likewise
// only animates at the true show/hide boundary, not on every step.
function updateTitleCityIcon_(show) {
  var src = show && CITY_ICONS[state.city];
  var shouldShow = !!src;
  if (shouldShow === titleIconVisible) return;
  titleIconVisible = shouldShow;
  var icon = document.getElementById('title-city-icon');
  clearTimeout(titleIconRevealTimer);
  if (!shouldShow) cancelCityFlight_();
  if (shouldShow) {
    icon.src = src;
    icon.alt = state.city;
    if (cityFlight) return; // landCityIcon_ reveals it when the flight ends
    icon.style.transition = 'none';
    icon.style.transform = 'translateX(14px)';
    icon.style.opacity = '0';
    void icon.offsetWidth; // force reflow so the right start position applies before animating in
    icon.style.transition = '';
    titleIconRevealTimer = setTimeout(function () {
      icon.style.transform = 'translateX(0)';
      icon.style.opacity = '0.4';
    }, 400);
  } else {
    icon.style.transition = '';
    icon.style.transform = 'translateX(14px)';
    icon.style.opacity = '0';
  }
}

// Fly-to-title: when a city is tapped, its landmark lifts off the button and
// lands on the title icon's spot (FLIP: a fixed clone animated with
// transform/opacity only). The buttons fade for the first FLY_SWAP_MS, then
// the step changes under the moving icon; on landing the real title icon
// takes over in the same frame. Reduced motion skips the flight entirely.
var FLY_MS = 440;
var FLY_SWAP_MS = 140;
var cityFlight = null;
var CITY_ICON_ASPECT = {};

function preloadCityIcons_() {
  Object.keys(CITY_ICONS).forEach(function (code) {
    var img = new Image();
    img.onload = function () { CITY_ICON_ASPECT[code] = img.naturalWidth / img.naturalHeight; };
    img.src = CITY_ICONS[code];
  });
}

function cancelCityFlight_() {
  if (!cityFlight) return;
  clearTimeout(cityFlight.swapTimer);
  cityFlight.animation.cancel();
  cityFlight.flyer.remove();
  cityFlight.container.classList.remove('flying');
  cityFlight = null;
}

function landCityIcon_() {
  var icon = document.getElementById('title-city-icon');
  if (titleIconVisible) {
    icon.style.transition = 'none';
    icon.style.transform = 'translateX(0)';
    icon.style.opacity = '0.4';
    void icon.offsetWidth; // apply the landed state before re-enabling the transition
    icon.style.transition = '';
  }
  cityFlight.flyer.remove();
  cityFlight = null;
}

function pickCity_(btn, code) {
  if (cityFlight) return;
  var aspect = CITY_ICON_ASPECT[code];
  if (!aspect || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    selectCity(code);
    return;
  }
  var container = btn.parentElement;
  var r = btn.getBoundingClientRect();
  var t = document.getElementById('page-title').getBoundingClientRect();
  var endH = parseFloat(getComputedStyle(document.getElementById('title-city-icon')).height);
  var end = { w: endH * aspect, h: endH };
  end.x = t.right - end.w;
  end.y = t.top + (t.height - endH) / 2;
  // The watermark is the button's padding box, right-aligned, full height.
  var startH = r.height - 2;
  var start = { w: startH * aspect, h: startH };
  start.x = r.right - 1 - start.w;
  start.y = r.top + 1;

  var flyer = document.createElement('img');
  flyer.className = 'city-flyer';
  flyer.alt = '';
  flyer.src = CITY_ICONS[code];
  flyer.style.left = end.x + 'px';
  flyer.style.top = end.y + 'px';
  flyer.style.width = end.w + 'px';
  flyer.style.height = end.h + 'px';
  document.body.appendChild(flyer);
  var animation = flyer.animate([
    {
      transform: 'translate(' + (start.x - end.x) + 'px, ' + (start.y - end.y) + 'px) scale(' + (start.h / end.h) + ')',
      opacity: 0.25,
    },
    { transform: 'none', opacity: 0.4 },
  ], { duration: FLY_MS, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)', fill: 'forwards' });

  container.classList.add('flying');
  cityFlight = {
    flyer: flyer,
    animation: animation,
    container: container,
    swapTimer: setTimeout(function () {
      container.classList.remove('flying'); // step-city is about to be hidden
      selectCity(code);
    }, FLY_SWAP_MS),
  };
  animation.onfinish = landCityIcon_;
}

function resetTitlePosition_(titleText) {
  titleText.style.transition = 'none';
  titleText.style.transform = 'translateX(0)';
  void titleText.offsetWidth; // force reflow so the reset takes effect before re-enabling the transition
}

// The progress bar sits above Back on steps 1 to 3 and below it on step 4.
// Swapping them animates (FLIP: measure, reorder, then play from the old
// position) so the two glide past each other. The first layout, and reduced
// motion, skip the animation.
var progressBarLaidOut_ = false;
function moveProgressBar_(below) {
  var bar = document.getElementById('sticky-bar');
  var moving = [document.querySelector('.progress-track'), document.getElementById('nav-row')];
  var changed = bar.classList.contains('sticky-bar--bar-below') !== below;
  var first = moving.map(function (el) { return el.getBoundingClientRect().top; });
  bar.classList.toggle('sticky-bar--bar-below', below);
  var animate = changed && progressBarLaidOut_ && moving[0].animate &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (animate) {
    moving.forEach(function (el, i) {
      var dy = first[i] - el.getBoundingClientRect().top;
      if (dy) el.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
    });
  }
  progressBarLaidOut_ = true;
}

function showStep_(id) {
  document.querySelectorAll('.step').forEach(function (el) { el.classList.add('hidden'); });
  document.getElementById(id).classList.remove('hidden');

  var title = document.getElementById('page-title');
  var titleText = document.getElementById('page-title-text');
  var navRow = document.getElementById('nav-row');
  var progressTrack = document.querySelector('.progress-track');
  if (id === 'step-result') {
    titleText.textContent = 'Logged! :)';
    // Centered at once, no slide: a guide just wants the confirmation.
    resetTitlePosition_(titleText);
    var offset = title.clientWidth / 2 - titleText.offsetWidth / 2;
    titleText.style.transform = 'translateX(' + offset + 'px)';
    navRow.classList.add('hidden');
    progressTrack.classList.add('hidden');
    document.getElementById('tour-line').classList.add('hidden');
    document.getElementById('sticky-bar').classList.add('hidden');
    updateTitleCityIcon_(false);
    return;
  }
  titleText.textContent = 'Tour Log';
  resetTitlePosition_(titleText);
  titleText.style.transition = '';
  navRow.classList.remove('hidden');
  progressTrack.classList.remove('hidden');
  document.getElementById('sticky-bar').classList.remove('hidden');
  var tourLine = document.getElementById('tour-line');
  var tourMeta = CONFIG.tours.filter(function (t) { return t.code === state.tour; })[0];
  var onDetails = id === 'step-details-free' || id === 'step-details-paid';
  tourLine.textContent = tourMeta ? tourMeta.label : '';
  tourLine.classList.toggle('hidden', !(onDetails && tourMeta));
  moveProgressBar_(onDetails);
  updateBackButton_();
  updateTitleCityIcon_(id !== 'step-city');
  if (id === 'step-tour') {
    var cityLabel = CONFIG.cities.filter(function (c) { return c.code === state.city; })[0];
    document.getElementById('who-line-text').textContent = state.name + ' · ' + (cityLabel ? cityLabel.label : state.city);
    setTourTab_('log');
  }
  currentStepNumber_ = STEP_NUMBERS[id] || 1;
  document.getElementById('progress-label').textContent = 'Step ' + currentStepNumber_ + ' of ' + TOTAL_STEPS;
  updateProgress_();
  saveDraft_();
}

// Step 4 is one long scroll, so the bar must not read "done" on arrival: it
// starts at 3/4 and fills the last quarter as the required fields become
// valid (the same checks Submit runs). Other steps are a plain step/total.
var currentStepNumber_ = 1;
function stepFourProgress_() {
  var errors, base;
  if (!document.getElementById('step-details-free').classList.contains('hidden')) {
    errors = validateFreeTourFields(collectFreeFields_(),
      CONFIG.languages.map(function (l) { return l.code; }), CONFIG.timeSlots);
    base = ['language', 'date', 'time', 'pax'];
  } else if (!document.getElementById('step-details-paid').classList.contains('hidden')) {
    errors = validatePaidTourFields(collectPaidFields_(),
      CONFIG.allLanguages.map(function (l) { return l.code; }), CONFIG.timeSlots,
      currentChannels_().map(function (c) { return c.key; }));
    base = ['language', 'date', 'time', 'pax', 'channels'];
  } else {
    return null;
  }
  // War/food extras (sellers, payments, costs) only count while they fail.
  var extras = ['sellers', 'payments', 'costs'].filter(function (k) { return errors[k]; });
  var failing = base.filter(function (k) { return errors[k]; }).length + extras.length;
  var total = base.length + extras.length;
  return (total - failing) / total;
}

function updateProgress_() {
  var fraction = stepFourProgress_();
  var done = currentStepNumber_ - 1 + (fraction === null ? 1 : fraction);
  var pct = done / TOTAL_STEPS * 100;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.querySelector('.progress-track').setAttribute('aria-valuenow', Math.round(pct));
}

function goToStep(id) {
  stepHistory.push(id);
  showStep_(id);
}

function goBack() {
  if (stepHistory.length <= 1) return;
  stepHistory.pop();
  showStep_(stepHistory[stepHistory.length - 1]);
}

// ---- My Sales tab (step 3 only) ----
var salesWindowDays = 7;
var salesRequestId = 0;

function setTourTab_(tab, animate) {
  ['log', 'sales', 'reviews'].forEach(function (t) {
    var on = t === tab;
    document.getElementById('tab-' + t).classList.toggle('selected', on);
    document.getElementById('tab-' + t).setAttribute('aria-selected', String(on));
    document.getElementById(t + '-panel').classList.toggle('hidden', !on);
  });
  if (animate) {
    var shown = document.getElementById(tab + '-panel');
    shown.classList.remove('panel-in');
    void shown.offsetWidth; // restart the fade if the tab is tapped twice quickly
    shown.classList.add('panel-in');
  }
  // My Sales and Reviews are not steps, so the progress bar and step label go;
  // Back stays so a guide can still leave to the name picker.
  document.getElementById('sticky-bar').classList.toggle('sticky-bar--nav-only', tab !== 'log');
  if (tab === 'sales') loadSales_();
  if (tab === 'reviews') loadReviews_();
}

function setSalesWindow_(days) {
  salesWindowDays = days;
  document.getElementById('sales-window-7').classList.toggle('selected', days === 7);
  document.getElementById('sales-window-30').classList.toggle('selected', days === 30);
  loadSales_();
}

function tourLabel_(code) {
  var t = CONFIG.tours.filter(function (x) { return x.code === code; })[0];
  return t ? t.label : code;
}

function loadSales_() {
  var requestId = ++salesRequestId;
  var message = document.getElementById('sales-message');
  document.getElementById('sales-total').textContent = '';
  document.getElementById('sales-list').innerHTML = '';
  message.textContent = 'Loading...';

  // Plain string body, no custom headers: same CORS rule as the submit calls.
  fetch(CONFIG.appsScriptExecUrl, {
    method: 'POST',
    body: JSON.stringify(buildMySalesRequest(state.city, state.name, salesWindowDays)),
  })
    .then(function (res) { return res.json(); })
    .then(function (result) {
      if (requestId !== salesRequestId) return; // a newer request replaced this one
      if (!result.ok) { message.textContent = result.error || 'Could not load your sales.'; return; }
      renderSales_(result);
    })
    .catch(function (err) {
      if (requestId !== salesRequestId) return;
      console.error(err);
      message.textContent = 'Could not load your sales. Try again.';
    });
}

function renderSales_(result) {
  var message = document.getElementById('sales-message');
  var list = document.getElementById('sales-list');
  list.innerHTML = '';
  if (!result.sales.length) {
    message.textContent = 'No sales in the last ' + result.windowDays + ' days.';
    document.getElementById('sales-total').textContent = '';
    return;
  }
  message.textContent = '';
  document.getElementById('sales-total').textContent = result.totalPax + ' pax in the last ' + result.windowDays + ' days';
  result.sales.forEach(function (sale) {
    var li = document.createElement('li');
    var left = document.createElement('span');
    left.textContent = formatSaleDate(sale.date) + ' ' + tourLabel_(sale.tour);
    var meta = document.createElement('span');
    meta.className = 'sale-meta';
    meta.textContent = ' led by ' + sale.leader;
    left.appendChild(meta);
    var pax = document.createElement('span');
    pax.className = 'sale-pax';
    pax.textContent = sale.pax + ' pax';
    li.appendChild(left);
    li.appendChild(pax);
    list.appendChild(li);
  });
}

// ---- Reviews tab ----
var reviewsRequestId = 0;
var reviewsData = null;
var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Month tabs in the Review database are numbered 1..12.
function fillReviewsMonths_() {
  var select = document.getElementById('reviews-month');
  if (select.options.length) return;
  var current = new Date().getMonth() + 1;
  for (var m = 1; m <= current; m++) select.add(new Option(MONTH_NAMES[m - 1], String(m)));
  select.value = String(current);
}

function loadReviews_() {
  fillReviewsMonths_();
  var requestId = ++reviewsRequestId;
  reviewsData = null;
  clearReviewsView_();
  document.getElementById('reviews-message').textContent = 'Loading...';

  fetch(CONFIG.appsScriptExecUrl, {
    method: 'POST',
    body: JSON.stringify(buildMyReviewsRequest(state.city, state.name)),
  })
    .then(function (res) { return res.json(); })
    .then(function (result) {
      if (requestId !== reviewsRequestId) return;
      if (!result.ok) { document.getElementById('reviews-message').textContent = result.error || 'Could not load your reviews.'; return; }
      reviewsData = result;
      renderReviews_();
    })
    .catch(function (err) {
      if (requestId !== reviewsRequestId) return;
      console.error(err);
      document.getElementById('reviews-message').textContent = 'Could not load your reviews. Try again.';
    });
}

function clearReviewsView_() {
  document.getElementById('reviews-stats').textContent = '';
  document.getElementById('reviews-detail').innerHTML = '';
  document.getElementById('reviews-year').textContent = '';
  document.getElementById('reviews-strip').innerHTML = '';
}

function renderReviews_() {
  if (!reviewsData) return;
  clearReviewsView_();
  var month = Number(document.getElementById('reviews-month').value);
  var current = monthStats(reviewsData.months, month);
  var message = document.getElementById('reviews-message');

  if (!current.count) {
    message.textContent = 'No reviews this month.';
  } else {
    message.textContent = '';
    document.getElementById('reviews-stats').textContent =
      current.count + (current.count === 1 ? ' review' : ' reviews') + ', average ' + current.average.toFixed(1) + ' / 5';
    var lines = [current.fiveStarPercent + '% were 5 stars.'];
    var delta = month > 1 ? formatReviewDelta(MONTH_NAMES[month - 2], current, monthStats(reviewsData.months, month - 1)) : '';
    if (delta) lines.push(delta);
    var detail = document.getElementById('reviews-detail');
    lines.forEach(function (text) {
      var line = document.createElement('div');
      line.textContent = text;
      detail.appendChild(line);
    });
  }

  var year = reviewsData.year;
  if (year.count) {
    document.getElementById('reviews-year').textContent =
      new Date().getFullYear() + ' so far: ' + year.average.toFixed(1) + ' over ' + year.count + ' reviews';
  }
  renderReviewsStrip_(month);
}

// One column per month up to the current one: average on top, bar, month initial.
// Bars run from 3 to 5 so small differences show; the number above each bar
// keeps that honest.
function renderReviewsStrip_(selectedMonth) {
  var strip = document.getElementById('reviews-strip');
  var currentMonth = new Date().getMonth() + 1;
  for (var m = 1; m <= currentMonth; m++) {
    var stats = monthStats(reviewsData.months, m);
    var col = document.createElement('div');
    col.className = 'reviews-col' + (m === selectedMonth ? ' selected' : '');
    var value = document.createElement('span');
    value.className = 'reviews-col-value';
    value.textContent = stats.count ? stats.average.toFixed(1) : '';
    var bar = document.createElement('span');
    bar.className = 'reviews-col-bar';
    var fraction = stats.count ? Math.min(1, Math.max(0, (stats.average - 3) / 2)) : 0;
    bar.style.height = (stats.count ? 4 + Math.round(fraction * 44) : 0) + 'px';
    var label = document.createElement('span');
    label.className = 'reviews-col-label';
    label.textContent = MONTH_NAMES[m - 1].charAt(0);
    col.appendChild(value);
    col.appendChild(bar);
    col.appendChild(label);
    strip.appendChild(col);
  }
}

var DRAFT_KEY = 'freespirit-tour-log-draft';

// Snapshots everything the guide has typed into step-4 (free or paid, doesn't
// matter which is currently shown — reading both is cheap and simpler than
// tracking which one's active). Photos are deliberately excluded: they're
// base64'd already and could be a few MB, risking a quota error on
// localStorage.setItem for the rest of the draft too.
function collectDraftFields_() {
  return {
    paxFree: document.getElementById('pax-input').value,
    dateFree: document.getElementById('date-input').value,
    timeFree: document.getElementById('time-select').value,
    noteFree: document.getElementById('note-input').value,
    paidDate: document.getElementById('paid-date-input').value,
    paidTime: document.getElementById('paid-time-select').value,
    paidPax: document.getElementById('paid-pax-input').value,
    channels: currentChannels_().reduce(function (acc, c) {
      var el = document.getElementById('channel-' + c.code);
      acc[c.code] = el ? el.value : '';
      return acc;
    }, {}),
    sellers: collectSellers_(),
    payments: collectCodedInputs_(CONFIG.paymentMethods, 'payment-'),
    costs: currentCostItems_().reduce(function (acc, item) {
      var el = document.getElementById('cost-' + item.code);
      acc[item.code] = el ? el.value : '';
      return acc;
    }, {}),
    noShow: document.getElementById('no-show-input').value,
    paidNote: document.getElementById('paid-note-input').value,
  };
}

// Nothing worth saving until a city's picked, and that also keeps this from
// ever needing to run before renderChannelFields()/etc. have built the DOM
// it reads from.
function saveDraft_() {
  if (!state.city) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      state: state,
      stepHistory: stepHistory,
      fields: collectDraftFields_(),
    }));
  } catch (e) {
    // Storage full or unavailable (e.g. private browsing) — the draft
    // just won't persist; nothing else about the form is affected.
  }
}

function clearDraft_() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}

// Restores a saved draft on load, if there's one worth restoring (a city
// was picked and the guide got past step-city). Returns true if it did, so
// the caller knows whether to fall back to the normal step-city start.
function restoreDraft_() {
  var raw;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return false; }
  if (!raw) return false;
  var draft;
  try { draft = JSON.parse(raw); } catch (e) { return false; }
  var savedStep = draft.stepHistory && draft.stepHistory[draft.stepHistory.length - 1];
  if (!draft.state || !draft.state.city || !Array.isArray(draft.stepHistory) ||
      !savedStep || savedStep === 'step-city' || savedStep === 'step-result') {
    return false;
  }

  state.city = draft.state.city;
  state.name = draft.state.name;
  state.tour = draft.state.tour;
  state.language = draft.state.language;
  state.paidLanguage = draft.state.paidLanguage;

  var nameSelect = document.getElementById('name-select');
  nameSelect.innerHTML = '';
  (CONFIG.guidesByCity[state.city] || []).forEach(function (name) {
    var option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    nameSelect.appendChild(option);
  });
  if (state.name) nameSelect.value = state.name;
  if (state.tour) document.getElementById('tour-select').value = state.tour;
  if (state.language) {
    var langContainer = document.getElementById('language-buttons');
    Array.from(langContainer.children).forEach(function (b) { b.classList.remove('selected'); });
    var langBtn = langContainer.querySelector('button[data-code="' + state.language + '"]');
    if (langBtn) langBtn.classList.add('selected');
  }
  if (state.paidLanguage) {
    var paidLangContainer = document.getElementById('paid-language-buttons');
    paidLangContainer.querySelectorAll('button').forEach(function (b) { b.classList.remove('selected'); });
    var paidLangBtn = paidLangContainer.querySelector('button[data-code="' + state.paidLanguage + '"]');
    if (paidLangBtn) paidLangBtn.classList.add('selected');
  }

  renderTourDetailsFields_();
  var f = draft.fields || {};
  document.getElementById('pax-input').value = f.paxFree || '';
  document.getElementById('date-input').value = f.dateFree || '';
  if (f.timeFree) document.getElementById('time-select').value = f.timeFree;
  document.getElementById('note-input').value = f.noteFree || '';
  document.getElementById('paid-date-input').value = f.paidDate || '';
  if (f.paidTime) document.getElementById('paid-time-select').value = f.paidTime;
  document.getElementById('paid-pax-input').value = f.paidPax || '';
  document.getElementById('no-show-input').value = f.noShow || '';
  document.getElementById('paid-note-input').value = f.paidNote || '';
  Object.keys(f.channels || {}).forEach(function (code) {
    var el = document.getElementById('channel-' + code);
    if (el) el.value = f.channels[code];
  });
  (f.sellers || []).forEach(function (seller, i) {
    if (i === 0) {
      var first = document.querySelector('.seller-row');
      if (first) { first.children[0].value = seller.name; first.children[1].value = seller.pax; }
    } else {
      addSellerRow_(seller.name, seller.pax);
    }
  });
  Object.keys(f.payments || {}).forEach(function (code) {
    var el = document.getElementById('payment-' + code);
    if (el) el.value = f.payments[code];
  });
  Object.keys(f.costs || {}).forEach(function (code) {
    var el = document.getElementById('cost-' + code);
    if (el) el.value = f.costs[code];
  });
  reopenFilledFields_();
  updateChannelTotal();
  updateCostTotal();

  stepHistory = draft.stepHistory.slice();
  showStep_(savedStep);
  return true;
}

function readPhotoAsBase64_(file, callback) {
  if (!file) { callback(null); return; }
  var reader = new FileReader();
  reader.onload = function () {
    var result = reader.result; // "data:image/jpeg;base64,AAAA..."
    var commaIndex = result.indexOf(',');
    callback({
      data: result.slice(commaIndex + 1),
      mimeType: file.type,
      filename: file.name,
    });
  };
  reader.readAsDataURL(file);
}

// Invoices are shrunk before upload so several fit in one Apps Script POST.
var INVOICE_MAX_FILES = 8;
var INVOICE_MAX_SIDE = 1600;

function resizeToBase64_(file, callback) {
  var url = URL.createObjectURL(file);
  var img = new Image();
  img.onload = function () {
    var scale = Math.min(1, INVOICE_MAX_SIDE / Math.max(img.width, img.height));
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    callback({
      data: dataUrl.slice(dataUrl.indexOf(',') + 1),
      mimeType: 'image/jpeg',
      filename: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    });
  };
  // Not decodable in the browser (e.g. HEIC): send the original untouched.
  img.onerror = function () { URL.revokeObjectURL(url); readPhotoAsBase64_(file, callback); };
  img.src = url;
}

// File input with thumbnails. Keeps items = [{ thumbUrl, payload }] and calls
// onChange(items) after every add/remove. Single mode replaces the file;
// multi mode appends up to INVOICE_MAX_FILES. Files are never saved in the draft.
function setupUpload_(opts) {
  var input = document.getElementById(opts.inputId);
  var thumbs = document.getElementById(opts.thumbsId);
  var label = document.getElementById(opts.labelId);
  var items = [];

  function render() {
    thumbs.innerHTML = '';
    items.forEach(function (item, index) {
      var box = document.createElement('div');
      box.className = 'thumb';
      var img = document.createElement('img');
      img.src = item.thumbUrl;
      img.alt = item.payload.filename;
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove ' + item.payload.filename);
      remove.addEventListener('click', function () {
        URL.revokeObjectURL(item.thumbUrl);
        items.splice(index, 1);
        render();
        opts.onChange(items);
      });
      box.appendChild(img);
      box.appendChild(remove);
      thumbs.appendChild(box);
    });
    label.textContent = items.length === 0 ? 'No file chosen'
      : opts.multi ? items.length + '/' + INVOICE_MAX_FILES + ' chosen' : items[0].payload.filename;
  }

  input.addEventListener('change', function () {
    var files = Array.prototype.slice.call(input.files);
    input.value = '';
    if (!opts.multi) {
      items.forEach(function (item) { URL.revokeObjectURL(item.thumbUrl); });
      items = [];
      files = files.slice(0, 1);
    }
    files = files.slice(0, INVOICE_MAX_FILES - items.length);
    var pending = files.length;
    if (pending === 0) { render(); opts.onChange(items); return; }
    files.forEach(function (file) {
      (opts.resize ? resizeToBase64_ : readPhotoAsBase64_)(file, function (payload) {
        items.push({ thumbUrl: URL.createObjectURL(file), payload: payload });
        if (--pending === 0) { render(); opts.onChange(items); }
      });
    });
  });
}

function renderCityButtons() {
  var container = document.getElementById('city-buttons');
  preloadCityIcons_();
  CONFIG.cities.forEach(function (city) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = city.label;
    btn.dataset.code = city.code;
    btn.addEventListener('click', function () { pickCity_(btn, city.code); });
    container.appendChild(btn);
  });
}

function fillNameOptions_(code) {
  var select = document.getElementById('name-select');
  select.innerHTML = '';
  (CONFIG.guidesByCity[code] || []).forEach(function (name) {
    var option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
}

function selectCity(code) {
  state.city = code;
  fillNameOptions_(code);
  goToStep('step-name');
}

// The guide's city and name are remembered on this phone (localStorage only,
// nothing leaves the device) so later visits open on the tour step. Kept
// apart from the draft, which submitting a report clears. Guides don't
// change city, so "Not you?" (new phone owner, wrong first pick) is the only
// way back to the city step.
var GUIDE_KEY = 'freespirit-guide';

function rememberGuide_() {
  try { localStorage.setItem(GUIDE_KEY, JSON.stringify({ city: state.city, name: state.name })); } catch (e) {}
}

function startFromRememberedGuide_() {
  var saved;
  try { saved = JSON.parse(localStorage.getItem(GUIDE_KEY)); } catch (e) { return false; }
  // A guide dropped from the roster (or a changed name) falls back to the
  // normal city step rather than logging as someone who's no longer listed.
  if (!saved || (CONFIG.guidesByCity[saved.city] || []).indexOf(saved.name) === -1) return false;
  state.city = saved.city;
  state.name = saved.name;
  fillNameOptions_(saved.city);
  document.getElementById('name-select').value = saved.name;
  stepHistory = ['step-city', 'step-name', 'step-tour'];
  showStep_('step-tour');
  return true;
}

function goToTourStep() {
  state.name = document.getElementById('name-select').value;
  rememberGuide_();
  goToStep('step-tour');
}

function renderTourOptions() {
  var select = document.getElementById('tour-select');
  CONFIG.tours.forEach(function (tour) {
    var option = document.createElement('option');
    option.value = tour.code;
    option.textContent = tour.label;
    select.appendChild(option);
  });
}

function goToTourDetails() {
  state.tour = document.getElementById('tour-select').value;
  renderTourDetailsFields_();
  goToStep(state.tour === 'free' ? 'step-details-free' : 'step-details-paid');
}

function renderLanguageButtons() {
  var container = document.getElementById('language-buttons');
  CONFIG.languages.forEach(function (lang) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = lang.label;
    btn.dataset.code = lang.code;
    btn.addEventListener('click', function () {
      state.language = lang.code;
      Array.from(container.children).forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      revalidateVisibleStep_();
      saveDraft_();
    });
    container.appendChild(btn);
  });
}

// Like language, a real time has to be picked — no default, since a
// silently-wrong default (the browser otherwise shows the first option as
// selected) could get submitted unnoticed.
function addTimePlaceholder_(select) {
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select time';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);
}

function renderTimeSlots() {
  var select = document.getElementById('time-select');
  addTimePlaceholder_(select);
  CONFIG.timeSlots.forEach(function (slot) {
    var option = document.createElement('option');
    option.value = slot;
    option.textContent = slot;
    select.appendChild(option);
  });
}

// English/Español cover the overwhelming majority of paid tours, so they
// get their own full-size row; the rest render smaller in a row below.
var PAID_PRIMARY_LANGUAGES = ['eng', 'esp'];

// Rows of 3 fixed-width-to-content secondary buttons instead of one
// wrapping row, so the layout doesn't depend on the browser's wrap point
// (which gave an unbalanced 4+1 split at some widths) and buttons stay
// sized to their own text instead of stretching to fill a grid column.
var SECONDARY_ROW_SIZE = 3;

function renderPaidLanguageButtons() {
  var wrapper = document.getElementById('paid-language-buttons');
  var primaryRow = document.createElement('div');
  primaryRow.className = 'button-row';
  var secondaryLanguages = CONFIG.allLanguages.filter(function (lang) {
    return PAID_PRIMARY_LANGUAGES.indexOf(lang.code) === -1;
  });
  var secondaryRows = [];

  function makeBtn(lang) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = lang.label;
    btn.dataset.code = lang.code;
    btn.addEventListener('click', function () {
      state.paidLanguage = lang.code;
      wrapper.querySelectorAll('button').forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      revalidateVisibleStep_();
      saveDraft_();
    });
    return btn;
  }

  CONFIG.allLanguages.forEach(function (lang) {
    if (PAID_PRIMARY_LANGUAGES.indexOf(lang.code) !== -1) primaryRow.appendChild(makeBtn(lang));
  });
  secondaryLanguages.forEach(function (lang, i) {
    if (i % SECONDARY_ROW_SIZE === 0) {
      var row = document.createElement('div');
      row.className = 'button-row button-row--compact';
      secondaryRows.push(row);
    }
    secondaryRows[secondaryRows.length - 1].appendChild(makeBtn(lang));
  });

  wrapper.appendChild(primaryRow);
  secondaryRows.forEach(function (row) { wrapper.appendChild(row); });
}

function renderPaidTimeSlots() {
  var select = document.getElementById('paid-time-select');
  addTimePlaceholder_(select);
  CONFIG.timeSlots.forEach(function (slot) {
    var option = document.createElement('option');
    option.value = slot;
    option.textContent = slot;
    select.appendChild(option);
  });
}

// War and food share the same pax structure (channels + Free, Sold by,
// payment split); food adds the partner Costs on top.
function hasSellers_() {
  var flow = flowForTour(state.tour);
  return flow === 'war' || flow === 'food';
}

// Channel-pax rows for the paid-style form: generic paid uses the sales
// channels, war and food add Free. `code` is the DOM id suffix, `key` is
// what the payload/backend sees.
function currentChannels_() {
  var channels = CONFIG.salesChannels.map(function (c) { return { code: c.code, key: c.code, label: c.label }; });
  if (hasSellers_()) channels.push({ code: CONFIG.warExtraChannel.code, key: CONFIG.warExtraChannel.code, label: CONFIG.warExtraChannel.label });
  return channels;
}

function foodPartnerNames_() {
  return (CONFIG.foodPartners[state.city] || []).concat(['Other']);
}

function currentCostItems_() {
  if (flowForTour(state.tour) !== 'food') return [];
  return foodPartnerNames_().map(function (name, i) {
    return { code: 'p' + i, key: name, label: name };
  });
}

function makeNumberField_(id, labelText, step) {
  var field = document.createElement('div');
  field.className = 'field';
  var label = document.createElement('label');
  label.setAttribute('for', id);
  label.textContent = labelText;
  var input = document.createElement('input');
  if (step) {
    // type=number rejects "," on a Croatian-locale phone while the page is
    // lang="en", so decimals are plain text; "," is turned into "." as typed.
    input.type = 'text';
    input.inputMode = 'decimal';
    input.addEventListener('input', function () {
      if (input.value.indexOf(',') !== -1) input.value = input.value.replace(/,/g, '.');
    });
  } else {
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
  }
  input.placeholder = '0';
  input.id = id;
  field.appendChild(label);
  field.appendChild(input);
  return field;
}

// (Re)builds every tour-dependent block of the paid-style form. Called when
// a tour is picked and on draft restore; clears first so switching tours
// never leaves stale fields behind.
function renderTourDetailsFields_() {
  var flow = flowForTour(state.tour);
  if (flow === 'free') return;
  renderToggleGroup_('channel-buttons', 'paid-channel-fields', currentChannels_(), 'channel-',
    function (c) { return c.label.replace(/^Pax - /, ''); }, function (c) { return c.label; });

  var sellerRows = document.getElementById('seller-rows');
  sellerRows.innerHTML = '';
  if (hasSellers_()) addSellerRow_('', '');
  renderToggleGroup_('payment-buttons', 'payment-fields', hasSellers_() ? CONFIG.paymentMethods : [], 'payment-',
    function (m) { return m.label; }, function (m) { return m.label; });

  syncSellerSections_();
  document.getElementById('food-extras').classList.toggle('hidden', flow !== 'food');
  document.getElementById('invoice-field').classList.toggle('hidden', flow !== 'food');
  renderToggleGroup_('cost-buttons', 'cost-fields', currentCostItems_(), 'cost-',
    function (item) { return item.label; }, function (item) { return item.label + ' (€)'; }, '0.01');
  updateChannelTotal();
  updateCostTotal();
}

// A row of buttons, one per item. Tapping a button reveals that item's
// number field (and focuses it); fields stay open once revealed. Nothing is
// open by default.
function renderToggleGroup_(buttonsId, fieldsId, items, idPrefix, buttonLabel, fieldLabel, step) {
  var buttons = document.getElementById(buttonsId);
  var fields = document.getElementById(fieldsId);
  buttons.innerHTML = '';
  fields.innerHTML = '';
  items.forEach(function (item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'toggle-' + idPrefix + item.code;
    btn.textContent = buttonLabel(item);
    btn.addEventListener('click', function () { openToggleField_(idPrefix, item.code, true); });
    buttons.appendChild(btn);
    var field = makeNumberField_(idPrefix + item.code, fieldLabel(item), step);
    field.classList.add('field--closed');
    // "Other" amounts have no further detail field, so point at the Note.
    if (item.key === 'Other' || item.code === 'other') {
      var hint = document.createElement('p');
      hint.className = 'field-hint';
      hint.textContent = 'Add details in the Note below.';
      field.appendChild(hint);
    }
    fields.appendChild(field);
  });
}

// Sold by + Payment method only appear once the Free channel is opened,
// since they break down Pax - Free.
function syncSellerSections_() {
  var freeInput = document.getElementById('channel-free');
  var freeOpen = !!freeInput && !freeInput.parentNode.classList.contains('field--closed');
  document.getElementById('war-extras').classList.toggle('hidden', !(hasSellers_() && freeOpen));
}

function openToggleField_(idPrefix, code, focus) {
  var input = document.getElementById(idPrefix + code);
  if (!input) return;
  input.parentNode.classList.remove('field--closed');
  document.getElementById('toggle-' + idPrefix + code).classList.add('selected');
  if (idPrefix === 'channel-' && code === 'free') syncSellerSections_();
  if (focus) input.focus();
}

// After a draft restore: reopen every field that has a saved value.
function reopenFilledFields_() {
  document.querySelectorAll('.field--closed > input').forEach(function (input) {
    if (input.value === '') return;
    var m = input.id.match(/^(channel-|payment-|cost-)(.+)$/);
    if (m) openToggleField_(m[1], m[2], false);
  });
}

function addSellerRow_(name, pax) {
  var row = document.createElement('div');
  row.className = 'seller-row';
  // Sellers are guides from the same city, picked from a dropdown.
  var nameInput = document.createElement('select');
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Seller';
  nameInput.appendChild(placeholder);
  (CONFIG.guidesByCity[state.city] || []).forEach(function (guide) {
    var option = document.createElement('option');
    option.value = guide;
    option.textContent = guide;
    nameInput.appendChild(option);
  });
  nameInput.value = name;
  var paxInput = document.createElement('input');
  paxInput.type = 'number';
  paxInput.min = '0';
  paxInput.step = '1';
  paxInput.inputMode = 'numeric';
  paxInput.placeholder = '0';
  paxInput.value = pax;
  row.appendChild(nameInput);
  row.appendChild(paxInput);
  document.getElementById('seller-rows').appendChild(row);
}

function collectSellers_() {
  return Array.from(document.querySelectorAll('.seller-row')).map(function (row) {
    return { name: row.children[0].value, pax: row.children[1].value };
  });
}

// { key: rawValue } for a list of {code, key} items whose inputs are
// `idPrefix + code`.
function collectCodedInputs_(items, idPrefix) {
  var out = {};
  items.forEach(function (item) {
    var el = document.getElementById(idPrefix + item.code);
    out[item.key || item.code] = el ? el.value : '';
  });
  return out;
}

function updateCostTotal() {
  var el = document.getElementById('cost-total');
  var total = sumCosts(collectCodedInputs_(currentCostItems_(), 'cost-'));
  el.textContent = total > 0 ? 'Total costs: ' + total.toFixed(2) + ' €' : '';
}

// Live running total so a guide sees a channel-pax/Total-Pax mismatch while
// typing, instead of only after hitting Submit and reading a validation error.
function updateChannelTotal() {
  var totalEl = document.getElementById('channel-total');
  var statedPaxRaw = document.getElementById('paid-pax-input').value;
  var channelSum = currentChannels_().reduce(function (sum, channel) {
    var el = document.getElementById('channel-' + channel.code);
    var n = parseInt(el ? el.value : '', 10);
    return sum + (Number.isInteger(n) ? n : 0);
  }, 0);

  var statedPax = parseInt(statedPaxRaw, 10);
  var hasStatedPax = Number.isInteger(statedPax);
  var matches = hasStatedPax && channelSum === statedPax;
  var diff = hasStatedPax ? channelSum - statedPax : 0;
  // Words as well as color: 2 left (amber), 2 too many (red), match (green).
  totalEl.textContent = (matches ? '✓ ' : '') + channelSum + (hasStatedPax ? ' / ' + statedPax : '') + ' pax entered' +
    (diff < 0 ? ' · ' + (-diff) + ' left' : diff > 0 ? ' · ' + diff + ' too many' : '');
  totalEl.classList.toggle('channel-total--match', matches);
  totalEl.classList.toggle('channel-total--under', diff < 0);
  totalEl.classList.toggle('channel-total--over', diff > 0);

  // Sold by must add up to Pax - Free.
  var freeEl = document.getElementById('channel-free');
  var freePax = parseInt(freeEl ? freeEl.value : '', 10);
  if (!Number.isInteger(freePax)) freePax = 0;
  var sellerSum = collectSellers_().reduce(function (sum, seller) {
    var n = parseInt(seller.pax, 10);
    return sum + (Number.isInteger(n) ? n : 0);
  }, 0);
  var sellerMatches = freePax > 0 && sellerSum === freePax;
  var sellerEl = document.getElementById('seller-total');
  sellerEl.textContent = (sellerMatches ? '✓ ' : '') + sellerSum + ' / ' + freePax + ' pax entered';
  sellerEl.classList.toggle('channel-total--match', sellerMatches);
}

// message can be a single string (server/network errors) or an array (all
// validation errors at once, so a guide doesn't have to resubmit repeatedly
// to discover each missing field one at a time).
function showError(elementId, message) {
  var el = document.getElementById(elementId);
  var lines = Array.isArray(message) ? message : [message];
  el.textContent = lines.join('\n');
  el.classList.remove('hidden');
}

function hideError(elementId) {
  document.getElementById(elementId).classList.add('hidden');
}

var FREE_ERROR_FIELDS = {
  language: 'language-buttons',
  pax: 'pax-input',
  date: 'date-input',
  time: 'time-select',
};
var PAID_ERROR_FIELDS = {
  language: 'paid-language-buttons',
  date: 'paid-date-input',
  time: 'paid-time-select',
  pax: 'paid-pax-input',
  channels: 'channel-buttons',
  sellers: 'seller-rows',
  payments: 'payment-buttons',
  costs: 'cost-buttons',
};

function clearFieldErrors_(fieldMap) {
  Object.keys(fieldMap).forEach(function (key) {
    document.getElementById(fieldMap[key]).classList.remove('field-invalid');
  });
}

function updateFieldErrorMarks_(fieldMap, errorKeys) {
  clearFieldErrors_(fieldMap);
  errorKeys.forEach(function (key) {
    var id = fieldMap[key];
    if (id) document.getElementById(id).classList.add('field-invalid');
  });
}

// Marks each offending field with a red border/outline and focuses (or, for
// button-group fields that can't take focus, scrolls to) the first one, so a
// guide doesn't have to read the error text below the form then hunt for
// which field it means.
function applyFieldErrors_(fieldMap, errorKeys) {
  updateFieldErrorMarks_(fieldMap, errorKeys);
  var firstId = fieldMap[errorKeys[0]];
  var firstEl = firstId && document.getElementById(firstId);
  if (!firstEl) return;
  if (firstEl.tagName === 'INPUT' || firstEl.tagName === 'SELECT') {
    firstEl.focus();
  } else {
    firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function collectFreeFields_() {
  return {
    language: state.language,
    pax: document.getElementById('pax-input').value,
    date: document.getElementById('date-input').value,
    time: document.getElementById('time-select').value,
    note: document.getElementById('note-input').value,
  };
}

function collectPaidFields_() {
  var flow = flowForTour(state.tour);
  var channels = collectCodedInputs_(currentChannels_(), 'channel-');
  return {
    sellers: hasSellers_() ? collectSellers_() : undefined,
    payments: hasSellers_() ? collectCodedInputs_(CONFIG.paymentMethods, 'payment-') : undefined,
    costs: flow === 'food' ? collectCodedInputs_(currentCostItems_(), 'cost-') : undefined,
    language: state.paidLanguage,
    date: document.getElementById('paid-date-input').value,
    time: document.getElementById('paid-time-select').value,
    pax: document.getElementById('paid-pax-input').value,
    channels: channels,
    noShow: document.getElementById('no-show-input').value,
    note: document.getElementById('paid-note-input').value,
  };
}

// Re-runs validation for whichever tour-details step is currently visible
// and refreshes both the field marks and the error text together, so the
// two never drift out of sync as a guide fixes fields one at a time. Only
// acts once a step's error block is already showing (i.e. a Submit was
// already attempted) — it never surfaces errors on a first pass through
// untouched fields.
function revalidateVisibleStep_() {
  updateProgress_(); // every field pick and edit lands here, so the bar follows the data
  if (!document.getElementById('step-details-free').classList.contains('hidden')) {
    if (document.getElementById('details-error').classList.contains('hidden')) return;
    var fields = collectFreeFields_();
    var errors = validateFreeTourFields(
      fields,
      CONFIG.languages.map(function (l) { return l.code; }),
      CONFIG.timeSlots
    );
    var errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      showError('details-error', errorKeys.map(function (k) { return errors[k]; }));
      updateFieldErrorMarks_(FREE_ERROR_FIELDS, errorKeys);
    } else {
      hideError('details-error');
      clearFieldErrors_(FREE_ERROR_FIELDS);
    }
  } else if (!document.getElementById('step-details-paid').classList.contains('hidden')) {
    if (document.getElementById('paid-details-error').classList.contains('hidden')) return;
    var paidFields = collectPaidFields_();
    var paidErrors = validatePaidTourFields(
      paidFields,
      CONFIG.allLanguages.map(function (l) { return l.code; }),
      CONFIG.timeSlots,
      currentChannels_().map(function (c) { return c.key; })
    );
    var paidErrorKeys = Object.keys(paidErrors);
    if (paidErrorKeys.length > 0) {
      showError('paid-details-error', paidErrorKeys.map(function (k) { return paidErrors[k]; }));
      updateFieldErrorMarks_(PAID_ERROR_FIELDS, paidErrorKeys);
    } else {
      hideError('paid-details-error');
      clearFieldErrors_(PAID_ERROR_FIELDS);
    }
  }
}

function firstName_(fullName) {
  return String(fullName || '').trim().split(' ')[0];
}

// html: trusted — always built from CONFIG.guidesByCity's fixed guide list,
// never free-typed user input, so innerHTML (needed for the bolded name) is safe.
function showResult(html) {
  goToStep('step-result');
  document.getElementById('result-message').innerHTML = html;
}

function formatIsoDate_(isoDate) {
  var match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  return match[3] + '.' + match[2] + '.' + match[1] + '.';
}

// pax/date: trusted, already validated by validateFreeTourFields/
// validatePaidTourFields before this is called.
// "Web 4 · Airbnb 3" for the non-zero channels of a paid tour, so the guide can
// spot-check what they entered. Labels come from CONFIG, never typed input.
function channelSplit_(channels) {
  if (!channels) return '';
  var parts = currentChannels_().filter(function (c) {
    return parseInt(channels[c.key], 10) > 0;
  }).map(function (c) {
    return c.label.replace(/^Pax - /, '') + ' <strong>' + parseInt(channels[c.key], 10) + '</strong>';
  });
  return parts.length ? '<span class="result-detail">' + parts.join(' &middot; ') + '</span>' : '';
}

function buildResultMessage_(pax, date, channels) {
  var tour = CONFIG.tours.filter(function (t) { return t.code === state.tour; })[0];
  var tourLabel = tour ? tour.label : state.tour;
  var city = CONFIG.cities.filter(function (c) { return c.code === state.city; })[0];
  return 'Thanks, <strong>' + firstName_(state.name) + '</strong>! Your tour was logged. Nice work.' +
    '<span class="result-detail"><strong>' + tourLabel + '</strong> tour &middot; <strong>' + (city ? city.label : state.city) +
    '</strong> &middot; <strong>' + pax + '</strong> pax &middot; <strong>' + formatIsoDate_(date) + '</strong></span>' +
    channelSplit_(channels) +
    '<span class="result-detail">A confirmation email is on its way.</span>';
}

// Busy state for a Submit button: a spinner in the (still dark) button, and a
// "do not tap again" note if the response takes more than a few seconds. The
// note is the element right after the button.
var slowSubmitTimers_ = {};
function setSubmitting_(button, on) {
  var note = button.nextElementSibling;
  clearTimeout(slowSubmitTimers_[button.id]);
  button.disabled = on;
  button.classList.toggle('is-submitting', on);
  if (on) {
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Submitting…';
    slowSubmitTimers_[button.id] = setTimeout(function () { note.classList.remove('hidden'); }, 4000);
  } else {
    button.textContent = 'Submit';
    note.classList.add('hidden');
  }
}

function handleSubmit() {
  hideError('details-error');
  var fields = collectFreeFields_();
  var errors = validateFreeTourFields(
    fields,
    CONFIG.languages.map(function (l) { return l.code; }),
    CONFIG.timeSlots
  );
  var errorKeys = Object.keys(errors);
  if (errorKeys.length > 0) {
    showError('details-error', errorKeys.map(function (k) { return errors[k]; }));
    applyFieldErrors_(FREE_ERROR_FIELDS, errorKeys);
    return;
  }
  clearFieldErrors_(FREE_ERROR_FIELDS);

  var payload = buildSubmissionPayload({
    city: state.city,
    name: state.name,
    tour: state.tour,
    language: fields.language,
    pax: fields.pax,
    date: fields.date,
    time: fields.time,
    note: fields.note,
    photo: state.photo,
  });

  var submitButton = document.getElementById('submit-button');
  setSubmitting_(submitButton, true);

  // No custom headers here on purpose — setting Content-Type: application/json
  // triggers a CORS preflight (OPTIONS) that an Apps Script Web App doesn't
  // answer. A plain string body defaults to text/plain, which is
  // CORS-safelisted and avoids the preflight entirely.
  fetch(CONFIG.appsScriptExecUrl, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
    .then(function (res) { return res.json(); })
    .then(function (result) {
      if (result.ok) {
        clearDraft_();
        showResult(buildResultMessage_(fields.pax, fields.date));
      } else {
        setSubmitting_(submitButton, false);
        showError('details-error', result.error || 'Submission failed, try again.');
      }
    })
    .catch(function (err) {
      setSubmitting_(submitButton, false);
      console.error(err);
      showError('details-error', 'We could not confirm your report went through. Do not send it again yet. If a confirmation email has arrived, it was received. If not, wait a minute, then submit again.');
    });
}

function handlePaidSubmit() {
  hideError('paid-details-error');
  var fields = collectPaidFields_();
  var errors = validatePaidTourFields(
    fields,
    CONFIG.allLanguages.map(function (l) { return l.code; }),
    CONFIG.timeSlots,
    currentChannels_().map(function (c) { return c.key; })
  );
  var errorKeys = Object.keys(errors);
  if (errorKeys.length > 0) {
    showError('paid-details-error', errorKeys.map(function (k) { return errors[k]; }));
    applyFieldErrors_(PAID_ERROR_FIELDS, errorKeys);
    return;
  }
  clearFieldErrors_(PAID_ERROR_FIELDS);

  var payload = buildSubmissionPayload({
    city: state.city,
    name: state.name,
    tour: state.tour,
    language: fields.language,
    pax: fields.pax,
    date: fields.date,
    time: fields.time,
    note: fields.note,
    channels: fields.channels,
    noShow: fields.noShow,
    sellers: fields.sellers,
    payments: fields.payments,
    costs: fields.costs,
    photo: state.paidPhoto,
    invoices: state.invoices,
  });

  var submitButton = document.getElementById('paid-submit-button');
  setSubmitting_(submitButton, true);

  fetch(CONFIG.appsScriptExecUrl, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
    .then(function (res) { return res.json(); })
    .then(function (result) {
      if (result.ok) {
        clearDraft_();
        showResult(buildResultMessage_(fields.pax, fields.date, fields.channels));
      } else {
        setSubmitting_(submitButton, false);
        showError('paid-details-error', result.error || 'Submission failed, try again.');
      }
    })
    .catch(function (err) {
      setSubmitting_(submitButton, false);
      console.error(err);
      showError('paid-details-error', 'We could not confirm your report went through. Do not send it again yet. If a confirmation email has arrived, it was received. If not, wait a minute, then submit again.');
    });
}

function formatTodayDate_() {
  var d = new Date();
  var day = String(d.getDate()).padStart(2, '0');
  var month = String(d.getMonth() + 1).padStart(2, '0');
  return day + '.' + month + '.' + d.getFullYear() + '.';
}

document.getElementById('today-date').textContent = formatTodayDate_();
renderCityButtons();
renderLanguageButtons();
renderTimeSlots();
renderTourOptions();
renderPaidLanguageButtons();
renderPaidTimeSlots();
document.getElementById('name-continue').addEventListener('click', goToTourStep);
document.getElementById('tour-continue').addEventListener('click', goToTourDetails);
document.getElementById('tab-log').addEventListener('click', function () { setTourTab_('log', true); });
document.getElementById('tab-sales').addEventListener('click', function () { setTourTab_('sales', true); });
document.getElementById('tab-reviews').addEventListener('click', function () { setTourTab_('reviews', true); });
document.getElementById('reviews-month').addEventListener('change', renderReviews_);
document.getElementById('sales-window-7').addEventListener('click', function () { setSalesWindow_(7); });
document.getElementById('sales-window-30').addEventListener('click', function () { setSalesWindow_(30); });
document.getElementById('submit-button').addEventListener('click', handleSubmit);
document.getElementById('paid-submit-button').addEventListener('click', handlePaidSubmit);
document.getElementById('paid-pax-input').addEventListener('input', updateChannelTotal);
document.getElementById('add-seller-button').addEventListener('click', function () { addSellerRow_('', ''); });
document.getElementById('back-button').addEventListener('click', goBack);
['date-input', 'paid-date-input'].forEach(function (id) {
  document.getElementById(id).addEventListener('click', function () {
    if (this.showPicker) { try { this.showPicker(); } catch (e) {} }
  });
});
setupUpload_({ inputId: 'photo-input', thumbsId: 'photo-thumbs', labelId: 'photo-filename',
  multi: false, onChange: function (items) { state.photo = items[0] ? items[0].payload : null; } });
setupUpload_({ inputId: 'paid-photo-input', thumbsId: 'paid-photo-thumbs', labelId: 'paid-photo-filename',
  multi: false, onChange: function (items) { state.paidPhoto = items[0] ? items[0].payload : null; } });
setupUpload_({ inputId: 'invoice-input', thumbsId: 'invoice-thumbs', labelId: 'invoice-count',
  multi: true, resize: true, onChange: function (items) {
    state.invoices = items.map(function (item) { return item.payload; });
  } });
// Covers every typed/selected field on step 4 (pax, date, note, channel pax,
// etc.) with one listener instead of wiring each field individually — city/
// name/tour/language picks are saved separately, at their own click/step
// handlers above, since those don't fire input/change on .card.
function handleCardFieldChange_() {
  updateChannelTotal();
  updateCostTotal();
  revalidateVisibleStep_();
  saveDraft_();
}
document.querySelector('.card').addEventListener('input', handleCardFieldChange_);
document.querySelector('.card').addEventListener('change', handleCardFieldChange_);
// A reload re-runs restoreDraft_(), which refuses to restore a step-result
// draft (clearDraft_() already ran on submit success) — so this reliably
// lands back on a fresh step-city instead of hand-resetting every field.
document.getElementById('log-another-button').addEventListener('click', function () {
  location.reload();
});
document.getElementById('not-you-button').addEventListener('click', function () {
  try { localStorage.removeItem(GUIDE_KEY); } catch (e) {}
  clearDraft_(); // otherwise the reload would restore this guide's draft
  location.reload();
});
// Toggle buttons only show their state through the .selected class, so mirror
// it into aria-pressed for screen readers in one place instead of at every
// site that adds or removes the class (picks, draft restore, new nodes).
function syncAriaPressed_(btn) {
  btn.setAttribute('aria-pressed', btn.classList.contains('selected') ? 'true' : 'false');
}
var TOGGLE_BUTTONS = '.button-row:not(#city-buttons) button';
document.querySelectorAll(TOGGLE_BUTTONS).forEach(syncAriaPressed_);
new MutationObserver(function (records) {
  records.forEach(function (r) {
    if (r.type === 'attributes') {
      if (r.target.matches(TOGGLE_BUTTONS)) syncAriaPressed_(r.target);
      return;
    }
    r.addedNodes.forEach(function (n) {
      if (n.nodeType !== 1) return;
      if (n.matches(TOGGLE_BUTTONS)) syncAriaPressed_(n);
      n.querySelectorAll(TOGGLE_BUTTONS).forEach(syncAriaPressed_);
    });
  });
}).observe(document.querySelector('.card'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
if (!restoreDraft_() && !startFromRememberedGuide_()) showStep_('step-city');

// Dark mode toggle. The initial data-theme is set by the inline script in
// index.html; this only flips it and remembers the choice on this phone.
document.getElementById('theme-toggle').addEventListener('click', function () {
  var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) {}
});
