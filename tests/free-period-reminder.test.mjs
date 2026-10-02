// De herinnering vóór het einde van de gratis periode, voor scholen MET een
// Stripe-abonnement (mandaat bij inschrijving).
//
// Aanleiding: de bestaande trial-reminder selecteerde op `is_trial = true`. Een
// school met mandaat staat direct op `is_trial = false` en kreeg daardoor
// niets — gemeten 1 okt 2026 bij de eerste school uit die keten.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  REMINDER_DAYS,
  DEDUP_WINDOW_DAYS,
  alreadySent,
  buildReminderCopy,
  formatEndDate,
  reminderEmailType,
  selectFreePeriodReminders,
  subscriptionRowFromStripe,
  utcDateInDays,
} = await import('../lib/free-period-reminder.ts');

// De cron draait om 09:00 UTC. Sezens gratis periode eindigt 1 nov 11:28 UTC.
const NU_7D = new Date('2026-10-25T09:00:00Z');
const NU_1D = new Date('2026-10-31T09:00:00Z');
const EINDE = '2026-11-01T11:28:45+00:00';

const rij = (over = {}) => ({
  school_id: 'school-1',
  stripe_status: 'trialing',
  plan: 'premium',
  current_period_end: EINDE,
  cancel_at: null,
  ...over,
});

// ── Selectie ────────────────────────────────────────────────────────────────

test('S1: zelfde momenten als de bestaande herinnering — 7 dagen en 1 dag', () => {
  assert.deepEqual([...REMINDER_DAYS], [7, 1]);
  assert.equal(utcDateInDays(NU_7D, 7), '2026-11-01');
  assert.equal(utcDateInDays(NU_1D, 1), '2026-11-01');
});

test('S2: 7 dagen vooraf → één herinnering, met plan en einddatum uit de subscription', () => {
  const { reminders, skipped } = selectFreePeriodReminders([rij()], NU_7D);
  assert.deepEqual(reminders, [{
    schoolId: 'school-1', plan: 'premium', daysLeft: 7, endsAt: '2026-11-01T11:28:45.000Z',
  }]);
  assert.deepEqual(skipped, []);
});

test('S3: 1 dag vooraf → herinnering met daysLeft 1', () => {
  const { reminders } = selectFreePeriodReminders([rij({ plan: 'basic' })], NU_1D);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].daysLeft, 1);
  assert.equal(reminders[0].plan, 'basic');
});

test('S4: op elke andere dag gebeurt er niets — ook geen "overgeslagen"', () => {
  for (const dag of ['2026-10-24', '2026-10-26', '2026-10-30', '2026-11-01', '2026-11-02']) {
    const uit = selectFreePeriodReminders([rij()], new Date(`${dag}T09:00:00Z`));
    assert.deepEqual(uit, { reminders: [], skipped: [] }, dag);
  }
});

test('S5: alleen trialing — een betalend, achterstallig of beëindigd abonnement krijgt deze mail niet', () => {
  for (const status of ['active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'paused', null]) {
    const uit = selectFreePeriodReminders([rij({ stripe_status: status })], NU_7D);
    assert.deepEqual(uit.reminders, [], String(status));
  }
});

test('S6: een opgezegd abonnement krijgt hem niet — "loopt door" zou onwaar zijn', () => {
  const { reminders, skipped } = selectFreePeriodReminders([rij({ cancel_at: EINDE })], NU_7D);
  assert.deepEqual(reminders, []);
  assert.deepEqual(skipped, [{ schoolId: 'school-1', reason: 'cancellation_scheduled' }]);
});

test('S7: zonder einddatum geen mail — en zichtbaar als overgeslagen', () => {
  // Gemeten 1 okt 2026: twee levende rijen in productie hebben current_period_end NULL.
  const { reminders, skipped } = selectFreePeriodReminders([rij({ current_period_end: null })], NU_7D);
  assert.deepEqual(reminders, []);
  assert.deepEqual(skipped, [{ schoolId: 'school-1', reason: 'no_period_end' }]);
});

test('S8: onbekend plan → geen mail met een verzonnen plannaam', () => {
  for (const plan of ['gold', '', null, 'expired']) {
    const { reminders, skipped } = selectFreePeriodReminders([rij({ plan })], NU_7D);
    assert.deepEqual(reminders, [], String(plan));
    assert.deepEqual(skipped, [{ schoolId: 'school-1', reason: 'unknown_plan' }]);
  }
});

test('S9: één mail per school, ook bij twee abonnementen', () => {
  const { reminders, skipped } = selectFreePeriodReminders([rij(), rij({ plan: 'basic' })], NU_7D);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].plan, 'premium');
  assert.deepEqual(skipped, [{ schoolId: 'school-1', reason: 'duplicate_subscription' }]);
});

