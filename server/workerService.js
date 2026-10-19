import { hashPassword } from './passwordHash.js';
import { normalizePhone } from './telegram/workerIdentity.js';
import { prepareWorkerSalaryRate } from '../src/workers/workerSalaryRate.js';

const text = value => typeof value === 'string' ? value.trim() : '';

function validateNewWorker(body) {
  const fullName = text(body.fullName || body.name);
  const rawPhone = text(body.phone);
  const phone = normalizePhone(rawPhone);
  const position = text(body.position);
  const login = text(body.login);
  const password = text(body.password);
  if (!fullName || !rawPhone || !position || !login) {
    throw new Error('Ism familiya, telefon, lavozim va login majburiy.');
  }
  if (fullName.length > 120 || position.length > 80 || login.length > 80 || !phone) {
    throw new Error('Xodim ma’lumotlari yoki telefon raqami noto‘g‘ri.');
  }
  if (!password || password.length > 1024) throw new Error('Parol majburiy.');
  if (body.salary === undefined || body.salary === null || String(body.salary).trim() === '') {
    throw new Error('Oylik ish haqi majburiy.');
  }
  const salary = Number(body.salary);
  const workingDays = Number(body.workingDays);
  if (!Number.isFinite(salary) || salary < 0) throw new Error('Oylik 0 yoki undan katta son bo‘lishi kerak.');
  if (!Number.isInteger(workingDays) || workingDays <= 0) throw new Error('Ish kunlari musbat butun son bo‘lishi kerak.');
  const salaryEffectiveDate = text(body.salaryEffectiveDate);
  if (!salaryEffectiveDate) throw new Error('Stavka amal qilish sanasi majburiy.');

  const loginLower = login.toLowerCase();
  const experienceYears = text(body.experienceYears);
  const ratingInput = text(body.rating);
  const experience = experienceYears === '' ? '' : String(Math.max(0, Number.parseInt(experienceYears, 10) || 0));
  let rating = '';
  if (ratingInput !== '') {
    const number = Number.parseFloat(ratingInput.replace(',', '.'));
    if (Number.isFinite(number)) rating = String(Math.min(5, Math.max(0, number)));
  }
  const salaryFields = prepareWorkerSalaryRate({ salary, workingDays, salaryEffectiveDate });
  return {
    payload: {
      fullName, name: fullName, phone, position, login, loginLower,
      brigadeId: '', brigadeName: '', experienceYears: experience, rating,
      ...salaryFields, status: 'active', disabled: false,
    },
    password,
    normalizedPhone: phone,
  };
}

/** Shared creation path for the SolarERP staff API and Telegram Web App. */
export async function createWorkerProfile(db, body, { now = () => new Date() } = {}) {
  if (!db?.runTransaction) throw new Error('Worker storage unavailable.');
  const validated = validateNewWorker(body || {});
  const credential = hashPassword(validated.password);
  const loginLower = validated.payload.loginLower;
  const createdAt = now().toISOString();
  const profile = { ...validated.payload, createdAt, updatedAt: createdAt };
  const workerRef = db.collection('workers').doc();
  const credentialRef = db.collection('accountCredentials').doc(`usta:${workerRef.id}`);

  await db.runTransaction(async tx => {
    const [workers, users] = await Promise.all([
      tx.get(db.collection('workers')),
      tx.get(db.collection('users')),
    ]);
    const byId = new Map(users.docs.map(doc => [doc.id, doc.data() || {}]));
    for (const doc of workers.docs) byId.set(doc.id, doc.data() || {});
    for (const existing of byId.values()) {
      const existingLogin = text(existing.loginLower || existing.login).toLowerCase();
      if (existingLogin && existingLogin === loginLower) throw new Error('Bu login band. Boshqa login tanlang.');
      if (normalizePhone(existing.phone) === validated.normalizedPhone) throw new Error('Bu telefon raqami bilan xodim mavjud.');
    }
    tx.create(workerRef, profile);
    tx.set(credentialRef, { ...credential, updatedAt: createdAt });
  });

  return { id: workerRef.id, ...profile };
}
