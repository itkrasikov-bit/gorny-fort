/* ==========================================================================
   «Горный Форт» — landing page logic
   Vanilla JS, no dependencies.
   ========================================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     Конфигурация. Меняйте телефоны, цену и расписание здесь.
     gameDate: '2026-11-21' — зафиксировать дату; null — ближайшая суббота.
     endpoint: URL вашего бэкенда/бота (POST JSON). Пустая строка — выкл.
     ---------------------------------------------------------------------- */
  var CONFIG = {
    phoneDisplay: '+7 913 757 15 11',
    phoneRaw: '+79137571511',
    telegram: 'GornyFort',
    ballsPrice: 150,
    ballsPerPack: 50,
    slotCapacity: 8,
    gameDate: null,
    endpoint: '',
    slots: [
      { start: 9, end: 10, booked: 8 },
      { start: 10, end: 11, booked: 8 },
      { start: 11, end: 12, booked: 0 },
      { start: 12, end: 13, booked: 0 },
      { start: 13, end: 14, booked: 8 },
      { start: 14, end: 15, booked: 0 },
      { start: 15, end: 16, booked: 0 },
      { start: 16, end: 17, booked: 0 },
      { start: 17, end: 18, booked: 0 }
    ]
  };

  var STORAGE_KEY = 'gornyfort.bookings.v1';
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Если что-то пойдёт не так — показываем контент без анимаций, а не пустые блоки.
  window.addEventListener('error', function () {
    document.documentElement.classList.add('js-fallback');
  });

  /* ------------------------------ helpers ------------------------------ */
  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function pad(num) { return String(num).padStart(2, '0'); }

  function plural(n, forms) {
    var n10 = n % 10;
    var n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  function money(value) {
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  function slotLabel(slot) {
    return pad(slot.start) + ':00–' + pad(slot.end) + ':00';
  }

  /* ------------------------------ dates -------------------------------- */
  function getGameDate() {
    if (CONFIG.gameDate) {
      var parts = CONFIG.gameDate.split('-').map(Number);
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    var now = new Date();
    var date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (date.getDay() === 6) {
      if (now.getHours() >= 18) date.setDate(date.getDate() + 7);
      return date;
    }
    date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7));
    return date;
  }

  function toISODate(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function dateLabel(date) {
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(date);
  }

  var GAME_DATE = getGameDate();
  var GAME_DATE_ISO = toISODate(GAME_DATE);
  var GAME_DATE_LABEL = dateLabel(GAME_DATE);

  /* ------------------------------ storage ------------------------------ */
  var bookings = loadBookings();
  var memoryStore = null;

  function loadBookings() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (item) {
        return item && typeof item === 'object' && item.id;
      });
    } catch (error) {
      console.warn('Не удалось прочитать сохранённые заявки', error);
      return [];
    }
  }

  function saveBookings() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    } catch (error) {
      memoryStore = bookings.slice();
      console.warn('localStorage недоступен — заявки хранятся только в памяти страницы', error);
    }
  }

  function makeId(prefix) {
    var id;
    var attempts = 0;
    do {
      id = prefix + '-' + Math.floor(1000 + Math.random() * 9000);
      attempts += 1;
    } while (attempts < 30 && bookings.some(function (b) { return b.id === id; }));
    return id;
  }

  /* --------------------------- seat occupancy -------------------------- */
  function demoBooked(label) {
    var slot = CONFIG.slots.find(function (s) { return slotLabel(s) === label; });
    return slot ? Number(slot.booked) || 0 : 0;
  }

  function myBooked(label) {
    return bookings.reduce(function (sum, booking) {
      if (booking.type !== 'slot' || booking.date !== GAME_DATE_ISO || booking.slot !== label) return sum;
      return sum + (Number(booking.players) || 0);
    }, 0);
  }

  function takenSeats(label) {
    return demoBooked(label) + myBooked(label);
  }

  function freeSeats(label) {
    return Math.max(0, CONFIG.slotCapacity - takenSeats(label));
  }

  /* ------------------------------ elements ----------------------------- */
  var slotsEl = $('#slots');
  var timeSelect = $('#bookingTime');
  var playersSelect = $('#bookingPlayers');
  var ballsSelect = $('#bookingBalls');
  var teamSelect = $('#bookingTeam');
  var nameInput = $('#bookingName');
  var phoneInput = $('#bookingPhone');
  var telegramInput = $('#bookingTelegram');
  var commentInput = $('#bookingComment');
  var consentBox = $('#bookingConsent');
  var bookingForm = $('#bookingForm');
  var bookingSuccess = $('#bookingSuccess');
  var successSummary = $('#successSummary');
  var successId = $('#successId');
  var totalPriceEl = $('#totalPrice');
  var timeHint = $('#timeHint');
  var freeSlotsEl = $('#heroFreeSlots');
  var gameDateEl = $('#gameDateLabel');
  var gameHoursEl = $('#gameHoursLabel');
  var adminBadge = $('#adminBadge');
  var lastBooking = null;

  /* ---------------------------- rendering ------------------------------ */
  function renderDate() {
    if (gameDateEl) gameDateEl.textContent = GAME_DATE_LABEL;
    if (gameHoursEl) {
      gameHoursEl.textContent = slotLabel(CONFIG.slots[0]).slice(0, 5) + '–' +
        slotLabel(CONFIG.slots[CONFIG.slots.length - 1]).slice(-5);
    }
  }

  function countFreeSlots() {
    return CONFIG.slots.reduce(function (sum, slot) {
      return sum + (freeSeats(slotLabel(slot)) > 0 ? 1 : 0);
    }, 0);
  }

  function renderSlots() {
    if (!slotsEl) return;
    var selected = timeSelect ? timeSelect.value : '';
    var fragment = document.createDocumentFragment();

    CONFIG.slots.forEach(function (slot) {
      var label = slotLabel(slot);
      var free = freeSeats(label);
      var busy = free <= 0;
      var selectedNow = label === selected && !busy;

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot ' + (busy ? 'slot--busy' : 'slot--free') + (selectedNow ? ' is-selected' : '');
      button.dataset.slot = label;
      button.setAttribute('aria-pressed', selectedNow ? 'true' : 'false');
      if (busy) {
        button.disabled = true;
        button.setAttribute('aria-label', label + ' — занято');
      } else {
        button.setAttribute('aria-label', label + ' — свободно, ' + free + ' ' + plural(free, ['место', 'места', 'мест']));
      }

      var time = el('span', 'slot-time', label);
      var state = el('span', 'slot-state');
      var stateIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      stateIcon.setAttribute('class', 'icon');
      stateIcon.setAttribute('aria-hidden', 'true');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', busy ? '#i-close' : '#i-check');
      stateIcon.appendChild(use);
      state.appendChild(stateIcon);
      state.appendChild(document.createTextNode(busy ? 'занято' : 'свободно'));

      var seats = el('span', 'slot-seats', busy ? 'мест нет' : free + ' ' + plural(free, ['место', 'места', 'мест']));

      button.append(time, state, seats);
      fragment.appendChild(button);
    });

    slotsEl.textContent = '';
    slotsEl.appendChild(fragment);

    if (freeSlotsEl) {
      var free = countFreeSlots();
      freeSlotsEl.textContent = free + ' ' + plural(free, ['слот', 'слота', 'слотов']);
    }
  }

  function markSelectedSlot() {
    if (!slotsEl || !timeSelect) return;
    var selected = timeSelect.value;
    $$('.slot', slotsEl).forEach(function (button) {
      var on = !button.disabled && button.dataset.slot === selected;
      button.classList.toggle('is-selected', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderTimeOptions(autoSelect) {
    if (!timeSelect) return;
    var previous = timeSelect.value;
    timeSelect.textContent = '';

    var placeholder = new Option('Выберите время', '');
    placeholder.disabled = true;
    timeSelect.add(placeholder);

    CONFIG.slots.forEach(function (slot) {
      var label = slotLabel(slot);
      var free = freeSeats(label);
      var option = new Option(
        label + ' — ' + (free > 0 ? 'свободно, ' + free + ' ' + plural(free, ['место', 'места', 'мест']) : 'мест нет'),
        label
      );
      option.disabled = free <= 0;
      timeSelect.add(option);
    });

    var canRestore = previous && freeSeats(previous) > 0;
    if (canRestore) {
      timeSelect.value = previous;
    } else if (autoSelect) {
      var firstFree = CONFIG.slots.find(function (slot) { return freeSeats(slotLabel(slot)) > 0; });
      timeSelect.value = firstFree ? slotLabel(firstFree) : '';
    }
    if (!timeSelect.value) timeSelect.selectedIndex = 0;
  }

  function updateTimeHint() {
    if (!timeHint || !timeSelect) return;
    var label = timeSelect.value;
    timeHint.classList.remove('is-warn');
    if (!label) {
      timeHint.textContent = 'Выберите свободное время в расписании.';
      return;
    }
    var free = freeSeats(label);
    var players = Number(playersSelect.value) || 1;
    if (players > free) {
      timeHint.textContent = 'В этом слоте осталось ' + free + ' ' + plural(free, ['место', 'места', 'мест']) +
        ' — выберите другое время или уменьшите состав.';
      timeHint.classList.add('is-warn');
    } else {
      timeHint.textContent = 'Свободно ' + free + ' ' + plural(free, ['место', 'места', 'мест']) +
        ' · вас: ' + players;
      var timeField = timeSelect.closest('.field');
      if (timeField) {
        timeField.classList.remove('has-error');
        timeSelect.removeAttribute('aria-invalid');
        var timeError = document.getElementById('err-time');
        if (timeError) timeError.textContent = '';
      }
    }
  }

  function estimatePrice() {
    var balls = Number(ballsSelect.value) || 0;
    if (!balls) return null;
    return Math.round((balls / CONFIG.ballsPerPack) * CONFIG.ballsPrice);
  }

  function updateTotal() {
    if (!totalPriceEl) return;
    var price = estimatePrice();
    totalPriceEl.textContent = price === null ? 'по факту' : '≈ ' + money(price) + ' ₽';
  }

  function refreshBookingUi() {
    renderSlots();
    updateTimeHint();
    updateTotal();
  }

  /* ----------------------------- validation ---------------------------- */
  function clearErrors(form) {
    $$('.field.has-error', form).forEach(function (field) { field.classList.remove('has-error'); });
    $$('.field-error', form).forEach(function (error) { error.textContent = ''; });
    $$('[aria-invalid]', form).forEach(function (input) { input.removeAttribute('aria-invalid'); });
  }

  function setError(input, errorId, message) {
    var field = input.closest('.field');
    if (field) field.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
    var error = document.getElementById(errorId);
    if (error) error.textContent = message;
  }

  function attachErrorClearing(form) {
    if (!form) return;
    ['input', 'change'].forEach(function (type) {
      form.addEventListener(type, function (event) {
        var field = event.target.closest('.field');
        if (!field || !field.classList.contains('has-error')) return;
        field.classList.remove('has-error');
        event.target.removeAttribute('aria-invalid');
        var error = field.querySelector('.field-error');
        if (error) error.textContent = '';
      });
    });
  }

  function normalizePhone(value) {
    var digits = value.replace(/\D/g, '');
    if (digits.charAt(0) === '8') digits = '7' + digits.slice(1);
    if (digits.charAt(0) !== '7') digits = '7' + digits;
    return digits.slice(0, 11);
  }

  function isValidPhone(value) {
    var digits = normalizePhone(value);
    return digits.length === 11 && digits.charAt(0) === '7';
  }

  function formatPhone(value) {
    var digits = normalizePhone(value);
    var rest = digits.slice(1);
    var out = '+7';
    if (rest.length > 0) out += ' (' + rest.slice(0, 3);
    if (rest.length >= 3) out += ')';
    if (rest.length > 3) out += ' ' + rest.slice(3, 6);
    if (rest.length > 6) out += '-' + rest.slice(6, 8);
    if (rest.length > 8) out += '-' + rest.slice(8, 10);
    return out;
  }

  function validateBookingForm() {
    clearErrors(bookingForm);
    var firstInvalid = null;

    function fail(input, errorId, message) {
      setError(input, errorId, message);
      if (!firstInvalid) firstInvalid = input;
    }

    var slot = timeSelect.value;
    var players = Number(playersSelect.value) || 1;
    var name = nameInput.value.trim();
    var phone = phoneInput.value;

    if (!slot) {
      fail(timeSelect, 'err-time', 'Выберите время игры.');
    } else if (players > freeSeats(slot)) {
      fail(timeSelect, 'err-time', 'На это время осталось только ' + freeSeats(slot) + ' ' +
        plural(freeSeats(slot), ['место', 'места', 'мест']) + '. Выберите другой слот или уменьшите состав.');
    }

    if (name.length < 2) {
      fail(nameInput, 'err-name', 'Укажите имя — как к вам обращаться.');
    } else if (name.length > 40) {
      fail(nameInput, 'err-name', 'Имя слишком длинное — до 40 символов.');
    }

    if (!isValidPhone(phone)) {
      fail(phoneInput, 'err-phone', 'Введите телефон в формате +7 (999) 000-00-00.');
    }

    if (!consentBox.checked) {
      fail(consentBox, 'err-consent', 'Отметьте согласие на обработку данных.');
    }

    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: false });
      firstInvalid.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  /* --------------------------- phone masking --------------------------- */
  // Форматируем по завершении ввода: так курсор не «прыгает» при наборе.
  if (phoneInput) {
    phoneInput.addEventListener('blur', function () {
      if (phoneInput.value && isValidPhone(phoneInput.value)) {
        phoneInput.value = formatPhone(phoneInput.value);
      }
    });
  }

  /* ------------------------- booking: interactions --------------------- */
  if (slotsEl) {
    slotsEl.addEventListener('click', function (event) {
      var button = event.target.closest('.slot');
      if (!button || button.disabled) return;
      ensureBookingFormVisible();
      timeSelect.value = button.dataset.slot;
      markSelectedSlot();
      updateTimeHint();
      updateTotal();
      if (window.matchMedia('(max-width: 1000px)').matches) {
        var panel = $('#booking');
        if (panel) panel.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
    });
  }

  if (timeSelect) {
    timeSelect.addEventListener('change', function () {
      markSelectedSlot();
      updateTimeHint();
      updateTotal();
    });
  }

  if (playersSelect) {
    playersSelect.addEventListener('change', updateTimeHint);
  }

  if (ballsSelect) {
    ballsSelect.addEventListener('change', updateTotal);
  }

  $$('[data-format-link]').forEach(function (link) {
    link.addEventListener('click', function () {
      ensureBookingFormVisible();
      var value = link.getAttribute('data-format-link');
      var radio = bookingForm.querySelector('input[name="format"][value="' + value + '"]');
      if (radio) radio.checked = true;
    });
  });

  function ensureBookingFormVisible() {
    if (!bookingForm || !bookingForm.hidden) return;
    bookingForm.reset();
    clearErrors(bookingForm);
    bookingSuccess.hidden = true;
    bookingForm.hidden = false;
    renderTimeOptions(true);
    refreshBookingUi();
  }

  /* ------------------------- booking: success view --------------------- */
  function addSummaryRow(term, value) {
    successSummary.appendChild(el('dt', null, term));
    successSummary.appendChild(el('dd', null, value));
  }

  function renderBookingSuccess(booking) {
    successId.textContent = booking.id;
    successSummary.textContent = '';
    addSummaryRow('Дата', booking.dateLabel);
    addSummaryRow('Время', booking.slot);
    addSummaryRow('Формат', booking.format);
    addSummaryRow('Участники', booking.players + ' ' + plural(booking.players, ['человек', 'человека', 'человек']));
    addSummaryRow('Команда', booking.team);
    var price = booking.balls ? Math.round((booking.balls / CONFIG.ballsPerPack) * CONFIG.ballsPrice) : null;
    addSummaryRow('Шары', booking.balls ? booking.balls + ' шт · ≈ ' + money(price) + ' ₽' : 'уточним на месте');
    addSummaryRow('Имя', booking.name);
    addSummaryRow('Телефон', booking.phone);
    if (booking.telegram) addSummaryRow('Telegram', booking.telegram);
    if (booking.comment) addSummaryRow('Комментарий', booking.comment);
  }

  function bookingText(booking) {
    var lines = [
      'Заявка ' + booking.id + ' — запись на игру в «Горном Форте»',
      'Дата: ' + booking.dateLabel,
      'Время: ' + booking.slot,
      'Формат: ' + booking.format,
      'Участников: ' + booking.players,
      'Команда: ' + booking.team
    ];
    if (booking.balls) {
      lines.push('Шары: ' + booking.balls + ' шт · ≈ ' + money(Math.round((booking.balls / CONFIG.ballsPerPack) * CONFIG.ballsPrice)) + ' ₽');
    } else {
      lines.push('Шары: уточним на месте');
    }
    lines.push('Имя: ' + booking.name, 'Телефон: ' + booking.phone);
    if (booking.telegram) lines.push('Telegram: ' + booking.telegram);
    if (booking.comment) lines.push('Комментарий: ' + booking.comment);
    return lines.join('\n');
  }

  function copyText(text, button) {
    var done = function () {
      if (!button) return;
      var initialHtml = button.innerHTML;
      button.textContent = 'Скопировано';
      window.setTimeout(function () {
        button.innerHTML = initialHtml;
      }, 2200);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    }
    fallbackCopy(text, done);
    return Promise.resolve();
  }

  function fallbackCopy(text, done) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      if (done) done();
    } catch (error) {
      console.warn('Копирование не удалось', error);
    }
    document.body.removeChild(area);
  }

  function submitBooking(event) {
    event.preventDefault();
    if (!validateBookingForm()) return;

    var booking = {
      id: makeId('GF'),
      type: 'slot',
      createdAt: new Date().toISOString(),
      date: GAME_DATE_ISO,
      dateLabel: GAME_DATE_LABEL,
      slot: timeSelect.value,
      format: bookingForm.querySelector('input[name="format"]:checked').value,
      players: Number(playersSelect.value) || 1,
      team: teamSelect.value,
      balls: Number(ballsSelect.value) || 0,
      name: nameInput.value.trim(),
      phone: formatPhone(phoneInput.value),
      telegram: telegramInput.value.trim(),
      comment: commentInput.value.trim()
    };

    bookings.unshift(booking);
    saveBookings();
    lastBooking = booking;

    pushToEndpoint(booking);

    renderBookingSuccess(booking);
    bookingForm.hidden = true;
    bookingSuccess.hidden = false;
    timeSelect.value = '';
    refreshBookingUi();
    updateAdminBadge();
    bookingSuccess.focus({ preventScroll: true });

    var panel = $('#booking');
    if (panel) panel.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function pushToEndpoint(payload) {
    if (!CONFIG.endpoint) return;
    try {
      fetch(CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function (error) { console.warn('Ошибка отправки заявки на сервер', error); });
    } catch (error) {
      console.warn('Ошибка отправки заявки на сервер', error);
    }
  }

  if (bookingForm) {
    bookingForm.addEventListener('submit', submitBooking);
  }

  var newBookingButton = $('#newBooking');
  if (newBookingButton) {
    newBookingButton.addEventListener('click', function () {
      bookingForm.reset();
      clearErrors(bookingForm);
      bookingSuccess.hidden = true;
      bookingForm.hidden = false;
      renderTimeOptions(true);
      refreshBookingUi();
      timeSelect.focus({ preventScroll: true });
      var panel = $('#booking');
      if (panel) panel.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
  }

  var copyBookingButton = $('#copyBooking');
  if (copyBookingButton) {
    copyBookingButton.addEventListener('click', function () {
      if (lastBooking) copyText(bookingText(lastBooking), copyBookingButton);
    });
  }

  var successTelegram = $('#successTelegram');
  if (successTelegram) {
    successTelegram.addEventListener('click', function () {
      if (lastBooking) copyText(bookingText(lastBooking), null);
    });
  }

  /* ------------------------------ requests ----------------------------- */
  var requestForm = $('#requestForm');
  var requestSuccess = $('#requestSuccess');
  var requestName = $('#requestName');
  var requestPhone = $('#requestPhone');
  var requestMessage = $('#requestMessage');
  var requestConsent = $('#requestConsent');
  var requestIdEl = $('#requestId');
  var lastRequest = null;

  if (requestPhone) {
    requestPhone.addEventListener('blur', function () {
      if (requestPhone.value && isValidPhone(requestPhone.value)) {
        requestPhone.value = formatPhone(requestPhone.value);
      }
    });
  }

  function requestText(request) {
    var lines = [
      'Заявка ' + request.id + ' — «Горный Форт»',
      'Имя: ' + request.name,
      'Телефон: ' + request.phone
    ];
    if (request.message) lines.push('Пожелания: ' + request.message);
    lines.push('Ближайшая игра: ' + GAME_DATE_LABEL);
    return lines.join('\n');
  }

  function submitRequest(event) {
    event.preventDefault();
    clearErrors(requestForm);
    var firstInvalid = null;

    function fail(input, errorId, message) {
      setError(input, errorId, message);
      if (!firstInvalid) firstInvalid = input;
    }

    var name = requestName.value.trim();
    var message = requestMessage.value.trim();

    if (name.length < 2) fail(requestName, 'err-req-name', 'Укажите имя — как к вам обращаться.');
    else if (name.length > 40) fail(requestName, 'err-req-name', 'Имя слишком длинное — до 40 символов.');

    if (!isValidPhone(requestPhone.value)) fail(requestPhone, 'err-req-phone', 'Введите телефон в формате +7 (999) 000-00-00.');
    if (!requestConsent.checked) fail(requestConsent, 'err-req-consent', 'Отметьте согласие на обработку данных.');
    if (message.length > 500) fail(requestMessage, 'err-req-message', 'Сократите пожелания до 500 символов.');

    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: false });
      firstInvalid.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
      return;
    }

    var request = {
      id: makeId('GF'),
      type: 'request',
      createdAt: new Date().toISOString(),
      date: GAME_DATE_ISO,
      dateLabel: GAME_DATE_LABEL,
      name: name,
      phone: formatPhone(requestPhone.value),
      message: message
    };

    bookings.unshift(request);
    saveBookings();
    lastRequest = request;
    pushToEndpoint(request);

    requestIdEl.textContent = request.id;
    requestForm.hidden = true;
    requestSuccess.hidden = false;
    updateAdminBadge();
    requestSuccess.focus({ preventScroll: true });
    requestSuccess.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
  }

  if (requestForm) {
    requestForm.addEventListener('submit', submitRequest);
  }

  var newRequestButton = $('#newRequest');
  if (newRequestButton) {
    newRequestButton.addEventListener('click', function () {
      requestForm.reset();
      clearErrors(requestForm);
      requestSuccess.hidden = true;
      requestForm.hidden = false;
      requestName.focus({ preventScroll: true });
    });
  }

  var copyRequestButton = $('#copyRequest');
  if (copyRequestButton) {
    copyRequestButton.addEventListener('click', function () {
      if (lastRequest) copyText(requestText(lastRequest), copyRequestButton);
    });
  }

  var requestTelegram = $('#requestTelegram');
  if (requestTelegram) {
    requestTelegram.addEventListener('click', function () {
      if (lastRequest) copyText(requestText(lastRequest), null);
    });
  }

  /* ---------------------------- admin panel ---------------------------- */
  var adminDialog = $('#adminDialog');
  var adminList = $('#adminList');
  var adminCount = $('#adminCount');
  var clearButton = $('#clearBookings');
  var exportButton = $('#exportCsv');
  var openAdminButton = $('#openAdmin');

  function formatCreated(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function renderAdmin() {
    if (!adminList) return;
    adminList.textContent = '';

    if (!bookings.length) {
      adminList.appendChild(el('p', 'admin-empty', 'Пока нет заявок. Оформите запись на игру — она появится здесь.'));
    }

    bookings.forEach(function (booking) {
      var isRequest = booking.type === 'request';
      var item = el('div', 'booking-item');
      item.dataset.id = booking.id;

      var head = el('div', 'booking-item-head');
      head.appendChild(el('span', 'booking-type' + (isRequest ? ' booking-type--request' : ''), isRequest ? 'Заявка' : 'Запись'));
      head.appendChild(el('span', 'booking-id', booking.id + ' · ' + formatCreated(booking.createdAt)));
      item.appendChild(head);

      item.appendChild(el('h4', null, isRequest ? 'Запрос на другое время' : booking.dateLabel + ' · ' + booking.slot));

      var meta = el('div', 'booking-meta');
      if (!isRequest) {
        meta.appendChild(metaRow('Формат', booking.format));
        meta.appendChild(metaRow('Участники', booking.players + ' ' + plural(booking.players, ['человек', 'человека', 'человек'])));
        meta.appendChild(metaRow('Команда', booking.team));
        meta.appendChild(metaRow('Шары', booking.balls ? booking.balls + ' шт' : '—'));
      } else if (booking.message) {
        meta.appendChild(metaRow('Пожелания', booking.message));
      }
      meta.appendChild(metaRow('Имя', booking.name));
      meta.appendChild(metaRow('Телефон', booking.phone, 'tel:' + String(booking.phone).replace(/\D/g, '')));
      if (booking.telegram) meta.appendChild(metaRow('Telegram', booking.telegram));
      if (!isRequest && booking.comment) meta.appendChild(metaRow('Комментарий', booking.comment));
      item.appendChild(meta);

      var foot = el('div', 'booking-item-foot');
      if (isRequest) foot.appendChild(el('span', null, 'Ближайшая игра: ' + booking.dateLabel));
      var remove = el('button', 'booking-delete');
      remove.type = 'button';
      remove.dataset.deleteId = booking.id;
      var removeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      removeIcon.setAttribute('class', 'icon');
      removeIcon.setAttribute('aria-hidden', 'true');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-trash');
      removeIcon.appendChild(use);
      remove.appendChild(removeIcon);
      remove.appendChild(document.createTextNode('Удалить'));
      foot.appendChild(remove);
      item.appendChild(foot);

      adminList.appendChild(item);
    });

    if (adminCount) {
      var total = bookings.length;
      adminCount.textContent = total + ' ' + plural(total, ['заявка', 'заявки', 'заявок']);
    }
    if (clearButton) clearButton.hidden = bookings.length === 0;
    updateAdminBadge();
  }

  function metaRow(label, value, href) {
    var row = document.createElement('span');
    row.appendChild(document.createTextNode(label + ': '));
    var bold = document.createElement(href ? 'a' : 'b');
    bold.textContent = value;
    if (href) bold.href = href;
    row.appendChild(bold);
    return row;
  }

  function updateAdminBadge() {
    if (adminBadge) adminBadge.textContent = String(bookings.length);
  }

  function openAdmin() {
    if (!adminDialog || adminDialog.open) return;
    renderAdmin();
    adminDialog.showModal();
    document.body.classList.add('no-scroll');
  }

  if (openAdminButton) openAdminButton.addEventListener('click', openAdmin);

  if (adminDialog) {
    adminDialog.addEventListener('close', function () {
      document.body.classList.remove('no-scroll');
    });
    adminDialog.addEventListener('click', function (event) {
      if (event.target === adminDialog) adminDialog.close();
      if (event.target.closest('[data-close-dialog]')) adminDialog.close();
    });
  }

  if (adminList) {
    adminList.addEventListener('click', function (event) {
      var remove = event.target.closest('[data-delete-id]');
      if (!remove) return;
      bookings = bookings.filter(function (booking) { return booking.id !== remove.dataset.deleteId; });
      saveBookings();
      renderAdmin();
      refreshBookingUi();
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', function () {
      if (!bookings.length) return;
      if (!window.confirm('Удалить все заявки с этого устройства? Действие необратимо.')) return;
      bookings = [];
      saveBookings();
      renderAdmin();
      refreshBookingUi();
    });
  }

  if (exportButton) {
    exportButton.addEventListener('click', function () {
      if (!bookings.length) return;
      var headers = ['Номер', 'Тип', 'Создана', 'Дата игры', 'Время', 'Формат', 'Участники', 'Команда', 'Шары', 'Имя', 'Телефон', 'Telegram', 'Комментарий'];
      var rows = bookings.map(function (booking) {
        return [
          booking.id,
          booking.type === 'request' ? 'Заявка' : 'Запись',
          formatCreated(booking.createdAt),
          booking.dateLabel || '',
          booking.slot || '',
          booking.format || '',
          booking.players || '',
          booking.team || '',
          booking.balls || '',
          booking.name || '',
          booking.phone || '',
          booking.telegram || '',
          booking.comment || booking.message || ''
        ];
      });
      var csv = [headers].concat(rows).map(function (row) {
        return row.map(function (cell) {
          return '"' + String(cell).replace(/"/g, '""') + '"';
        }).join(';');
      }).join('\r\n');

      var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'gornyfort-zayavki-' + GAME_DATE_ISO + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    });
  }

  /* ------------------------------ gallery ------------------------------ */
  var galleryItems = $$('.gallery-item');
  var lightbox = $('#lightbox');
  var lightboxImg = $('#lightboxImg');
  var lightboxCaption = $('#lightboxCaption');
  var lightboxDownload = $('#lightboxDownload');
  var galleryIndex = 0;

  function openLightbox(index) {
    if (!lightbox || !galleryItems.length) return;
    galleryIndex = (index + galleryItems.length) % galleryItems.length;
    var item = galleryItems[galleryIndex];
    lightboxImg.src = item.dataset.full;
    lightboxImg.alt = item.dataset.caption;
    lightboxCaption.textContent = item.dataset.caption;
    lightboxDownload.href = item.dataset.full;
    lightboxDownload.setAttribute('download', item.dataset.download || 'afisha.webp');
    if (!lightbox.open) lightbox.showModal();
    document.body.classList.add('no-scroll');
  }

  galleryItems.forEach(function (item, index) {
    item.addEventListener('click', function () { openLightbox(index); });
  });

  if (lightbox) {
    lightbox.addEventListener('close', function () {
      document.body.classList.remove('no-scroll');
      lightboxImg.removeAttribute('src');
    });
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) lightbox.close();
      if (event.target.closest('[data-close-dialog]')) lightbox.close();
    });
    var prev = $('#lightboxPrev');
    var next = $('#lightboxNext');
    if (prev) prev.addEventListener('click', function () { openLightbox(galleryIndex - 1); });
    if (next) next.addEventListener('click', function () { openLightbox(galleryIndex + 1); });
    document.addEventListener('keydown', function (event) {
      if (!lightbox.open) return;
      if (event.key === 'ArrowLeft') openLightbox(galleryIndex - 1);
      if (event.key === 'ArrowRight') openLightbox(galleryIndex + 1);
    });
  }

  /* ---------------------------- header / nav --------------------------- */
  var header = $('.site-header');
  var navToggle = $('#navToggle');
  var mobileCta = $('.mobile-cta');

  function onScroll() {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function syncCtaInert() {
    if (!mobileCta) return;
    var hidden = mobileCta.classList.contains('is-hidden') || document.body.classList.contains('nav-open');
    mobileCta.toggleAttribute('inert', hidden);
  }

  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    document.body.classList.toggle('no-scroll', open);
    syncCtaInert();
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    }
  }

  if (navToggle) {
    navToggle.addEventListener('click', function () {
      setNav(!document.body.classList.contains('nav-open'));
    });
    $$('#nav a').forEach(function (link) {
      link.addEventListener('click', function () { setNav(false); });
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && document.body.classList.contains('nav-open')) setNav(false);
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 1000 && document.body.classList.contains('nav-open')) setNav(false);
  });

  /* --------------------- mobile CTA near forms ------------------------ */
  var ctaSections = [$('#booking'), $('#request')].filter(Boolean);
  if (mobileCta && ctaSections.length && 'IntersectionObserver' in window) {
    var ctaVisibleSources = new Set();
    var ctaObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) ctaVisibleSources.add(entry.target);
        else ctaVisibleSources.delete(entry.target);
      });
      mobileCta.classList.toggle('is-hidden', ctaVisibleSources.size > 0);
      syncCtaInert();
    }, { threshold: 0.08 });
    ctaSections.forEach(function (section) { ctaObserver.observe(section); });
  }

  /* ------------------------------ reveal ------------------------------- */
  var revealItems = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealItems.forEach(function (item) { observer.observe(item); });
  } else {
    revealItems.forEach(function (item) { item.classList.add('is-visible'); });
  }

  /* ---------------------------- cross-tab ------------------------------ */
  window.addEventListener('storage', function (event) {
    if (event.key !== STORAGE_KEY) return;
    bookings = loadBookings();
    renderTimeOptions(false);
    refreshBookingUi();
    updateAdminBadge();
    if (adminDialog && adminDialog.open) renderAdmin();
  });

  /* ------------------------------- init -------------------------------- */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  attachErrorClearing(bookingForm);
  attachErrorClearing(requestForm);

  renderDate();
  renderTimeOptions(true);
  refreshBookingUi();
  updateAdminBadge();
  renderAdmin();
})();
