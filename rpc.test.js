import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { clientRequestSchema } from './protocol.js';
import { createHost, SETTINGS_CHANNEL, SETTINGS_ENDPOINT, SETTINGS_PATH } from './settings.js';
import { DEFAULT_CONFIG, PROTOCOL, PRESET_ID, validateSettingsPayload, fold, initialState } from './state.js';
const config = extra => ({...DEFAULT_CONFIG,...extra});
function fixture(options = {}) {
  const events = new Map(), changes = new Set(), cells = new Map(), live = new Map(), roots = new Set();
  const browserPeer = {principal:{kind:'owner'},signal:new AbortController().signal};
  const registeredChannels = new Set(['/api']); // Existing API Gateway carrier.
  const fetchRoutes = new Map(), admissions = new WeakMap();
  let definition, handler, detached = false, cleanupGate, initiator, sequence=0;
  const on = (name,fn) => { if(!events.has(name))events.set(name,new Set()); events.get(name).add(fn); return()=>events.get(name).delete(fn); };
  const stateOf = session => { if(!cells.has(session))cells.set(session,session.events.reduce(fold,initialState())); return cells.get(session); };
  function agent(id, isRoot = true, preset = PRESET_ID) {
    const inherited = ['read','write','subagent'].map(name=>({name,description:name}));
    const restrictions = new Set(), guards = new Set(), sections = new Set(), contexts = new Set(), effects = new Set();
    let mode;
    const a = {id,status:'idle',preset,session:{events:[],get seq(){return this.events.length;},snapshotEvents(from){return this.events.slice(from);}},beforeAppend:null,afterAppend:null};
    a.session.append = (type,data) => {
      a.beforeAppend?.(type,data);
      const old = stateOf(a.session), event = {type,data,seq:a.session.events.length,time:Date.now()};
      a.session.events.push(event); const next = definition.apply(old,event); cells.set(a.session,next);
      if(old.snapshot!==next.snapshot)for(const fn of changes)fn(a.session,definition.key);
      a.afterAppend?.(type,data);
      return event;
    };
    a.ctx = { on:()=>()=>{}, effect(fn){const dispose=fn();effects.add(dispose);return()=>{dispose();effects.delete(dispose);};},
      tools:{schemas:()=>inherited.filter(t=>[...restrictions].every(r=>r.allow.includes(t.name))),
        restrict(r){restrictions.add(r);return()=>restrictions.delete(r);},
        presentAs(m){if(mode)throw new Error('mode conflict');mode=m;return()=>{mode=undefined;};},
        guard(fn){guards.add(fn);return()=>guards.delete(fn);}},
      systemPrompt:{section(s){sections.add(s);return()=>sections.delete(s);},context(c){contexts.add(c);return()=>contexts.delete(c);},getContextOrder:()=>100,suppressRuntimeContext:()=>()=>{}}};
    Object.assign(a,{restrictions,guards,sections,contexts}); live.set(id,a); if(isRoot)roots.add(a); return a;
  }
  const first = agent('root'), child = agent('child',false), ordinary = agent('ordinary',true,'standard');
  const ctx = {logger:{warn(){}},on,agents:{get:id=>live.get(id),list:()=>[...live.values()],roots:()=>[...roots],currentInitiator:()=>initiator},
    agentPresets:{composedPreset:context=>[...live.values()].find(a=>a.ctx===context)?.preset},
    sessionProjections:{register(value){definition=value;return()=>{definition=undefined;cells.clear();};},stateOf,onChanged(fn){changes.add(fn);return()=>changes.delete(fn);}},
    connection:{browserPeer,
      admit(request){return admissions.get(request)??{rejection:401};},
      rpc:{intercept(){throw new Error('connection: shared RPC channel "/api" already has an interceptor');},
        handle(){throw new Error('cannot get property "webServer" without inject');}},
      fetch:{register(route){
        assert.equal(route.path,SETTINGS_PATH);assert.deepEqual(route.methods,['POST']);assert.equal(route.requestBody,'buffered');
        if(fetchRoutes.has(route.path))throw new Error('duplicate exact route');
        fetchRoutes.set(route.path,route);handler=route.fetch;
        return async()=>{detached=true;fetchRoutes.delete(route.path);await cleanupGate;handler=undefined;};
      }},
    }};
  Object.defineProperty(ctx,'commands',{get(){throw new Error('public commands accessed');}});
  Object.defineProperty(ctx,'webServer',{get(){throw new Error('cannot get property "webServer" without inject');}});
  const dispose = createHost(ctx,z,{previewDefaultPrompt:async()=> 'Default {{model}} template',...options});
  const fetchRaw = (extra={}) => {
    const method=extra.httpMethod??'POST';
    const message=extra.message??{type:'client-request',rpcId:`test-${++sequence}`,method:extra.endpoint??SETTINGS_ENDPOINT,payload:Object.hasOwn(extra,'payload')?extra.payload:{sessionId:'root',request:{action:'get'}}};
    const request=new Request('http://dsh.test'+(extra.path??SETTINGS_PATH),{method,
      headers:{'content-type':'application/json',...extra.headers},
      ...(method==='POST'?{body:extra.body??JSON.stringify(message)}:{}),
      ...(extra.body instanceof ReadableStream?{duplex:'half'}:{}),signal:extra.signal});
    admissions.set(request,extra.admission??{peer:extra.peer??browserPeer});
    return handler(request);
  };
  const call = async (request={action:'get'},extra={}) => {
    const response=await fetchRaw({...extra,payload:Object.hasOwn(extra,'payload')?extra.payload:{sessionId:extra.sessionId??'root',request}});
    return (await response.json()).result;
  };
  return {ctx,first,child,ordinary,browserPeer,call,fetchRaw,dispose,stateOf,fetchRoutes,registeredChannels,
    detached:()=>detached,setCleanupGate(value){cleanupGate=value;},setInitiator(value){initiator=value;},remove(id){roots.delete(live.get(id));live.delete(id);}};
}

