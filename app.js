import { CONFIG } from './config.js';
import { validateFreeTourFields, validatePaidTourFields, buildSubmissionPayload } from './formLogic.js';

var state = { city: null, name: null, tour: null, language: null, accessToken: null };

var STEP_NUMBERS = {
  'step-city': 1,
  'step-name': 2,
  'step-tour': 3,
  'step-details-free': 4,
  'step-details-paid': 4,
};
var TOTAL_STEPS = 4;
var stepHistory = ['step-city'];

function showStep_(id) {
  document.querySelectorAll('.step').forEach(function (el) { el.classList.add('hidden'); });
  document.getElementById(id).classList.remove('hidden');

  var navRow = document.getElementById('nav-row');
  var progressTrack = document.querySelector('.progress-track');
  if (id === 'step-result') {
    navRow.classList.add('hidden');
    progressTrack.classList.add('hidden');
    return;
  }
  navRow.classList.remove('hidden');
  progressTrack.classList.remove('hidden');
  document.getElementById('back-button').style.visibility = stepHistory.length > 1 ? 'visible' : 'hidden';
  var stepNumber = STEP_NUMBERS[id] || 1;
  document.getElementById('progress-label').textContent = 'Step ' + stepNumber + ' of ' + TOTAL_STEPS;
  document.getElementById('progress-fill').style.width = (stepNumber / TOTAL_STEPS * 100) + '%';
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

function renderPaidLanguageOptions() {
  var select = document.getElementById('paid-language-select');
  CONFIG.allLanguages.forEach(function (lang) {
    var option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.label;
    select.appendChild(option);
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
    input.id = 'channel-' + channel.code;
    field.appendChild(label);
    field.appendChild(input);
    container.appendChild(field);
  });
}

// google.accounts.oauth2 (not google.accounts.id) — the credential/ID-token
// flow's popup relies on window.postMessage back to the opener, which
// Chrome's Cross-Origin-Opener-Policy blocks after the account picker
// closes. This token-client flow uses a separate code path unaffected by
// that COOP restriction.
function initGoogleSignIn() {
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    window.setTimeout(initGoogleSignIn, 200);
    return;
  }
  var tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.clientId,
    scope: 'openid email',
    callback: function (response) {
      state.accessToken = response.access_token;
      ['signin-status', 'paid-signin-status'].forEach(function (id) {
        var el = document.getElementById(id);
        el.textContent = 'Signed in.';
        el.classList.remove('hidden');
      });
      document.getElementById('submit-button').disabled = false;
      document.getElementById('paid-submit-button').disabled = false;
    },
  });
  ['signin-button', 'paid-signin-button'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () {
      tokenClient.requestAccessToken();
    });
  });
}

function showError(message) {
  var el = document.getElementById('details-error');
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('details-error').classList.add('hidden');
}

function showResult(message) {
  goToStep('step-result');
  document.getElementById('result-message').textContent = message;
}

function handleSubmit() {
  hideError();
  if (!state.accessToken) {
    showError('Sign in with Google first.');
    return;
  }
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
    showError(errors[errorKeys[0]]);
    return;
  }

  var payload = buildSubmissionPayload({
    accessToken: state.accessToken,
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
        showResult('Thanks! Your tour was logged.');
      } else {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit';
        showError(result.error || 'Submission failed, try again.');
      }
    })
    .catch(function (err) {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit';
      showError('Network error: ' + err.message);
    });
}

function handlePaidSubmit() {
  document.getElementById('paid-details-error').classList.add('hidden');
  if (!state.accessToken) {
    document.getElementById('paid-details-error').textContent = 'Sign in with Google first.';
    document.getElementById('paid-details-error').classList.remove('hidden');
    return;
  }
  var channels = {};
  CONFIG.salesChannels.forEach(function (channel) {
    channels[channel.code] = document.getElementById('channel-' + channel.code).value;
  });
  var fields = {
    language: document.getElementById('paid-language-select').value,
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
    document.getElementById('paid-details-error').textContent = errors[errorKeys[0]];
    document.getElementById('paid-details-error').classList.remove('hidden');
    return;
  }

  var payload = buildSubmissionPayload({
    accessToken: state.accessToken,
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
        goToStep('step-result');
        document.getElementById('result-message').textContent = 'Thanks! Your tour was logged.';
      } else {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit';
        document.getElementById('paid-details-error').textContent = result.error || 'Submission failed, try again.';
        document.getElementById('paid-details-error').classList.remove('hidden');
      }
    })
    .catch(function (err) {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit';
      document.getElementById('paid-details-error').textContent = 'Network error: ' + err.message;
      document.getElementById('paid-details-error').classList.remove('hidden');
    });
}

renderCityButtons();
renderLanguageButtons();
renderTimeSlots();
renderTourOptions();
renderPaidLanguageOptions();
renderPaidTimeSlots();
renderChannelFields();
document.getElementById('name-continue').addEventListener('click', goToTourStep);
document.getElementById('tour-continue').addEventListener('click', goToTourDetails);
document.getElementById('submit-button').addEventListener('click', handleSubmit);
document.getElementById('paid-submit-button').addEventListener('click', handlePaidSubmit);
document.getElementById('back-button').addEventListener('click', goBack);
window.addEventListener('load', initGoogleSignIn);
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
showStep_('step-city');
