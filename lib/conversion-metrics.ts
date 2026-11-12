/** PIRAAT meetcontract v1. Alleen geaggregeerde uitkomsten verlaten de server. */
export type Segment = 'leerlingen' | 'rijscholen';
export type SourceState = { status: 'ready' | 'unavailable' | 'truncated'; reason?: string };
export type AppEventRow = { id: number; ontvangen_op: string; user_id: string; rol: string; school_id: string | null; soort: string; scherm: string | null; element: string | null; ota_id: string | null; sessie_id: string | null };
export type AccountRow = { id: string; role: string; created_at: string };
export type StudentLinkRow = { user_id: string | null; drivingschool_id: string };
export type SchoolRow = { id: string; is_internal: boolean; created_at: string };
export type ReceiptRow = { id: string; school_id: string; provider: string; event_kind: string; status: string; side_effect_stage: string; first_received_at: string; external_event_id: string };
export type ReferralRow = { id: string; school_id: string | null; aangemeld_op: string; verdiend_op: string | null; void_op: string | null };
export type ConversionSources = { capturedAt: string; events: AppEventRow[]; accounts: AccountRow[]; schools: SchoolRow[]; links: StudentLinkRow[]; receipts: ReceiptRow[]; referrals: ReferralRow[]; states: Record<'events' | 'accounts' | 'schools' | 'links' | 'receipts' | 'referrals', SourceState> };
export type DailyPoint = { day: string; numerator: number | null; denominator: number | null; value: number | null; provisional: boolean; reason: 'before_history' | 'empty' | 'maturing' | 'unavailable' | null };
export type Metric = { id: string; title: string; stage: string; unit: 'percent' | 'count'; evidence: 'measured' | 'proxy' | 'missing'; definition: string; goal: string; next: string; daily: DailyPoint[]; current: number | null; previous: number | null; comparisonCurrent: number | null; delta: number | null; numerator: number; denominator: number; sampleDays: number; previousDays: number };
export type ConversionReport = { version: 1; capturedAt: string; days: number; segment: Segment; historyStart: string | null; metrics: Metric[]; northStar: { users: number | null; active: number | null; label: string }; quality: { events: number | null; users: number | null; unknownRoleUsers: number | null; firstDayPartial: boolean; sourceStates: ConversionSources['states'] }; stages: { id: string; title: string; question: string; metricId: string; target: string }[] };
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' });
export function amsterdamDay(time: string | number): string {
 const parts = calendar.formatToParts(new Date(time));
 return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)!.value).join('-');
}
export function nextDay(day: string, amount = 1): string { return new Date(Date.parse(day + 'T12:00:00Z') + amount * 86400000).toISOString().slice(0, 10); }
export function ratio(n: number, d: number): number | null { return d > 0 ? n / d * 100 : null; }
export function parseSegment(value: string | null): Segment | null { return value === null || value === 'leerlingen' ? 'leerlingen' : value === 'rijscholen' ? 'rijscholen' : null; }
export function metricValue(value: number | null, unit: Metric['unit']): string { return value === null ? '—' : unit === 'percent' ? `${value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%` : value.toLocaleString('nl-NL'); }
const screen = (names: string[]) => (e: AppEventRow) => e.soort === 'scherm' && names.includes(e.scherm ?? '');
const click = (names: string[]) => (e: AppEventRow) => e.soort === 'klik' && names.includes(e.element ?? '');
const learner = (e: AppEventRow) => e.rol === 'leerling';
const schoolUser = (e: AppEventRow) => ['eigenaar', 'beheerder', 'instructeur'].includes(e.rol);
const meaningful = screen(['TheorieHoofdstuk', 'ExamenPoging', 'RijschoolDetail', 'StudentLesAanvraag', 'StudentLesDetail', 'StudentVoortgang', 'LessonDetail', 'NewAppointment', 'FactuurDetail']);
const uniqueUsers = (rows: AppEventRow[]) => new Set(rows.map(e => e.user_id));
function point(day: string, n: number | null, d: number | null, unit: Metric['unit'], provisional: boolean, reason: DailyPoint['reason'] = null): DailyPoint {
 return { day, numerator: n, denominator: d, value: n === null ? null : unit === 'count' ? n : ratio(n, d ?? 0), provisional, reason: reason ?? (unit === 'percent' && !d ? 'empty' : null) };
}
/** Startdag-cohort: dezelfde gebruiker, later doel, dezelfde kalenderdag. Ontvangstvolgorde (tijd + server-ID) bewaart batches; geen doorsnede van losse totalen. */
export function sameDayFunnel(events: AppEventRow[], day: string, start: (e: AppEventRow) => boolean, goal: (e: AppEventRow) => boolean): { numerator: number; denominator: number } {
 const first = new Map<string, { time: number; id: number }>();
 for (const e of events) if (amsterdamDay(e.ontvangen_op) === day && start(e)) {
  const candidate = { time: Date.parse(e.ontvangen_op), id: e.id }, old = first.get(e.user_id);
  if (!old || candidate.time < old.time || (candidate.time === old.time && candidate.id < old.id)) first.set(e.user_id, candidate);
 }
 const converted = new Set<string>();
 for (const e of events) { const entry = first.get(e.user_id), time = Date.parse(e.ontvangen_op);
  if (entry && amsterdamDay(e.ontvangen_op) === day && goal(e) && (time > entry.time || (time === entry.time && e.id > entry.id))) converted.add(e.user_id);
 }
 return { numerator: converted.size, denominator: first.size };
}
function finish(metric: Omit<Metric, 'current' | 'previous' | 'comparisonCurrent' | 'delta' | 'numerator' | 'denominator' | 'sampleDays' | 'previousDays'>, split: number, today: string): Metric {
 const complete = (p: DailyPoint) => !p.provisional && p.reason !== 'before_history' && p.reason !== 'unavailable' && p.reason !== 'maturing' && p.day < today;
 const currentWindow = metric.daily.slice(split), previousWindow = metric.daily.slice(0, split);
 const current = currentWindow.filter(complete);
 const aggregate = (points: DailyPoint[]) => {
  if (!points.length) return null;
  const n = points.reduce((sum, p) => sum + (p.numerator ?? 0), 0);
  return metric.unit === 'count' ? n : ratio(n, points.reduce((sum, p) => sum + (p.denominator ?? 0), 0));
 };
 // Vergelijk uitsluitend overeenkomstige vensterposities met aan beide kanten volledige dekking.
 // De tegenhanger van vandaag en nog niet uitgerijpte cohorten vallen aan beide kanten weg.
 const aligned = currentWindow.map((p, i) => ({ current: p, previous: previousWindow[i] }))
  .filter(pair => complete(pair.current) && pair.previous && complete(pair.previous));
 const comparisonCurrent = aggregate(aligned.map(pair => pair.current));
 const previousValue = aggregate(aligned.map(pair => pair.previous));
 const n = current.reduce((sum, p) => sum + (p.numerator ?? 0), 0), d = current.reduce((sum, p) => sum + (p.denominator ?? 0), 0);
 return { ...metric, daily: currentWindow, current: aggregate(current), previous: previousValue, comparisonCurrent, delta: comparisonCurrent !== null && previousValue !== null ? comparisonCurrent - previousValue : null, numerator: n, denominator: d, sampleDays: current.length, previousDays: aligned.length };
}
export function buildConversionReport(sources: ConversionSources, days: number, segment: Segment, includeInternal = false): ConversionReport {
 const today = amsterdamDay(sources.capturedAt), end = Date.parse(sources.capturedAt);
 const dayKeys = Array.from({ length: days * 2 }, (_, i) => nextDay(today, i - days * 2 + 1));
 const schoolsReady = sources.states.schools.status === 'ready';
 const internal = new Set(sources.schools.filter(s => s.is_internal).map(s => s.id));
 const events = schoolsReady ? sources.events.filter(e => e.ota_id !== 'dev' && (includeInternal || !e.school_id || !internal.has(e.school_id)) && Date.parse(e.ontvangen_op) <= end) : [];
 const historyStart = events.reduce<string | null>((a, e) => a === null || Date.parse(e.ontvangen_op) < Date.parse(a) ? e.ontvangen_op : a, null);
 const historyDay = historyStart ? amsterdamDay(historyStart) : null;
 const selected = events.filter(segment === 'leerlingen' ? learner : schoolUser);
 const byDay = new Map<string, AppEventRow[]>();
 for (const event of selected) { const day = amsterdamDay(event.ontvangen_op); const rows = byDay.get(day) ?? []; rows.push(event); byDay.set(day, rows); }
 const dayEvents = (day: string) => byDay.get(day) ?? [];
 const available = sources.states.events.status === 'ready' && schoolsReady;
 const metricBase = (id: string, title: string, stage: string, definition: string, goal: string, next: string, evidence: Metric['evidence'] = 'measured', unit: Metric['unit'] = 'percent') => ({ id, title, stage, definition, goal, next, evidence, unit });
 const eventPoint = (day: string, count: () => { numerator: number; denominator: number }, lag = 0) => {
  if (!available) return point(day, null, null, 'percent', false, 'unavailable');
  if (!historyDay || day <= historyDay) return point(day, null, null, 'percent', false, 'before_history');
  if (nextDay(day, lag) > today) return point(day, null, count().denominator, 'percent', true, 'maturing');
  const x = count(); return point(day, x.numerator, x.denominator, 'percent', nextDay(day, lag) >= today);
 };
 const metrics: Metric[] = [];
 const add = (m: Parameters<typeof finish>[0]) => metrics.push(finish(m, days, today));
 add({ ...metricBase('awareness', 'Bezoek → app-storeklik', 'Bereik', 'Unieke bezoekers die naar een app-store doorklikken / unieke bezoekers, per bezoekdag.', 'Meer geschikte bezoekers laten doorstromen naar de app.', 'Koppel dagelijkse websessies en storekliks met dezelfde noemer; de app-events beginnen pas na inloggen.', 'missing'), daily: dayKeys.map(day => point(day, null, null, 'percent', false, 'unavailable')) });
 const internalLearners = new Set(sources.links.filter(l => l.user_id && internal.has(l.drivingschool_id)).map(l => l.user_id!));
 for (const link of sources.links) if (link.user_id && !internal.has(link.drivingschool_id)) internalLearners.delete(link.user_id);
 const records = segment === 'leerlingen' ? sources.accounts.filter(a => a.role === 'student' && (includeInternal || !internalLearners.has(a.id))).map(a => ({ at: a.created_at })) : sources.schools.filter(s => includeInternal || !s.is_internal).map(s => ({ at: s.created_at }));
 const accountCounts = new Map<string, number>();
 for (const r of records) { const day = amsterdamDay(r.at); accountCounts.set(day, (accountCounts.get(day) ?? 0) + 1); }
 const acquisitionReady = (segment === 'leerlingen' ? sources.states.accounts.status === 'ready' && (includeInternal || sources.states.links.status === 'ready') : true) && schoolsReady;
 add({ ...metricBase('acquisition', segment === 'leerlingen' ? 'Nieuwe leerlingaccountrecords' : 'Nieuwe rijschoolrecords', 'Acquisitie', 'Nieuwe records op created_at, per kalenderdag; geen conversie van bezoek naar registratie en geen backfill van gebruikers.', 'Bezoek → bevestigd account; onderscheid eigen aanmelding en uitnodiging.', 'Voor een acquisitiepercentage ontbreken de anonieme registratie-starts en een gekoppeld bezoekcohort.', 'measured', 'count'), daily: dayKeys.map(day => acquisitionReady ? point(day, accountCounts.get(day) ?? 0, null, 'count', day === today) : point(day, null, null, 'count', false, 'unavailable')) });
 const start = segment === 'leerlingen' ? screen(['Theorie']) : screen(['Agenda']);
 const goal = segment === 'leerlingen' ? screen(['TheorieHoofdstuk']) : screen(['NewAppointment']);
 add({ ...metricBase('activation', segment === 'leerlingen' ? 'Theorie → hoofdstuk geopend' : 'Agenda → les aanmaken geopend', 'Activatie', 'Unieke gebruikers die na het startscherm op dezelfde Amsterdamse kalenderdag het doelscherm openen / unieke starters. Gedragsproxy, geen bevestigde afronding.', segment === 'leerlingen' ? 'Eerste theorieonderwerp aantoonbaar afgerond binnen 24 uur na registratie.' : 'Eerste eigen les aantoonbaar opgeslagen binnen 7 dagen na aanmelding.', 'Leg het eerste succesvolle businessresultaat append-only vast. Een klik of schermbezoek is geen opgeslagen resultaat.', 'proxy'), daily: dayKeys.map(day => eventPoint(day, () => sameDayFunnel(dayEvents(day), day, start, goal))) });
 add({ ...metricBase('engagement', 'Waardevolle schermen / actieve gebruikers', 'Engagement', 'Gebruikers met hoofdstuk, oefenpoging, rijschooldetail, lesaanvraag, lesdetail of voortgang / gebruikers met ten minste één gemeten scherm/klik, per dag. Geen score of afronding.', 'Wekelijks terugkerende gebruikers die aantoonbaar leren, oefenen of een rijles regelen.', 'Vervang de schermproxy door bevestigde leer-/examen-/boekingsresultaten zodra deze historisch beschikbaar zijn.', 'proxy'), daily: dayKeys.map(day => eventPoint(day, () => { const e = dayEvents(day); return { numerator: uniqueUsers(e.filter(meaningful)).size, denominator: uniqueUsers(e).size }; })) });
 for (const lag of [1, 7]) add({ ...metricBase(`retention${lag}`, `D${lag}-terugkeer`, 'Retentie', `Unieke actieve gebruikers op dag D die ook op D+${lag} een event hebben / actieve gebruikers op D. Bestaande én nieuwe gebruikers; geen signup-retentiecohort.`, `Meer gebruikers keren ${lag === 1 ? 'de volgende dag' : 'na een week'} terug.`, 'Bekijk alleen uitgerijpte dagen en dezelfde doelgroep. Ontbrekende meetdagen blijven onbekend.'), daily: dayKeys.map(day => eventPoint(day, () => { const a = uniqueUsers(dayEvents(day)), b = uniqueUsers(dayEvents(nextDay(day, lag))); return { numerator: [...a].filter(id => b.has(id)).length, denominator: a.size }; }, lag)) });
 add({ ...metricBase('lesson', 'Plannen-klik → planscherm', 'Engagement', 'Gebruikers met een vaste Les plannen-knop en daarna een planscherm, op dezelfde dag / unieke klikkers. Geen geboekte of aangevraagde les.', 'Planintentie → succesvol opgeslagen lesaanvraag.', 'Koppel een bevestigde lesaanvraag aan de start; onbekende knoppen tellen niet als planintentie.', 'proxy'), daily: dayKeys.map(day => eventPoint(day, () => sameDayFunnel(dayEvents(day), day, click(['home-les-plannen', 'praktijk-les-plannen-knop', 'planning-les-plannen']), screen(['StudentLesAanvraag', 'StudentBeschikbaarheid'])))) });
 add({ ...metricBase('comparison', 'Rijschool zoeken → aanvraagformulier', 'Engagement', 'Zoekers die later op dezelfde dag RijschoolAanvraag openen / unieke zoekers. Geen verstuurde aanvraag.', 'Vergelijker → succesvol verzonden informatieaanvraag.', 'Voeg de serverbevestiging van een verstuurde aanvraag toe; een formulier openen is nog geen lead.', 'proxy'), daily: dayKeys.map(day => eventPoint(day, () => sameDayFunnel(dayEvents(day), day, screen(['RijschoolZoeken']), screen(['RijschoolAanvraag'])))) });
 add({ ...metricBase('exam', 'Examenstart → resultaat bekeken', 'Engagement', 'Gebruikers die na ExamenStart dezelfde dag ExamenResultaat openen / unieke starters. Schermproxy, geen gevalideerde score of poging-ID.', 'Oefenexamen gestart → poging afgerond → opnieuw oefenen.', 'Registreer start en bevestigde afronding met één poging-ID. De huidige resultaten leven lokaal op het toestel.', 'proxy'), daily: dayKeys.map(day => eventPoint(day, () => sameDayFunnel(dayEvents(day), day, screen(['ExamenStart']), screen(['ExamenResultaat'])))) });
 const referralReady = sources.states.referrals.status === 'ready' && schoolsReady;
 const referrals = sources.referrals.filter(r => includeInternal || !r.school_id || !internal.has(r.school_id));
 const referralsByDay = new Map<string, ReferralRow[]>();
 for (const r of referrals) { const day = amsterdamDay(r.aangemeld_op), rows = referralsByDay.get(day) ?? []; rows.push(r); referralsByDay.set(day,rows); }
 add({ ...metricBase('referral', 'Referral-aanmelding → beloning verdiend', 'Referral', 'Ribba-ambassadeursaanmeldingen met verdiend_op binnen 30 dagen / aanmeldingen op die startdag. Beloningsmoment, niet een gedeelde link of omzetbedrag.', 'Actieve ambassadeur → nieuwe geregistreerde rijschool → geldige verdiende beloning.', 'Voor deelklik → aanmelding ontbreken gekoppelde deel-events. De bestaande beloningsregistratie wordt wel gevolgd.'), daily: dayKeys.map(day => {
  if (!referralReady) return point(day, null, null, 'percent', false, 'unavailable');
  const r = referralsByDay.get(day) ?? [];
  return point(day, r.filter(r => r.verdiend_op && Date.parse(r.verdiend_op) >= Date.parse(r.aangemeld_op) && Date.parse(r.verdiend_op) - Date.parse(r.aangemeld_op) <= 30 * 86400000 && Date.parse(r.verdiend_op) <= end && (!r.void_op || Date.parse(r.void_op) > Date.parse(r.verdiend_op))).length, r.length, 'percent', nextDay(day, 31) > today);
 }) });
 add({ ...metricBase('revenue', 'Proef → eerste echte betaling', 'Omzet', 'Nieuwe schoolcohorten die binnen 30 dagen een eerste abonnement betalen / alle proefstarters. Bedrag > €0 en terugbetalingen zijn nodig.', 'Betaalconversie, bruto/netto ontvangen omzet, MRR en betaalde retentie.', 'De huidige webhookreceipts bevatten geen factuurbedrag of refunds. Een actieve status, mandaat of nul-eurofactuur is geen bewezen omzet.', 'missing'), daily: dayKeys.map(day => point(day, null, null, 'percent', false, 'unavailable')) });
 const receiptReady = sources.states.receipts.status === 'ready' && schoolsReady;
 const receiptHistory = sources.receipts.reduce<string | null>((a, r) => a === null || Date.parse(r.first_received_at) < Date.parse(a) ? r.first_received_at : a, null);
 const receiptHistoryDay = receiptHistory ? amsterdamDay(receiptHistory) : null;
 const paid = sources.receipts.filter(r => (includeInternal || !internal.has(r.school_id)) && r.provider === 'stripe' && r.event_kind === 'invoice.paid' && r.status === 'succeeded' && r.side_effect_stage === 'completed');
 const receiptIdsByDay = new Map<string, Set<string>>();
 for (const r of paid) { const day = amsterdamDay(r.first_received_at), ids = receiptIdsByDay.get(day) ?? new Set<string>(); ids.add(r.external_event_id); receiptIdsByDay.set(day,ids); }
 add({ ...metricBase('payment_receipts', 'Verwerkte Stripe-factuurbevestigingen', 'Omzet', 'Unieke geslaagde invoice.paid-receipts op first_received_at. Inclusief mogelijke €0-facturen; geen euro-omzet, eerste betaling of MRR.', 'Valideer bedrag, valuta, factuur-ID en creditnota/refund bij de betaalbron.', 'Koppel bedragen voordat dit als omzet of proef-naar-betaaldconversie wordt gebruikt.', 'proxy', 'count'), daily: dayKeys.map(day => receiptReady && receiptHistoryDay && day > receiptHistoryDay ? point(day, receiptIdsByDay.get(day)?.size ?? 0, null, 'count', day === today) : point(day, null, null, 'count', false, 'unavailable')) });
 const inWindow = [...byDay].filter(([day]) => day >= dayKeys[days]).flatMap(([,rows]) => rows);
 return { version: 1, capturedAt: sources.capturedAt, days, segment, historyStart, metrics: segment === 'rijscholen' ? metrics.filter(m => !['lesson','comparison','exam'].includes(m.id)) : metrics, northStar: { users: available ? uniqueUsers(inWindow.filter(meaningful)).size : null, active: available ? uniqueUsers(inWindow).size : null, label: 'Gebruikers met een waardevol scherm · gedragsproxy' }, quality: { events: available ? events.length : null, users: available ? uniqueUsers(events).size : null, unknownRoleUsers: available ? uniqueUsers(events.filter(e => e.rol === 'onbekend')).size : null, firstDayPartial: true, sourceStates: sources.states }, stages: [
  { id: 'awareness', title: 'Bereik', question: 'Komen de juiste mensen binnen?', metricId: 'awareness', target: 'Bezoek → app-storeklik' },
  { id: 'acquisition', title: 'Acquisitie', question: 'Worden bezoekers gebruikers?', metricId: 'acquisition', target: 'Bezoek → bevestigd account' },
  { id: 'activation', title: 'Activatie', question: 'Ervaren zij de eerste waarde?', metricId: 'activation', target: segment === 'leerlingen' ? 'Eerste onderwerp afgerond' : 'Eerste les opgeslagen' },
  { id: 'retention', title: 'Retentie', question: 'Komen zij terug?', metricId: 'retention7', target: 'D1 / D7-terugkeer' },
  { id: 'referral', title: 'Referral', question: 'Brengen zij anderen mee?', metricId: 'referral', target: 'Nieuwe geldige verwijzingen' },
  { id: 'revenue', title: 'Omzet', question: 'Worden zij betalende klanten?', metricId: 'revenue', target: 'Proef → eerste betaling' },
 ] };
}
/** SVG-segmenten onderbreken bij ontbrekende data; geen lijn door onbekende historie. */
export function linePaths(points: (number | null)[], width: number, height: number, max: number): string[] {
 const paths: string[] = []; let path = '';
 points.forEach((value, i) => { if (value === null) { if (path) paths.push(path); path = ''; return; } const x = points.length <= 1 ? width / 2 : i / (points.length - 1) * width, y = height - Math.min(max, Math.max(0, value)) / max * height; path += `${path ? ' L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`; });
 if (path) paths.push(path); return paths;
}
/** Gewogen 7-daagse conversie, uitsluitend zeven volledige meetdagen; niet het gemiddelde van percentages. */
export function rollingRate(points: DailyPoint[]): (number | null)[] {
 return points.map((_, i) => { const window = points.slice(Math.max(0, i - 6), i + 1); if (window.length !== 7 || window.some(p => p.provisional || p.numerator === null || p.denominator === null)) return null; return ratio(window.reduce((n,p) => n + p.numerator!,0),window.reduce((n,p) => n + p.denominator!,0)); });
}
