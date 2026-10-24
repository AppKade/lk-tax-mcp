import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { TaxSession, DISCLAIMER_VERSION, envelope } from '../src/service.ts';
import { EvidenceLedger, extractEvidence } from '../src/evidence.ts';
import { assertPrivateOutput } from '../src/privacy.ts';
import { cleanScope, income, zeroDeductions } from './fixtures.ts';
import { stdioHost } from './stdio-host.ts';
const facts={scope:cleanScope,income,deductions:zeroDeductions,foreign:{employment_lkr:'0',service_net_lkr:'0',foreign_tax_paid:'0'}};
const bank='Year of assessment: 2025/26\nGross interest: LKR 120,000.00\nAdvance withholding deducted: LKR 12,000.00';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
function row(kind:'employment'|'interest',seed=bank){return extractEvidence([bank],kind,digest(seed),'text');}
function ready(){const s=new TaxSession();s.start('2025/26');s.accept(DISCLAIMER_VERSION,true);s.setFacts(facts);return s;}

test('beginner discovery offers manual entry and safe continuation without disclosing answers',()=>{
  const s=new TaxSession();let c=s.localCapabilities();assert.equal(c.getting_started.manual_entry_available,true);
  assert.equal(c.session.active,false);assert.equal(c.session.has_answers,false);
  s.start('2025/26');assert.equal(s.localCapabilities().session.consent_required,true);
  s.accept(DISCLAIMER_VERSION,true);s.setFacts({income:{interest:'123.45'}});c=s.localCapabilities();
  assert.equal(c.session.has_answers,true);assert.equal(c.session.consent_required,false);
  assert.ok(c.getting_started.next_step.includes('Do not start over'));
  assert.ok(!JSON.stringify(c).includes('123.45'));assert.doesNotThrow(()=>assertPrivateOutput(envelope(c)));
});
test('wrong category is corrected for one document without discarding another source',()=>{
  const l=new EvidenceLedger(), wrong=row('employment'), correct=row('interest'), other=row('interest','another bank');
  l.add(wrong);l.add(other);l.decide(other.id,true,other.values,'2025/26',undefined,undefined,true);
  assert.equal(l.progress({}).status,'needs_review');const response=l.reclassify(wrong.id,correct);
  assert.equal(response.reclassified.from,'employment');assert.equal(response.reclassified.to,'interest');
  assert.equal(response.documents.find(r=>r.id===other.id)!.status,'included');
  assert.equal(response.documents.find(r=>r.id===wrong.id)!.review_questions[0].candidate,'120000.00');
  assert.equal(response.documents.find(r=>r.id===wrong.id)!.display_label,'Bank interest document 1');
  assert.throws(()=>l.reclassify(wrong.id,row('employment','a different file')),/EVIDENCE_SOURCE_CHANGED/);
  l.decide(wrong.id,true,correct.values,'2025/26',undefined,'distinct_source',true);
  assert.equal(l.totals().interest,'240000.00');assert.equal(l.totals().employment,undefined); // A pending misclassification never erases unrelated manual salary.
});
test('reclassifying an applied source removes its former category contribution and survives draft metadata roundtrip',()=>{
  const l=new EvidenceLedger(), wrong=row('employment');l.add(wrong);
  l.decide(wrong.id,true,{employment:'120000',apit_credit:'0'},'2025/26',undefined,undefined,true);l.markApplied();
  l.reclassify(wrong.id,row('interest'));assert.equal(l.progress({employment:'120000.00',apit_credit:'0.00'}).calculation_blocked,true);
  l.decide(wrong.id,true,row('interest').values,'2025/26',undefined,undefined,true);
  assert.deepEqual(l.totals(),{employment:'0.00',apit_credit:'0.00',interest:'120000.00',ait_wht_credit:'12000.00'});
  l.markApplied();const restored=new EvidenceLedger();restored.restore(l.snapshot());assert.deepEqual(restored.totals(),l.totals());
});
test('warnings and unknown values give readable instructions rather than suggesting zeros',()=>{
  const l=new EvidenceLedger(), scan=extractEvidence([bank.replace('2025/26','2024/25')],'interest',digest('old scan'),'ocr');l.add(scan);
  const shown=l.list().documents[0];assert.ok(shown.review_notes.some(n=>n.code==='WRONG_YEAR'&&n.message.includes('Exclude')));
  assert.ok(shown.review_notes.some(n=>n.code==='OCR_REVIEW'&&n.message.includes('Check every amount')));
  const empty=new EvidenceLedger();empty.add(extractEvidence(['No recognizable amounts'],'employment',digest('unknown'),'text'));
  assert.ok(empty.list().documents[0].review_questions.every(q=>q.candidate===null&&q.confirmation_required));
});

for(const modern of [false,true])test(`${modern?'modern':'legacy'} novice: ready intake still guides pending documents, and disabled save warns before restart`,async t=>{
  const root=mkdtempSync(join(tmpdir(),'lk-tax-novice-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  writeFileSync(join(root,'bank.csv'),'month,gross_regular,bonus,employee_deductions,apit\n2025-04,150000,0,2400,0');
  const host=stdioHost(modern,{command:process.execPath,args:[join(import.meta.dirname,'../src/cli.ts')],env:{...process.env,LK_TAX_DOCUMENT_ROOT:root,LK_TAX_DRAFT_ROOT:undefined,LK_TAX_DRAFT_KEY_FILE:undefined}});t.after(()=>host.close());
  if(modern)await host.request('server/discover');else{await host.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'novice',version:'1'}});host.notify('notifications/initialized');}
  async function call(name:string,args={}){const r=await host.request('tools/call',{name,arguments:args});assert.equal(r.error,undefined);return r.result.structuredContent;}
  const cap=await call('lk_local_capabilities');assert.equal(cap.getting_started.manual_entry_available,true);assert.ok(cap.getting_started.saving.includes('restart loses unsaved'));
  await call('lk_session',{action:'start'});const d=await call('lk_get_disclaimer');await call('lk_accept_disclaimer',{version:d.version,user_confirmed:true});await call('lk_set_facts',facts);
  await call('lk_documents',{action:'review_file',file:'bank.csv',kind:'employment',user_confirmed:true});
  const progress=await call('lk_next_questions');assert.equal(progress.status,'incomplete');assert.equal(progress.stage,'documents');assert.equal(progress.calculation_ready,false);assert.equal(progress.evidence_progress.status,'needs_review');
  assert.equal((await call('lk_compute_return')).error.code,'EVIDENCE_PENDING');
  const failed=await call('lk_draft',{action:'save',slot:'draft_1',user_confirmed:true});assert.equal(failed.error.code,'DRAFT_FEATURE_DISABLED');assert.ok(failed.error.message.includes('Keep this session open'));
  assert.equal((await call('lk_next_questions')).confirmed_facts.income.employment,income.employment+'.00');
});
