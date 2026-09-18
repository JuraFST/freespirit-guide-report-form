import { CONFIG } from './config.js';
import { validateFreeTourFields, validatePaidTourFields, buildSubmissionPayload } from './formLogic.js';

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
// "Upisano! :)". Mirrors updateBackButton_'s slide, but from/to the right,
// since the icon sits on the opposite side of the header — and likewise
// only animates at the true show/hide boundary, not on every step.
function updateTitleCityIcon_(show) {
  var src = show && CITY_ICONS[state.city];
  var shouldShow = !!src;
  if (shouldShow === titleIconVisible) return;
  titleIconVisible = shouldShow;
  var icon = document.getElementById('title-city-icon');
  clearTimeout(titleIconRevealTimer);
  if (shouldShow) {
    icon.src = src;
    icon.alt = state.city;
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

function resetTitlePosition_(titleText) {
  titleText.style.transition = 'none';
  titleText.style.transform = 'translateX(0)';
  void titleText.offsetWidth; // force reflow so the reset takes effect before re-enabling the transition
}

function showStep_(id) {
  document.querySelectorAll('.step').forEach(function (el) { el.classList.add('hidden'); });
  document.getElementById(id).classList.remove('hidden');

  var title = document.getElementById('page-title');
  var titleText = document.getElementById('page-title-text');
  var navRow = document.getElementById('nav-row');
  var progressTrack = document.querySelector('.progress-track');
  if (id === 'step-result') {
    titleText.textContent = 'Upisano! :)';
    resetTitlePosition_(titleText);
    // Read layout back before setting the target transform, or the browser
    // would just apply the end state instantly instead of transitioning
    // from the reset (left-aligned) position.
    var offset = title.clientWidth / 2 - titleText.offsetWidth / 2;
    titleText.style.transition = '';
    titleText.style.transform = 'translateX(' + offset + 'px)';
    navRow.classList.add('hidden');
    progressTrack.classList.add('hidden');
    updateTitleCityIcon_(false);
    return;
  }
  titleText.textContent = 'Tour Log';
  resetTitlePosition_(titleText);
  titleText.style.transition = '';
  navRow.classList.remove('hidden');
  progressTrack.classList.remove('hidden');
  updateBackButton_();
  updateTitleCityIcon_(id !== 'step-city');
  var stepNumber = STEP_NUMBERS[id] || 1;
  document.getElementById('progress-label').textContent = 'Step ' + stepNumber + ' of ' + TOTAL_STEPS;
  document.getElementById('progress-fill').style.width = (stepNumber / TOTAL_STEPS * 100) + '%';
  saveDraft_();
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
    channels: CONFIG.salesChannels.reduce(function (acc, c) {
      var el = document.getElementById('channel-' + c.code);
      acc[c.code] = el ? el.value : '';
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
    var langBtn = document.querySelector('#language-buttons button[data-code="' + state.language + '"]');
    if (langBtn) langBtn.classList.add('selected');
  }
  if (state.paidLanguage) {
    var paidLangBtn = document.querySelector('#paid-language-buttons button[data-code="' + state.paidLanguage + '"]');
    if (paidLangBtn) paidLangBtn.classList.add('selected');
  }

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
  updateChannelTotal();

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

function renderCityButtons() {
  var container = document.getElementById('city-buttons');
  CONFIG.cities.forEach(function (city) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = city.label;
    btn.dataset.code = city.code;
    btn.addEventListener('click', function () { selectCity(city.code); });
    container.appendChild(btn);
  });
}

function selectCity(code) {
  state.city = code;
  var select = document.getElementById('name-select');
  select.innerHTML = '';
  var guides = CONFIG.guidesByCity[code] || [];
  guides.forEach(function (name) {
    var option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
  goToStep('step-name');
}

function goToTourStep() {
  state.name = document.getElementById('name-select').value;
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
      saveDraft_();
    });
    container.appendChild(btn);
  });
}

function renderTimeSlots() {
  var select = document.getElementById('time-select');
  CONFIG.timeSlots.forEach(function (slot) {
    var option = document.createElement('option');
    option.value = slot;
    option.textContent = slot;
    select.appendChild(option);
  });
}

function renderPaidLanguageButtons() {
  var container = document.getElementById('paid-language-buttons');
  CONFIG.allLanguages.forEach(function (lang) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = lang.label;
    btn.dataset.code = lang.code;
    btn.addEventListener('click', function () {
      state.paidLanguage = lang.code;
      Array.from(container.children).forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      saveDraft_();
    });
    container.appendChild(btn);
  });
}

function renderPaidTimeSlots() {
  var select = document.getElementById('paid-time-select');
  CONFIG.timeSlots.forEach(function (slot) {
    var option = document.createElement('option');
    option.value = slot;
    option.textContent = slot;
    select.appendChild(option);
  });
}

function renderChannelFields() {
  var container = document.getElementById('paid-channel-fields');
  CONFIG.salesChannels.forEach(function (channel) {
    var field = document.createElement('div');
    field.className = 'field';
    var label = document.createElement('label');
    label.setAttribute('for', 'channel-' + channel.code);
    label.textContent = channel.label;
    var input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
    input.placeholder = '0';
    input.id = 'channel-' + channel.code;
    input.addEventListener('input', updateChannelTotal);
    field.appendChild(label);
    field.appendChild(input);
    container.appendChild(field);
  });
}

