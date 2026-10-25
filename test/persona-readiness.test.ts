import test from 'node:test';
import assert from 'node:assert/strict';
import { TaxSession, DISCLAIMER_VERSION } from '../src/service.ts';
import { computeReturn } from '../src/engine.ts';
import { cleanScope, zeroDeductions, noForeign } from './fixtures.ts';
import { stdioHost } from './stdio-host.ts';
const localIncome = { employment:'0', business_net:'0', interest:'0', rent:'0', final_wht_dividends_gross:'0',
  final_wht_dividends_deducted:'0', apit_credit:'0', ait_wht_credit:'0', instalments_paid:'0', other_income_or_claims:false };
const facts = { scope:cleanScope, income:localIncome, foreign:noForeign, deductions:zeroDeductions };
function session(){const s=new TaxSession();s.start('2025/26');s.accept(DISCLAIMER_VERSION,true);return s;}

test('unprepared business profit stops intake early and every annual output, including contradictory zero profit',()=>{
  const s=session();let p=s.setFacts({scope:{business_profit_needs_computation:true}});
  assert.equal(p.status,'blocked');assert.equal(p.calculation_ready,false);assert.deepEqual(p.questions,[]);
  assert.equal(p.blocking_error,'BUSINESS_PROFIT_REQUIRED');assert.match(p.blocking_guidance!,/outside this tool/);
  p=s.setFacts({...facts,scope:{...cleanScope,business_profit_needs_computation:true}});
  assert.equal(p.calculation_ready,false);
  for(const output of [()=>s.compute(),()=>s.review(),()=>s.checklist(),()=>s.worksheet(),()=>s.preparation()])
    assert.throws(output,/BUSINESS_PROFIT_REQUIRED/);
  assert.throws(()=>computeReturn({ya:'2025/26',...facts,scope:{...cleanScope,business_profit_needs_computation:true}}),/BUSINESS_PROFIT_REQUIRED/);
  // A prepared number alone cannot silently erase the outstanding preparation answer.
  s.setFacts({income:{business_net:'2400000'}});assert.throws(()=>s.compute(),/BUSINESS_PROFIT_REQUIRED/);
  s.setFacts({scope:{business_profit_needs_computation:false}});
  assert.equal(s.compute().figures.tax,'36000.00');
  s.setFacts({scope:{business_profit_needs_computation:true,losses:true}});
  assert.equal(s.nextQuestions().blocking_error,'OUT_OF_SCOPE');assert.throws(()=>s.compute(),/OUT_OF_SCOPE/);
});

test('employee, prepared freelancer, sole trader and combined salary/business conserve personal totals',()=>{
  const cases=[
    {patch:{employment:'1440000'},tax:'0.00',credits:'0.00',balance:'0.00',overpayment:'0.00'},
    {patch:{employment:'3000000',apit_credit:'108000'},tax:'96000.00',credits:'108000.00',balance:'0.00',overpayment:'12000.00'},
    {patch:{business_net:'2400000',ait_wht_credit:'120000'},tax:'36000.00',credits:'120000.00',balance:'0.00',overpayment:'84000.00'},
    {patch:{business_net:'3000000',instalments_paid:'150000'},tax:'96000.00',credits:'150000.00',balance:'0.00',overpayment:'54000.00'},
    {patch:{employment:'2400000',business_net:'1200000',apit_credit:'36000'},tax:'222000.00',credits:'36000.00',balance:'186000.00',overpayment:'0.00'},
  ];
  for(const c of cases){const s=session();s.setFacts({...facts,income:{...localIncome,...c.patch}});const r=s.compute();
    assert.equal(r.figures.tax,c.tax);assert.equal(r.figures.credits,c.credits);assert.equal(r.figures.balance_payable,c.balance);
    assert.equal(r.figures.potential_overpayment,c.overpayment);assert.equal(r.filing_ready,false);
    assert.ok(s.review().checks.every(c=>c.status==='passed'));
  }
});

test('foreign freelancer gets readable eligibility questions and stops on a confirmed failed condition',()=>{
  const s=session();s.setFacts({scope:cleanScope,income:localIncome,deductions:zeroDeductions,
    foreign:{employment_lkr:'0',service_net_lkr:'6000000',foreign_tax_paid:'0'}});
  const p=s.nextQuestions();assert.equal(p.stage,'foreign');assert.equal(p.questions.length,4);
  assert.ok(p.questions.every(q=>q.question!=='Explicitly confirmed fact; missing is not false or zero.'));
  assert.ok(p.questions.some(q=>q.question.includes('licensed bank')));
  assert.ok(p.questions.some(q=>q.question.includes('services used outside')));
  assert.ok(p.not_applicable_facts.includes('foreign.foreign_employer_confirmed'));
  s.setFacts({foreign:{remitted_via_licensed_bank:false}});
  assert.equal(s.nextQuestions().blocking_error,'FOREIGN_ELIGIBILITY_REVIEW');assert.throws(()=>s.compute(),/FOREIGN_ELIGIBILITY_REVIEW/);
});

test('discovery explains individual routes and extraction limits before offering business document reads',()=>{
  const c=session().localCapabilities().getting_started;
  assert.match(c.choose_your_route.sole_trader,/taxable net profit/);
  assert.match(c.choose_your_route.company_or_partnership,/Company accounts, company tax and partnership returns are unsupported/);
  assert.match(c.document_categories,/foreign-service statements/);assert.match(c.document_categories,/Do not relabel/);
});

for(const modern of [false,true])test(`${modern?'modern':'legacy'} freelancer protocol blocks before collecting unrelated facts`,async t=>{
  const host=stdioHost(modern);t.after(()=>host.close());
  if(modern)await host.request('server/discover');else{await host.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'persona-test',version:'1'}});host.notify('notifications/initialized');}
  async function call(name:string,args={}){const r=await host.request('tools/call',{name,arguments:args});assert.equal(r.error,undefined);return r.result.structuredContent;}
  await call('lk_session',{action:'start'});const d=await call('lk_get_disclaimer');await call('lk_accept_disclaimer',{version:d.version,user_confirmed:true});
  const p=await call('lk_set_facts',{scope:{business_profit_needs_computation:true}});
  assert.equal(p.calculation_ready,false);assert.deepEqual(p.questions,[]);assert.equal(p.blocking_error,'BUSINESS_PROFIT_REQUIRED');
  assert.equal((await call('lk_compute_return')).error.code,'BUSINESS_PROFIT_REQUIRED');
});