test('S10: twee scholen op dezelfde dag krijgen elk hun eigen herinnering', () => {
  const { reminders } = selectFreePeriodReminders(
    [rij(), rij({ school_id: 'school-2', plan: 'basic' })], NU_7D,
  );
  assert.deepEqual(reminders.map((r) => [r.schoolId, r.plan]), [['school-1', 'premium'], ['school-2', 'basic']]);
});

// ── Tekst ───────────────────────────────────────────────────────────────────

test('T1: de datum staat in Nederlandse tijd, voluit', () => {
  assert.equal(formatEndDate(EINDE), '1 november 2026');
  // 23:30 UTC op 31 okt is in Nederland al 1 november (wintertijd, UTC+1).
  assert.equal(formatEndDate('2026-10-31T23:30:00Z'), '1 november 2026');
});

test('T2: Premium, 7 dagen — zegt wat er gebeurt, noemt Basic en opzeggen', () => {
  const c = buildReminderCopy({ plan: 'premium', daysLeft: 7, endsAt: EINDE });
  assert.equal(c.subject, 'Je gratis periode loopt over 7 dagen af');
  assert.equal(c.pillLabel, 'Nog 7 dagen');
  assert.match(c.intro, /loopt af op 1 november 2026/);
  assert.match(c.intro, /Je hoeft niets te doen/);
  assert.match(c.intro, /loopt daarna door op Premium/);
  assert.match(c.intro, /automatisch geïncasseerd/);
  assert.match(c.switchToBasic, /Liever Basic\?/);
  assert.match(c.switchToBasic, /vóór 1 november 2026/);
  assert.match(c.cancel, /Zeg dan vóór 1 november 2026 op/);
  assert.equal(c.ctaLabel, 'Bekijk je abonnement');
});

test('T3: Basic — geen zin over wisselen naar Basic', () => {
  const c = buildReminderCopy({ plan: 'basic', daysLeft: 7, endsAt: EINDE });
  assert.equal(c.switchToBasic, null);
  assert.match(c.intro, /loopt daarna door op Basic/);
});

test('T4: 1 dag — "morgen" en "vandaag nog", geen "over 1 dagen"', () => {
  const c = buildReminderCopy({ plan: 'premium', daysLeft: 1, endsAt: EINDE });
  assert.equal(c.subject, 'Je gratis periode loopt morgen af');
  assert.equal(c.pillLabel, 'Loopt morgen af');
  assert.match(c.switchToBasic, /vandaag nog/);
  assert.match(c.cancel, /vandaag nog/);
  for (const tekst of [c.subject, c.title, c.intro, c.switchToBasic, c.cancel]) {
    assert.doesNotMatch(tekst, /1 dagen/);
  }
});

test('T5: de mail belooft geen bedrag op een datum en dreigt niet met verlies van toegang', () => {
  // Ribba weet niet zeker wat Stripe int (afwijkende prijs, korting). En voor
  // een school met mandaat verandert er niets aan de toegang.
  for (const plan of ['basic', 'premium']) {
    for (const daysLeft of [7, 1]) {
      const c = buildReminderCopy({ plan, daysLeft, endsAt: EINDE });
      const alles = [c.subject, c.title, c.intro, c.switchToBasic ?? '', c.cancel].join(' ');
      assert.doesNotMatch(alles, /€|\d+,\d{2}/, 'geen bedrag');
      assert.doesNotMatch(alles, /toegang|proefperiode|kies een abonnement/i, 'geen tekst van de oude proefmail');
    }
  }
});

test('T6: de weg naar Basic is de knop op /upgrade, niet meer een mailadres', () => {
  // Sinds 2 okt 2026 bestaat de knop "Na deze periode naar Basic" op /upgrade,
  // en de knop onder de mail gaat naar die pagina.
  for (const daysLeft of [7, 1]) {
    const c = buildReminderCopy({ plan: 'premium', daysLeft, endsAt: EINDE });
    assert.match(c.switchToBasic, /Na deze periode naar Basic/);
    assert.doesNotMatch(c.switchToBasic, /team@ribba\.nl|mail ons/i);
  }
});

// ── Niet dubbel versturen ───────────────────────────────────────────────────