test('exact Fetch route coexists with Gateway and never reads uninjected webServer', async()=>{
  const f=fixture();assert.deepEqual([...f.fetchRoutes.keys()],['/api/customize-mode-settings']);
  assert.deepEqual([...f.registeredChannels],['/api']);
  assert.equal((await f.call({}, {endpoint:'commands.execute'})).error.code,'INVALID_REQUEST');
  assert.equal(f.first.session.events.length,0);
  assert.equal(`${SETTINGS_CHANNEL}/${SETTINGS_ENDPOINT}`.slice(1),'api/customize-mode-settings');
  await f.dispose();assert.equal(f.detached(),true);assert.equal(f.fetchRoutes.size,0);assert.deepEqual([...f.registeredChannels],['/api']);
});
test('local protocol parser matches the published Connection envelope and strips unknown fields',()=>{
  const message={type:'client-request',rpcId:'r-1',method:SETTINGS_ENDPOINT,payload:{sessionId:'root'},extra:'ignored'};
  assert.deepEqual(clientRequestSchema.parse(message),{type:'client-request',rpcId:'r-1',method:SETTINGS_ENDPOINT,payload:{sessionId:'root'}});
  for(const invalid of [null,[],{}, {...message,type:'server-response'}, {...message,rpcId:1}, {...message,method:null}])assert.equal(clientRequestSchema.safeParse(invalid).success,false);
});
test('Fetch preserves official RPC correlation and JSON response framing',async()=>{
  const f=fixture();const response=await f.fetchRaw({message:{type:'client-request',rpcId:'correlation-123',method:SETTINGS_ENDPOINT,payload:{sessionId:'root',request:{action:'get'}}}});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();assert.equal(body.type,'server-response');assert.equal(body.rpcId,'correlation-123');assert.equal(body.result.ok,true);
  assert.equal(f.first.session.events.length,0);await f.dispose();
});
test('Fetch refuses failed origin/auth admission before parsing or logging',async()=>{
  const f=fixture();
  for(const status of [401,403]){
    const response=await f.fetchRaw({admission:{rejection:status},body:'not JSON'});
    assert.equal(response.status,status);assert.equal((await response.json()).result.ok,false);
  }
  assert.equal(f.first.session.events.length,0);await f.dispose();
});
test('Fetch validates method, path, content type, malformed JSON and envelope method',async()=>{
  const f=fixture();
  assert.equal((await f.fetchRaw({httpMethod:'GET'})).status,404);
  assert.equal((await f.fetchRaw({path:'/api/another-feature'})).status,404);
  assert.equal((await f.fetchRaw({headers:{'content-type':'text/plain'}})).status,415);
  assert.equal((await f.fetchRaw({body:'not JSON'})).status,400);
  const mismatch=await f.fetchRaw({message:{type:'client-request',rpcId:'mismatch',method:'other',payload:{}}});
  const mismatchBody=await mismatch.json();
  assert.equal(mismatchBody.rpcId,'mismatch');assert.equal(mismatchBody.result.error.code,'INVALID_REQUEST');
  const invalid=await f.fetchRaw({message:{type:'not-a-request',rpcId:'bad',method:SETTINGS_ENDPOINT,payload:{}}});
  assert.equal((await invalid.json()).result.error.code,'INVALID_REQUEST');
  assert.equal(f.first.session.events.length,0);await f.dispose();
});
test('Fetch enforces raw request bytes before JSON parsing',async()=>{
  const f=fixture();
  assert.equal((await f.fetchRaw({headers:{'content-length':String(4*1024*1024+32769)}})).status,413);
  assert.equal((await f.fetchRaw({body:' '.repeat(4*1024*1024+32769)})).status,413);
  assert.equal(f.first.session.events.length,0);await f.dispose();
});
test('only the exact authenticated owner browser peer can read or mutate', async()=>{
  const f=fixture();
  for(const peer of [{principal:{kind:'owner'},signal:new AbortController().signal},{principal:{kind:'agent'},signal:new AbortController().signal},{}]) {
    assert.equal((await f.call({action:'get'},{peer})).error.code,'FORBIDDEN');
    assert.equal((await f.call({action:'set',expectedRevision:0,config:config()},{peer})).error.code,'FORBIDDEN');
  }
  assert.equal(f.first.session.events.length,0);await f.dispose();
});
test('exact browser peer also requires owner principal and live lifetime',async()=>{
  const f=fixture();f.browserPeer.principal={kind:'agent'};
  assert.equal((await f.call()).error.code,'FORBIDDEN');
  f.browserPeer.principal={kind:'owner'};f.browserPeer.signal=AbortSignal.abort();
  assert.equal((await f.call()).error.code,'FORBIDDEN');assert.equal(f.first.session.events.length,0);await f.dispose();
});
test('get is read-only and keeps runtime/time flag configuration intact',async()=>{
  const f=fixture();const response=await f.call();assert.equal(response.ok,true);assert.equal(response.value.protocol,PROTOCOL);
  assert.equal(response.value.config.includeRuntimeContext,true);assert.equal(response.value.config.includeTimeContext,true);
  assert.equal(f.first.session.events.length,0);await f.dispose();
});
test('root, mode, schema, abort and size admission failures write no logs',async()=>{
  const f=fixture();
  assert.equal((await f.call({action:'get'},{sessionId:'missing'})).error.code,'SESSION_NOT_FOUND');
  assert.equal((await f.call({action:'get'},{sessionId:'child'})).error.code,'ROOT_SESSION_REQUIRED');
  assert.equal((await f.call({action:'get'},{sessionId:'ordinary'})).error.code,'WRONG_PRESET');
  for(const payload of [null,[],{}, {sessionId:'root',request:{action:'get',extra:true}}, {sessionId:'root',request:{action:'set',expectedRevision:0,config:{}}}])assert.equal((await f.call({}, {payload})).ok,false);
  const signal=AbortSignal.abort();assert.equal((await f.call({}, {signal})).error.code,'ABORTED');
  const huge=config({prompt:'\u6f22'.repeat(1000000),allowedTools:Array.from({length:2000},(_,i)=>'\u5b57'.repeat(250)+i)});
  assert.throws(()=>validateSettingsPayload({sessionId:'root',request:{action:'set',expectedRevision:0,config:huge}}),/4 MiB/);
  assert.equal(f.first.session.events.length,0);await f.dispose();
});
test('set atomically appends only paired lifecycle records and CAS prevents lost updates',async()=>{
  const f=fixture();const request={action:'set',expectedRevision:0,config:config({overridePrompt:true,prompt:'',allowedTools:[],includeRuntimeContext:false,includeTimeContext:false})};
  const [one,two]=await Promise.all([f.call(request),f.call(request)]);
  assert.equal(one.ok,true);assert.equal(two.error.code,'REVISION_CONFLICT');
  assert.deepEqual(f.first.session.events.map(e=>e.type),['command/run','command/done']);
  assert.equal(f.first.session.events[0].data.name,'customize-mode');assert.equal('args' in f.first.session.events[0].data,false);
  assert.equal(f.stateOf(f.first.session).snapshot.revision,1);assert.deepEqual(f.first.ctx.tools.schemas(),[]);
  assert.equal(f.stateOf(f.first.session).snapshot.config.includeTimeContext,false);
  assert.equal(f.stateOf(f.first.session).snapshot.config.includeRuntimeContext,false);
  assert.equal([...f.first.sections][0].text,'');
  assert.equal(f.first.session.events.reduce(fold,initialState()).snapshot.revision,1);
  await f.dispose();
});
test('running or agent-origin writes are rejected before lifecycle append',async()=>{
  const f=fixture(), request={action:'set',expectedRevision:0,config:config()};
  f.first.status='running';assert.equal((await f.call(request)).error.code,'RUNNING');
  f.first.status='idle';f.setInitiator(f.first);assert.equal((await f.call(request)).error.code,'HUMAN_ONLY');
  assert.equal(f.first.session.events.length,0);await f.dispose();
});
test('failure or cancellation after admission logs failed done but never applies config',async()=>{
  const f=fixture();const request={action:'set',expectedRevision:0,config:config({allowedTools:['run_code']})};
  assert.equal((await f.call(request)).error.code,'RESERVED_TOOL');
  assert.equal(f.first.session.events.length,0);assert.equal(f.stateOf(f.first.session).snapshot.revision,0);
  const abort=new AbortController();f.first.afterAppend=(type)=>{if(type==='command/run')abort.abort();};
  assert.equal((await f.call({...request,config:config({allowedTools:[]})},{signal:abort.signal})).error.code,'ABORTED');
  assert.equal(f.stateOf(f.first.session).snapshot.revision,0);assert.equal(f.first.ctx.tools.schemas().length,3);
  await f.dispose();
});
test('success append failure rolls back staging and settlement permits retry',async()=>{
  const f=fixture();let once=true;
  f.first.beforeAppend=(type,data)=>{if(once&&type==='command/done'&&data.kind==='success'){once=false;throw new Error('disk failure');}};
  const request={action:'set',expectedRevision:0,config:config({allowedTools:[]})};
  assert.equal((await f.call(request)).error.code,'COMMIT_FAILED');assert.equal(f.stateOf(f.first.session).snapshot.revision,0);
  assert.equal(f.first.ctx.tools.schemas().length,3);assert.equal(f.first.session.events.at(-1).data.kind,'error');
  assert.equal((await f.call(request)).ok,true);await f.dispose();
});
test('an observer error after committed success never creates contradictory failure log',async()=>{
  const f=fixture();f.first.afterAppend=(type,data)=>{if(type==='command/done'&&data.kind==='success')throw new Error('observer failed');};
  const response=await f.call({action:'set',expectedRevision:0,config:config({allowedTools:[]})});
  assert.equal(response.ok,true);assert.equal(response.value.revision,1);assert.equal(f.first.session.events.length,2);await f.dispose();
});
test('get preview runs without logs and teardown cancels pending preview before policy disposal',async()=>{
  let started;const began=new Promise(resolve=>{started=resolve;});
  const f=fixture({previewDefaultPrompt:(_agent,{signal})=>{started();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));}});
  const read=f.call();await began;
  let release;f.setCleanupGate(new Promise(resolve=>{release=resolve;}));
  const stopping=f.dispose();assert.equal(f.detached(),true);assert.equal(f.first.guards.size,1);
  release();assert.equal((await read).error.code,'ABORTED');await stopping;
  assert.equal(f.first.guards.size,0);assert.equal(f.first.session.events.length,0);
});
test('a settings change during async preview returns a revision conflict',async()=>{
  let release,started;const began=new Promise(resolve=>{started=resolve;});
  const f=fixture({previewDefaultPrompt:()=>new Promise(resolve=>{release=resolve;started();})});
  const read=f.call();await began;
  assert.equal((await f.call({action:'set',expectedRevision:0,config:config({prompt:'new'})})).ok,true);
  release('default');assert.equal((await read).error.code,'REVISION_CONFLICT');await f.dispose();
});
test('preview callback result is returned as defaultPrompt without altering saved override',async()=>{
  const f=fixture({previewDefaultPrompt:async()=> 'Default {{model}} prompt'});
  const read=await f.call();assert.equal(read.value.defaultPrompt,'Default {{model}} prompt');
  assert.equal(read.value.config.overridePrompt,false);assert.equal(f.first.session.events.length,0);await f.dispose();
});

