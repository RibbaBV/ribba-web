import { growthEvidence, validateInsights, type GrowthDashboard } from './owner-dashboard';
const schema={type:'object',additionalProperties:false,required:['suggestions'],properties:{suggestions:{type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['evidence','title','hypothesis','action','measure'],properties:{
 evidence:{type:'string',enum:['no_lesson_type','no_first_lesson','inactive','activation','usage','support']},
 title:{type:'string'},hypothesis:{type:'string'},action:{type:'string'},measure:{type:'string'},
}}}}};
/** No tools, no user text, no writes or messaging by the model. */
export async function generateGrowthInsights(data:GrowthDashboard,key:string,model:string) {
 const response=await fetch('https://api.openai.com/v1/responses',{
  method:'POST',signal:AbortSignal.timeout(20000),cache:'no-store',
  headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
  body:JSON.stringify({model,store:false,max_output_tokens:1800,
   instructions:'Je adviseert de eigenaar van Ribba in het Nederlands. Geef maximaal 3 concrete experimenten op basis van de aangeleverde tellingen. Gebruik alleen bestaande evidence-categorieën. Scheid hypothese, actie en meetbaar effect. Verzin geen oorzaken, klanten, inkomsten, percentages of doelen die al behaald zouden zijn. Geen voorspellingen of zekerheidsscores. Je meet geen doorlooptijd, afgebroken formulieren, navigatieproblemen of hoeveelheid support. Trek daarover geen conclusies. Een volledig afgeronde onboardingcohort biedt geen aanleiding voor een onboardingverbetering. Stel geen generieke interfaceverbeteringen voor zonder een gemeten tekort. Kleine aantallen zijn onzeker. Actief betekent hier nieuwe les of factuur geregistreerd, inclusief automatisering; dit meet geen menselijke app-activiteit. Lesimporten uit Plango zijn uitgesloten. Bronrecords kunnen verwijderd zijn; een daling bewijst geen klantverlies. Onboarding gaat over nieuwe scholen, signalen over de huidige hele basis. Geen actie voorstellen voor een lege signaalcategorie. Bij onvoldoende data: minder of geen voorstellen. Voor ieder experiment: formuleer een te toetsen hypothese, één uitvoerbare actie en meet wat binnen 7 dagen verandert. Supportgegevens hebben een eigen venster van 30 dagen, ongeacht days. Ze zijn handmatige observaties en geen volledige probleemregistratie. Gebruik evidence support alleen bij geregistreerde hulpvragen; noem de gemeten categorie en aantallen, onderscheid vragen van unieke scholen. Geen berichten verzenden en geen persoonsgegevens opvragen.',
   input:JSON.stringify(growthEvidence(data)),text:{format:{type:'json_schema',name:'growth_suggestions',strict:true,schema}},
  }),
 });
 if(!response.ok) throw new Error('AI unavailable');
 const body=await response.json();
 if(body.status!=='completed' || !Array.isArray(body.output)) throw new Error('AI incomplete');
 const texts=body.output.flatMap((item:{type?:string;content?:{type?:string;text?:string}[]})=>item.type==='message' && Array.isArray(item.content)?item.content.filter(c=>c.type==='output_text').map(c=>c.text):[]);
 if(texts.length!==1 || typeof texts[0]!=='string') throw new Error('AI output unavailable');
 const result=validateInsights(JSON.parse(texts[0]));
 const facts=growthEvidence(data);
 for(const suggestion of result.suggestions) {
  if(suggestion.evidence in facts.signals && facts.signals[suggestion.evidence as keyof typeof facts.signals]===0) throw new Error('Unsupported signal');
  if(suggestion.evidence==='activation' && (facts.onboarding.total===0 || (facts.onboarding.profile===facts.onboarding.total && facts.onboarding.lesson_type===facts.onboarding.total && facts.onboarding.first_lesson===facts.onboarding.total))) throw new Error('No cohort');
  if(suggestion.evidence==='support' && !facts.journey?.topics.some(t=>t.cases>0)) throw new Error('No support evidence');
  if(suggestion.evidence==='usage' && facts.metrics.schools===0) throw new Error('No usage base');
 }
 return result;
}
