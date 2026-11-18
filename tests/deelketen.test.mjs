// Deelketen (18 nov 2026): codenormalisatie, botfilter, platform en de telling,
// zonder netwerk. De AASA moet het pad /s/* aan de app geven.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appDeelLink,isBotUserAgent,normaliseerDeelcode,platformUitUserAgent,registreerLinkOpening} from '../lib/deelketen.ts';

const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID='Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const MAC='Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';

test('deelcode: zes tekens zonder 0/O/1/I, hoofdletters en spaties genormaliseerd',()=>{
 assert.equal(normaliseerDeelcode(' k7m2pq '),'K7M2PQ');
 for(const fout of ['K7M2P','K7M2PQR','K0M2PQ','KOM2PQ','K7M2P1','K7M2PI','ABC-DE','',null,undefined,42])assert.equal(normaliseerDeelcode(fout),null,String(fout));
});
test('platform uit de user-agent',()=>{
 assert.equal(platformUitUserAgent(IPHONE),'ios');
 assert.equal(platformUitUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'),'ios');
 assert.equal(platformUitUserAgent(ANDROID),'android');
 assert.equal(platformUitUserAgent(MAC),'other');
 assert.equal(platformUitUserAgent(null),'other');
});
test('bots en linkpreviews tellen niet; een lege user-agent ook niet',()=>{
 for(const bot of ['WhatsApp/2.23.20.0 A','facebookexternalhit/1.1','Slackbot-LinkExpanding 1.0','Twitterbot/1.0','TelegramBot (like TwitterBot)','Googlebot/2.1','Mozilla/5.0 (compatible; bingbot/2.0)','SomeCrawler/1.0','Mozilla/5.0 LinkPreview','',null,undefined])assert.equal(isBotUserAgent(bot),true,String(bot));
 for(const mens of [IPHONE,ANDROID,MAC])assert.equal(isBotUserAgent(mens),false);
});
test('de app-link gebruikt het eigen schema en het pad s/CODE',()=>{
 assert.equal(appDeelLink('K7M2PQ'),'ribba://s/K7M2PQ');
});
function nepDb(bestaat,{faalt=false}={}){
 const geteld=[];
 return {geteld,db:{async codeBestaat(){if(faalt)throw new Error('db weg');return bestaat;},async telOpening(code,platform){geteld.push({code,platform});}}};
}
test('een echte opening van een bestaande code wordt één keer geteld met platform',async()=>{
 const {db,geteld}=nepDb(true);
 assert.equal(await registreerLinkOpening('K7M2PQ',IPHONE,db),'geteld');
 assert.equal(await registreerLinkOpening('K7M2PQ',ANDROID,db),'geteld');
 assert.deepEqual(geteld,[{code:'K7M2PQ',platform:'ios'},{code:'K7M2PQ',platform:'android'}]);
});
test('onbekende code en bots schrijven niets',async()=>{
 const onbekend=nepDb(false);
 assert.equal(await registreerLinkOpening('K7M2PQ',IPHONE,onbekend.db),'onbekende_code');
 const bot=nepDb(true);
 assert.equal(await registreerLinkOpening('K7M2PQ','WhatsApp/2.23',bot.db),'bot');
 assert.deepEqual([...onbekend.geteld,...bot.geteld],[]);
});
test('een databasefout breekt niets: resultaat "fout", geen exception',async()=>{
 const {db}=nepDb(true,{faalt:true});
 assert.equal(await registreerLinkOpening('K7M2PQ',IPHONE,db),'fout');
});
test('de AASA geeft /s/* aan de app, naast de bestaande paden',()=>{
 const aasa=JSON.parse(readFileSync(new URL('../public/.well-known/apple-app-site-association',import.meta.url),'utf8'));
 const paden=aasa.applinks.details[0].components;
 const s=paden.find(c=>c['/']==='/s/*');
 assert.ok(s,'pad /s/* ontbreekt');
 assert.equal(s.exclude,undefined,'/s/* mag niet uitgesloten zijn');
 assert.ok(paden.some(c=>c['/']==='/join/*'),'bestaande paden blijven staan');
});