test('an observer throwing after command/run is settled instead of leaving a pending write', async()=>{
  const f=fixture();let once=true;
  f.first.afterAppend=type=>{if(type==='command/run'&&once){once=false;throw new Error('observer failure');}};
  const request={action:'set',expectedRevision:0,config:config({allowedTools:[]})};
  assert.equal((await f.call(request)).error.code,'COMMIT_FAILED');
  assert.deepEqual(f.stateOf(f.first.session).pending,[]);
  assert.equal(f.first.session.events.at(-1).data.kind,'error');
  assert.equal((await f.call(request)).ok,true);
  await f.dispose();
});

test('the committed record wins over cancellation from a post-commit observer', async()=>{
  const f=fixture(), abort=new AbortController();
  f.first.afterAppend=(type,data)=>{if(type==='command/done'&&data.kind==='success')abort.abort();};
  const result=await f.call({action:'set',expectedRevision:0,config:config({allowedTools:[]})},{signal:abort.signal});
  assert.equal(result.ok,true);assert.equal(result.value.revision,1);
  assert.equal(f.first.session.events.length,2);await f.dispose();
});

test('teardown drains a cancelled preview finalizer before removing policies', async()=>{
  let started,release;const began=new Promise(resolve=>{started=resolve;});
  const cleanup=new Promise(resolve=>{release=resolve;});
  const f=fixture({previewDefaultPrompt:async(_agent,{signal})=>{
    started();
    try {await new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));}
    finally {await cleanup;}
  }});
  const reading=f.call();await began;
  let disposed=false;const stopping=f.dispose().then(()=>{disposed=true;});
  assert.equal((await reading).error.code,'ABORTED');
  assert.equal(disposed,false);assert.equal(f.first.guards.size,1);
  release();await stopping;assert.equal(f.first.guards.size,0);
});

