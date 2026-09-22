export const CONFIG = {
  clientId: '324131903836-5plbnieve6aganag80isn96qm8l1he38.apps.googleusercontent.com',
  appsScriptExecUrl: 'https://script.google.com/macros/s/AKfycbxNHeTz0HBskYAp_GlW4MeLLwF7IVjlGLZ9r4m3e_VNf5P0M_MUf-9Xb3ZmyJqt3nXQ/exec',
  cities: [
    { code: 'zg', label: 'Zagreb' },
    { code: 'du', label: 'Dubrovnik' },
    { code: 'zd', label: 'Zadar' },
    { code: 'st', label: 'Split' },
  ],
  // Keep in sync with backend/Constants.gs's GUIDE_DIRECTORY (name+city).
  guidesByCity: {
    zg: [
      'Juraj Zebec', 'Antonio Sičić',
      'Darko Crnolatac', 'Diana Bolić', 'Dora Mlinarek Dominik',
      'Doris Cvetko Pavišić', 'Iva Pavlović', 'Ivana Čakarić',
      'Katarina Novoselac', 'Katija Crnčević', 'Kristina Božić',
      'Luka Pelicarić', 'Nadir Ivanović', 'Nikolina Folnović', 'Vid Dorić',
    ],
    du: [
      'Andrea Rendulić', 'Emma Martinović', 'Ivo Miličić', 'Lorena Arias',
      'Maja Musulin', 'Marin Kalauz', 'Nikolina Vidojević', 'Pero Kusalo',
      'Romana Tomičić', 'Sara Žanetić',
    ],
    zd: [
      'Andrija Grubić', 'Iva Zaplatić', 'Matea Duka', 'Nikolina Kuzman',
      'Tonka Baričević',
    ],
    st: [
      'Boris Čerina', 'Bruno Beara', 'Ivana Čagalj', 'Lorena Ćelić',
      'Marija Močić', 'Marina Krolo', 'Petra Lučev',
    ],
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
  ].map(function (code) { return { code: code, label: code.charAt(0).toUpperCase() + code.slice(1) }; }),
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
    { code: 'web', label: 'Pax - Web' },
    { code: 'airbnb', label: 'Pax - Airbnb' },
    { code: 'gyg', label: 'Pax - GYG' },
    { code: 'musement', label: 'Pax - Musement' },
    { code: 'viator', label: 'Pax - Viator' },
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