test('D1: email_type per moment, zodat 7 dagen en 1 dag elkaar niet blokkeren', () => {
  assert.equal(reminderEmailType(7), 'free_period_ending_7d');
  assert.equal(reminderEmailType(1), 'free_period_ending_1d');
});

test('D2: kort geleden verstuurd → niet opnieuw', () => {
  assert.equal(alreadySent(['2026-10-25T09:00:03Z'], new Date('2026-10-25T09:05:00Z')), true);
  assert.equal(alreadySent(['2026-10-25T09:00:03Z'], new Date('2026-10-26T09:00:00Z')), true);
});

test('D3: nooit verstuurd, of lang geleden → wel versturen', () => {
  assert.equal(alreadySent([], NU_7D), false);
  assert.equal(alreadySent([null, undefined, 'geen-datum'], NU_7D), false);
  // Een vorige gratis periode, maanden terug, mag een nieuwe niet blokkeren.
  assert.equal(alreadySent(['2026-04-25T09:00:00Z'], NU_7D), false);
  assert.ok(DEDUP_WINDOW_DAYS >= 1 && DEDUP_WINDOW_DAYS < 6, 'venster dekt een herhaalde run, niet het volgende moment');
});

// ── De feiten komen uit Stripe ──────────────────────────────────────────────
//
// De spiegel is hiervoor niet bruikbaar: de activatie schrijft de rij zonder
// einddatum. Gemeten 2 okt 2026 bij Drive4License — spiegel leeg, Stripe gaf
// 25 oktober.

const TRIAL_END = 1793532525; // 2026-11-01T11:28:45Z — de echte waarde van Sezen
const stripeSub = (over = {}) => ({
  status: 'trialing',
  trial_end: TRIAL_END,
  cancel_at: null,
  items: { data: [{ price: { metadata: { plan: 'premium', trial_interval: '1 month' } } }] },
  ...over,
});

test('F1: einddatum = trial_end van Stripe, plan = metadata.plan op de Price', () => {
  assert.deepEqual(subscriptionRowFromStripe('school-1', stripeSub()), {
    school_id: 'school-1',
    stripe_status: 'trialing',
    plan: 'premium',
    current_period_end: '2026-11-01T11:28:45.000Z',
    cancel_at: null,
  });
});

test('F2: een geplande opzegging komt mee, zodat de selectie hem overslaat', () => {
  const feit = subscriptionRowFromStripe('school-1', stripeSub({ cancel_at: TRIAL_END }));
  assert.equal(feit.cancel_at, '2026-11-01T11:28:45.000Z');
  const { reminders, skipped } = selectFreePeriodReminders([feit], NU_7D);
  assert.deepEqual(reminders, []);
  assert.equal(skipped[0].reason, 'cancellation_scheduled');
});

test('F3: geen of meer dan één plan-item → geen plan, dus geen mail', () => {
  const geen = subscriptionRowFromStripe('s', stripeSub({ items: { data: [{ price: { metadata: {} } }] } }));
  const twee = subscriptionRowFromStripe('s', stripeSub({
    items: { data: [{ price: { metadata: { plan: 'basic' } } }, { price: { metadata: { plan: 'premium' } } }] },
  }));
  const leeg = subscriptionRowFromStripe('s', stripeSub({ items: null }));
  for (const feit of [geen, twee, leeg]) {
    assert.equal(feit.plan, null);
    assert.deepEqual(selectFreePeriodReminders([feit], NU_7D).reminders, []);
  }
});

test('F4: Stripe zegt dat de gratis periode voorbij is → geen mail, wat de spiegel ook dacht', () => {
  const feit = subscriptionRowFromStripe('school-1', stripeSub({ status: 'active' }));
  assert.deepEqual(selectFreePeriodReminders([feit], NU_7D), { reminders: [], skipped: [] });
});

test('F5: de hele keten met de echte waarden van Sezen — mail op 25 en 31 oktober, nergens anders', () => {
  const feit = subscriptionRowFromStripe('6f16d0c6', stripeSub({
    items: { data: [{ price: { metadata: { plan: 'basic' } } }] },
  }));
  const dagen = [];
  for (let d = 2; d <= 33; d++) {
    const nu = new Date(Date.UTC(2026, 9, d, 9, 0, 0)); // oktober, 09:00 UTC = het crontijdstip
    const { reminders } = selectFreePeriodReminders([feit], nu);
    if (reminders.length) dagen.push([nu.toISOString().slice(0, 10), reminders[0].daysLeft]);
  }
  assert.deepEqual(dagen, [['2026-10-25', 7], ['2026-10-31', 1]]);
});