test('closing or switching a session during preview cannot return stale settings', async()=>{
  for(const mutate of [f=>f.remove('root'),f=>{f.first.preset='standard';}]){
    let started,release;const began=new Promise(resolve=>{started=resolve;});
    const f=fixture({previewDefaultPrompt:()=>new Promise(resolve=>{started();release=resolve;})});
    const reading=f.call();await began;mutate(f);release('default');
    assert.equal((await reading).error.code,'SESSION_CHANGED');await f.dispose();
  }
});

test('readback rechecks root ownership and current running state after preview', async()=>{
  for (const loseRoot of [false,true]) {
    let started,release;const began=new Promise(resolve=>{started=resolve;});
    const f=fixture({previewDefaultPrompt:()=>new Promise(resolve=>{started();release=resolve;})});
    const reading=f.call();await began;
    if(loseRoot)f.ctx.agents.roots=()=>[];else f.first.status='running';
    release('default');const result=await reading;
    if(loseRoot)assert.equal(result.error.code,'ROOT_SESSION_REQUIRED');
    else {assert.equal(result.value.running,true);assert.equal(result.value.warnings[0].code,'CATALOG_STALE');}
    await f.dispose();
  }
});

test('body cancellation failure cannot mask abort or stall teardown', async()=>{
  const f=fixture(), abort=new AbortController();let pulling;
  const started=new Promise(resolve=>{pulling=resolve;}), problem=new Error('cancel failed'), logs=[];
  f.ctx.logger.warn=(...args)=>logs.push(args);
  const body=new ReadableStream({pull(){pulling();return new Promise(()=>{});},cancel(){throw problem;}});
  const reading=f.fetchRaw({body,signal:abort.signal});await started;abort.abort();
  const response=await reading;assert.equal((await response.json()).result.error.code,'ABORTED');
  await f.dispose();assert.ok(logs.some(args=>args.includes(problem)));
});

test('unexpected preview errors expose a stable diagnostic, not internal exception text', async()=>{
  const f=fixture({previewDefaultPrompt:async()=>{throw new Error('private internal information');}});
  const result=await f.call();assert.equal(result.error.code,'PREVIEW_FAILED');
  assert.doesNotMatch(JSON.stringify(result),/private internal information/);
  assert.deepEqual(result.error.details,{});await f.dispose();
});
