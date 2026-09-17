export const CONFIG = {
  clientId: '899808144926-uo2oh0undnbqm9v0pc5ogvhmu41tndvo.apps.googleusercontent.com',
  appsScriptExecUrl: 'https://script.google.com/macros/s/AKfycbwd3FNd3tChQdePQPixOw_gPfxWolFyxCdQzG7Q_LKItNt7CSrGGY3-OxG6X6AnYjmf/exec',
  cities: [
    { code: 'zg', label: 'Zagreb' },
    { code: 'du', label: 'Dubrovnik' },
    { code: 'zd', label: 'Zadar' },
    { code: 'st', label: 'Split' },
  ],
  guidesByCity: {
    zg: ['Antun Zebec'],
    du: [],
    zd: [],
    st: [],
  },
  // Keep the codes here in sync with backend/Constants.gs's
  // FREE_TOUR_LANGUAGES — see that file's comment for why.
  languages: [
    { code: 'eng', label: 'English' },
    { code: 'esp', label: 'Español' },
  ],
  // Restricted subset of evidencija-automation's VALID_TOURS for this form.
  // 'free' routes to the free-tour path, everything else to the paid-tour path.
  tours: [
    'free', 'best', 'big', 'food', 'old', 'war',
  ].map(function (code) { return { code: code, label: code }; }),
  // Full language list (evidencija-automation's VALID_LANGUAGES) — paid
  // tours only. Free tours keep using the 2-entry `languages` above.
  allLanguages: [
    { code: 'eng', label: 'English' },
    { code: 'esp', label: 'Español' },
    { code: 'fra', label: 'Français' },
    { code: 'ger', label: 'Deutsch' },
    { code: 'ita', label: 'Italiano' },
    { code: 'rus', label: 'Русский' },
    { code: 'other', label: 'Other' },
  ],
  // Paid-tour sales channels — keys match backend/Constants.gs's CHANNEL_MAP.
  salesChannels: [
    { code: 'web', label: 'Pax s Weba' },
    { code: 'viator', label: 'Pax s Viatora' },
    { code: 'gyg', label: 'Pax s GYG-a' },
    { code: 'airbnb', label: 'Pax s Airbnba' },
    { code: 'musement', label: 'Pax s Musementa' },
  ],
  // Keep in sync with backend/Constants.gs's TIME_SLOTS.
  timeSlots: buildHalfHourSlots(8, 20),
};

function buildHalfHourSlots(startHour, endHour) {
  var slots = [];
  for (var h = startHour; h <= endHour; h++) {
    slots.push(h + ':00');
    if (h < endHour) slots.push(h + ':30');
  }
  return slots;
}