// Live running total so a guide sees a channel-pax/Total-Pax mismatch while
// typing, instead of only after hitting Submit and reading a validation error.
function updateChannelTotal() {
  var totalEl = document.getElementById('channel-total');
  var statedPaxRaw = document.getElementById('paid-pax-input').value;
  var channelSum = CONFIG.salesChannels.reduce(function (sum, channel) {
    var n = parseInt(document.getElementById('channel-' + channel.code).value, 10);
    return sum + (Number.isInteger(n) ? n : 0);
  }, 0);

  if (statedPaxRaw === '' && channelSum === 0) {
    totalEl.textContent = '';
    totalEl.classList.remove('channel-total--match');
    return;
  }

  var statedPax = parseInt(statedPaxRaw, 10);
  var hasStatedPax = Number.isInteger(statedPax);
  var matches = hasStatedPax && channelSum === statedPax;
  totalEl.textContent = (matches ? '✓ ' : '') + channelSum + (hasStatedPax ? ' / ' + statedPax : '') + ' pax entered';
  totalEl.classList.toggle('channel-total--match', matches);
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

function firstName_(fullName) {
  return String(fullName || '').trim().split(' ')[0];
}

// html: trusted — always built from CONFIG.guidesByCity's fixed guide list,
// never free-typed user input, so innerHTML (needed for the bolded name) is safe.
function showResult(html) {
  goToStep('step-result');
  document.getElementById('result-message').innerHTML = html;
}

function handleSubmit() {
  hideError('details-error');
  var fields = {
    language: state.language,
    pax: document.getElementById('pax-input').value,
    date: document.getElementById('date-input').value,
    time: document.getElementById('time-select').value,
    note: document.getElementById('note-input').value,
  };
  var errors = validateFreeTourFields(
    fields,
    CONFIG.languages.map(function (l) { return l.code; }),
    CONFIG.timeSlots
  );
  var errorKeys = Object.keys(errors);
  if (errorKeys.length > 0) {
    showError('details-error', errorKeys.map(function (k) { return errors[k]; }));
    return;
  }

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
  submitButton.disabled = true;
  submitButton.textContent = 'Submitting…';

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
        showResult('Thanks, <strong>' + firstName_(state.name) + '</strong>! Your tour was logged. Nice work.');
      } else {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit';
        showError('details-error', result.error || 'Submission failed, try again.');
      }
    })
    .catch(function (err) {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit';
      console.error(err);
      showError('details-error', 'Couldn’t confirm your submission went through. Check your email for a confirmation before submitting again.');
    });
}

function handlePaidSubmit() {
  hideError('paid-details-error');
  var channels = {};
  CONFIG.salesChannels.forEach(function (channel) {
    channels[channel.code] = document.getElementById('channel-' + channel.code).value;
  });
  var fields = {
    language: state.paidLanguage,
    date: document.getElementById('paid-date-input').value,
    time: document.getElementById('paid-time-select').value,
    pax: document.getElementById('paid-pax-input').value,
    channels: channels,
    noShow: document.getElementById('no-show-input').value,
    note: document.getElementById('paid-note-input').value,
  };
  var errors = validatePaidTourFields(
    fields,
    CONFIG.allLanguages.map(function (l) { return l.code; }),
    CONFIG.timeSlots,
    CONFIG.salesChannels.map(function (c) { return c.code; })
  );
  var errorKeys = Object.keys(errors);
  if (errorKeys.length > 0) {
    showError('paid-details-error', errorKeys.map(function (k) { return errors[k]; }));
    return;
  }

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
    photo: state.paidPhoto,
  });

  var submitButton = document.getElementById('paid-submit-button');
  submitButton.disabled = true;
  submitButton.textContent = 'Submitting…';

  fetch(CONFIG.appsScriptExecUrl, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
    .then(function (res) { return res.json(); })
    .then(function (result) {
      if (result.ok) {
        clearDraft_();
        showResult('Thanks, <strong>' + firstName_(state.name) + '</strong>! Your tour was logged. Nice work.');
      } else {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit';
        showError('paid-details-error', result.error || 'Submission failed, try again.');
      }
    })
    .catch(function (err) {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit';
      console.error(err);
      showError('paid-details-error', 'Couldn’t confirm your submission went through. Check your email for a confirmation before submitting again.');
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
renderChannelFields();
document.getElementById('name-continue').addEventListener('click', goToTourStep);
document.getElementById('tour-continue').addEventListener('click', goToTourDetails);
document.getElementById('submit-button').addEventListener('click', handleSubmit);
document.getElementById('paid-submit-button').addEventListener('click', handlePaidSubmit);
document.getElementById('paid-pax-input').addEventListener('input', updateChannelTotal);
document.getElementById('back-button').addEventListener('click', goBack);
['date-input', 'paid-date-input'].forEach(function (id) {
  document.getElementById(id).addEventListener('click', function () {
    if (this.showPicker) { try { this.showPicker(); } catch (e) {} }
  });
});
document.getElementById('photo-input').addEventListener('change', function (e) {
  var file = e.target.files[0];
  document.getElementById('photo-filename').textContent = file ? file.name : 'No file chosen';
  readPhotoAsBase64_(file, function (photo) { state.photo = photo; });
});
document.getElementById('paid-photo-input').addEventListener('change', function (e) {
  var file = e.target.files[0];
  document.getElementById('paid-photo-filename').textContent = file ? file.name : 'No file chosen';
  readPhotoAsBase64_(file, function (photo) { state.paidPhoto = photo; });
});
// Covers every typed/selected field on step 4 (pax, date, note, channel pax,
// etc.) with one listener instead of wiring each field individually — city/
// name/tour/language picks are saved separately, at their own click/step
// handlers above, since those don't fire input/change on .card.
document.querySelector('.card').addEventListener('input', saveDraft_);
document.querySelector('.card').addEventListener('change', saveDraft_);
if (!restoreDraft_()) showStep_('step-city');
