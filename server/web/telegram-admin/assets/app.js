(() => {
  const tg = window.Telegram?.WebApp;
  const list = document.querySelector('#employees');
  const notice = document.querySelector('#notice');
  const count = document.querySelector('#employee-count');
  const formCard = document.querySelector('#form-card');
  const form = document.querySelector('#worker-form');
  const errorBox = document.querySelector('#form-error');
  const saveButton = document.querySelector('#save-worker');
  const dayField = form.elements.namedItem('salaryEffectiveDate');
  let employees = [];

  if (tg) { tg.ready(); tg.expand(); }
  if (dayField) dayField.value = new Date().toISOString().slice(0, 10);

  async function request(path, payload = {}) {
    const initData = tg?.initData;
    if (!initData) throw new Error('Panelni Telegram ichidan oching.');
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      body: JSON.stringify({ ...payload, initData }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'So‘rov bajarilmadi.');
    return data;
  }

  function renderEmployees() {
    list.replaceChildren();
    count.textContent = String(employees.length);
    if (!employees.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Xodimlar hozircha topilmadi.';
      list.append(empty);
      return;
    }
    for (const employee of employees) {
      const row = document.createElement('li');
      row.className = 'employee-row';
      const name = document.createElement('p');
      name.className = 'employee-name';
      name.textContent = employee.name;
      const badges = document.createElement('div');
      if (!employee.active) {
        const inactive = document.createElement('span');
        inactive.className = 'employee-state inactive';
        inactive.textContent = 'Faol emas';
        badges.append(inactive);
      }
      const state = document.createElement('span');
      state.className = `employee-state ${employee.telegramLinked ? 'linked' : 'unlinked'}`;
      state.textContent = employee.telegramLinked ? 'Telegram ulangan' : 'Ulanmagan';
      badges.append(state);
      row.append(name, badges);
      list.append(row);
    }
  }

  async function refresh() {
    notice.textContent = 'Ma’lumotlar yuklanmoqda…';
    try {
      const data = await request('/api/telegram/admin/employees/list');
      employees = data.employees;
      renderEmployees();
      notice.textContent = 'Ro‘yxat yangilandi';
    } catch (error) {
      notice.textContent = error.message;
    }
  }

  document.querySelector('#refresh').addEventListener('click', refresh);
  document.querySelector('#show-form').addEventListener('click', () => {
    formCard.hidden = false;
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.namedItem('fullName').focus();
  });
  document.querySelector('#cancel-form').addEventListener('click', () => {
    form.reset();
    dayField.value = new Date().toISOString().slice(0, 10);
    errorBox.hidden = true;
    formCard.hidden = true;
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    values.salary = Number(values.salary);
    values.workingDays = Number(values.workingDays);
    saveButton.disabled = true;
    errorBox.hidden = true;
    try {
      await request('/api/telegram/admin/employees', values);
      form.reset();
      dayField.value = new Date().toISOString().slice(0, 10);
      formCard.hidden = true;
      notice.textContent = 'Xodim qo‘shildi';
      await refresh();
      tg?.HapticFeedback?.notificationOccurred('success');
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      tg?.HapticFeedback?.notificationOccurred('error');
    } finally {
      saveButton.disabled = false;
    }
  });

  void refresh();
})();
