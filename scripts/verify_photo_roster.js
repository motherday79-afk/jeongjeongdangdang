#!/usr/bin/env node
const fs=require('fs');
const path=require('path');
const {photoRoster}=require('../lib/political_roster');

function fail(msg){console.error('FAIL:',msg);process.exitCode=1;}
const roster=photoRoster();
const counts=roster.reduce((a,x)=>(a[x.entityType]=(a[x.entityType]||0)+1,a),{});
const ids=new Set();
for(const x of roster){
  if(ids.has(String(x.id)))fail(`duplicate id ${x.id} ${x.name}`);ids.add(String(x.id));
  if(!x.name)fail(`missing name id=${x.id}`);
  if(!x.office)fail(`missing office ${x.name}`);
  if(!x.jurisdiction&&!x.constituency&&!x.region)fail(`missing jurisdiction ${x.name}`);
}
const expected={assembly:299,metro:16,local:227,government:20};
for(const [k,v] of Object.entries(expected))if(counts[k]!==v)fail(`${k} expected ${v}, got ${counts[k]||0}`);
if(roster.length!==562)fail(`total expected 562, got ${roster.length}`);
const gov=roster.filter(x=>x.entityType==='government');
for(let i=0;i<20;i++)if(!gov.some(x=>Number(x.id)===910000+i))fail(`government id missing ${910000+i}`);
const pm=gov.find(x=>x.name==='한성숙');
if(!pm?.officialPhoto||!pm?.officialProfileUrl)fail('PM official photo/profile missing');

const index=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
for(const needle of ['resolveAssemblyPhoto(name,member)','resolveWikidataPhotoHQ(name,member)','client-last-known-good','photoFallbackStage','server-person-photo-v8']){
  if(!index.includes(needle))fail(`frontend fallback missing: ${needle}`);
}
const local=fs.readFileSync(path.join(__dirname,'..','lib','local_photo.js'),'utf8');
const audit=fs.readFileSync(path.join(__dirname,'..','lib','photo_audit.js'),'utf8');
if(audit.includes('invalidatePersonPhoto(member.id)'))fail('destructive audit invalidation still present');
if(!local.includes("NEGATIVE_CACHE_VERSION='v6-photo-safe'"))fail('negative cache safety version missing');
if(!local.includes("member.entityType==='assembly'&&!force"))fail('assembly transient failure guard missing');

if(!process.exitCode)console.log(JSON.stringify({ok:true,total:roster.length,counts,governmentOfficialProfileHints:gov.filter(x=>x.officialProfileUrl).length},null,2));
