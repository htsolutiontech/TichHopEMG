'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=JSON.parse(fs.readFileSync(__dirname+'/../data/curriculum.json','utf8'));
const ctx=vm.createContext({console,Date,Math,JSON,Set,Number,String,Array,Object,Error});
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/Code.gs','utf8')+'\n'+fs.readFileSync(__dirname+'/../apps-script/Auth.gs','utf8'),ctx);
const headers=vm.runInContext('HEADERS',ctx),tables=Object.fromEntries(Object.keys(headers).map(k=>[k,[]]));
const cache=new Map(),props=new Map([['AUTH_SECRET','a'.repeat(100)],['DAILY_MAIL_LIMIT','50']]),mail=[];
let count=0;
Object.assign(ctx,{
 Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],computeHmacSha256Signature:(s,k)=>[...crypto.createHmac('sha256',k).update(s).digest()],formatDate:()=>new Date().toISOString().slice(0,10)},
 CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})},
 MailApp:{getRemainingDailyQuota:()=>100,sendEmail:m=>mail.push(m)},
 props_:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)}),
 rows_:n=>tables[n].map(x=>({...x})),
 add_:(n,o)=>tables[n].push({...o}),
 sheet_:n=>({getRange:(row,col,rs,cols)=>({setValues:vals=>{tables[n][row-2]=Object.fromEntries(headers[n].map((k,i)=>[k,vals[0][i]]));}})}),
 removeWhere_:(n,p)=>{tables[n]=tables[n].filter(x=>!p(x));},curriculum_:()=>C
});
function call(action,data={}){const r=JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({action,...data})}}));return r;}
function good(action,data){const r=call(action,data);assert.equal(r.ok,true,r.error);return r.data;}
function bad(action,data){const r=call(action,data);assert.equal(r.ok,false);return r;}
function test(name,fn){for(const k of cache.keys())if(k.startsWith('auth-')||k.startsWith('rate:'))cache.delete(k);fn();count++;console.log('PASS '+name);}
const email='parent@example.com',emailB='other@example.com',password='A long unique password 2026!',password2='A different password 2027!';
function proof(email,password){return crypto.pbkdf2Sync(password,Buffer.from(ctx.salt_(email),'hex'),600000,32,'sha256').toString('hex');}
const key=proof(email,password),keyB=proof(emailB,password),newKey=proof(email,password2);
function latestCode(address){return mail.filter(m=>m.to===address).at(-1).body.match(/: (\d{6})/)[1];}
let tokenA,tokenB,kidToken,childA,childB,q;
test('70 ordered lessons; 85 vocabulary entries; unchanged curriculum',()=>{assert.equal(C.lessons.length,70);assert.equal(Object.keys(C.vocabulary).length,85);ctx.validateCurriculum_(C);});
test('challenge uses 600000 iterations and does not reveal whether email exists',()=>{const a=good('challenge',{email});const b=good('challenge',{email:emailB});assert.equal(a.algorithm,'PBKDF2-SHA256');assert.equal(a.iterations,600000);assert.match(a.salt,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(a),Object.keys(b));});
test('registration requires guardian consent',()=>bad('register',{email,proof:key,consent:false}));
test('self registration cannot set admin or active status',()=>{good('register',{email,proof:key,consent:true,role:'admin',status:'active'});const u=ctx.findUser_(email);assert.equal(u.role,'parent');assert.equal(u.status,'pending');assert.equal(u.emailVerified,false);});
test('raw password, derived proof and raw OTP are not stored',()=>{const text=JSON.stringify(tables.Users);assert.equal(text.includes(password),false);assert.equal(text.includes(key),false);assert.equal(text.includes(latestCode(email)),false);});
test('unverified account cannot login',()=>bad('login',{email,proof:key}));
test('wrong verification code rejected',()=>bad('verifyEmail',{email,code:latestCode(email)==='000000'?'000001':'000000'}));
test('email code activates account',()=>{good('verifyEmail',{email,code:latestCode(email)});assert.equal(ctx.findUser_(email).emailVerified,true);});
test('verification code cannot replay',()=>bad('verifyEmail',{email,code:latestCode(email)}));
test('repeat registration cannot overwrite verifier or role',()=>{const before=ctx.findUser_(email).verifier;good('register',{email,proof:newKey,consent:true,role:'admin'});assert.equal(ctx.findUser_(email).verifier,before);});
test('valid login creates hashed durable session',()=>{tokenA=good('login',{email,proof:key}).token;assert.match(tokenA,/^vh\./);assert.equal(tables.Sessions.some(s=>s.tokenHash===ctx.digest_(tokenA)),true);assert.equal(JSON.stringify(tables.Sessions).includes(tokenA),false);});
test('role from client is ignored on private API',()=>{bad('admin',{token:tokenA,role:'admin'});});
test('register and verify a second family',()=>{good('register',{email:emailB,proof:keyB,consent:true});good('verifyEmail',{email:emailB,code:latestCode(emailB)});tokenB=good('login',{email:emailB,proof:keyB}).token;});
test('create two owned child profiles',()=>{childA=good('createChild',{token:tokenA,nickname:'Bé A',grade:'la',consent:true}).id;childB=good('createChild',{token:tokenB,nickname:'Bé B',grade:'la',consent:true}).id;});
test('parent sees only own child',()=>{const a=good('state',{token:tokenA});assert.equal(a.children.length,1);assert.equal(a.children[0].id,childA);});
test('parent cannot open or delete another family child',()=>{bad('startChild',{token:tokenA,childId:childB});bad('deleteChild',{token:tokenA,childId:childB});});
test('grades one to five remain unavailable',()=>bad('createChild',{token:tokenA,nickname:'X',grade:'1',consent:true}));
test('opening child session revokes parent session on that device',()=>{kidToken=good('startChild',{token:tokenA,childId:childA}).token;bad('state',{token:tokenA});assert.equal(good('state',{token:kidToken}).child.id,childA);});
test('child cannot escalate role, create profiles or delete profiles',()=>{bad('admin',{token:kidToken,role:'admin'});bad('createChild',{token:kidToken,nickname:'X',grade:'la',consent:true});bad('deleteChild',{token:kidToken,childId:childA});});
test('lesson two blocked without passing first',()=>bad('begin',{token:kidToken,lessonId:'la-02'}));
test('server issues quiz without answer keys',()=>{q=good('begin',{token:kidToken,lessonId:'la-01'});assert.equal(q.questions.length,5);assert.equal(q.questions[0].correct,undefined);});
test('other child cannot submit challenge',()=>{const k=good('startChild',{token:tokenB,childId:childB}).token;bad('submit',{token:k,challenge:q.challenge,answers:['name','friend','teacher','name','friend']});good('logout',{token:k});});
test('fake client score ignored, 40 does not unlock',()=>{const r=good('submit',{token:kidToken,challenge:q.challenge,answers:['name','name','name','name','name'],score:100});assert.equal(r.score,40);bad('begin',{token:kidToken,lessonId:'la-02'});});
test('submit replay rejected',()=>bad('submit',{token:kidToken,challenge:q.challenge,answers:['name','friend','teacher','name','friend']}));
test('80 points unlocks next lesson',()=>{q=good('begin',{token:kidToken,lessonId:'la-01'});const r=good('submit',{token:kidToken,challenge:q.challenge,answers:['name','friend','teacher','name','name']});assert.equal(r.score,80);assert.equal(r.passed,true);assert.equal(good('begin',{token:kidToken,lessonId:'la-02'}).questions.length,5);});
test('invalid answer IDs rejected',()=>{q=good('begin',{token:kidToken,lessonId:'la-02'});bad('submit',{token:kidToken,challenge:q.challenge,answers:['bad','bad','bad','bad','bad']});});
test('updated curriculum invalidates old challenge',()=>{C.version++;bad('submit',{token:kidToken,challenge:q.challenge,answers:['name','friend','teacher','name','friend']});C.version--;});
test('expired session rejected',()=>{const hash=ctx.digest_(kidToken),r=tables.Sessions.find(x=>x.tokenHash===hash),expiry=r.expires;r.expires=Date.now()-1;bad('state',{token:kidToken});r.expires=expiry;});
test('logout immediately revokes session',()=>{good('logout',{token:kidToken});bad('state',{token:kidToken});});
test('five wrong logins persist account lock',()=>{for(let i=0;i<5;i++)bad('login',{email,proof:'0'.repeat(64)});assert.ok(Number(ctx.findUser_(email).lockedUntil)>Date.now());bad('login',{email,proof:key});ctx.updateUser_(ctx.findUser_(email).uid,{failed:0,lockedUntil:0});});
test('email reset code can be requested without exposing account existence',()=>{ctx.updateUser_(ctx.findUser_(email).uid,{codeSentAt:0});good('requestReset',{email});good('requestReset',{email:'missing@example.com'});assert.equal(ctx.findUser_('missing@example.com'),undefined);});
test('wrong reset code cannot update verifier',()=>{const before=ctx.findUser_(email).verifier;bad('resetPassword',{email,code:latestCode(email)==='000000'?'000001':'000000',proof:newKey});assert.equal(ctx.findUser_(email).verifier,before);});
test('reset changes verifier and revokes all old sessions',()=>{tokenA=good('login',{email,proof:key}).token;good('resetPassword',{email,code:latestCode(email),proof:newKey});bad('state',{token:tokenA});bad('login',{email,proof:key});tokenA=good('login',{email,proof:newKey}).token;});
test('reset code cannot replay',()=>bad('resetPassword',{email,code:latestCode(email),proof:key}));
test('only operator can grant admin; changes apply at next request',()=>{props.set('ADMIN_EMAIL',email);ctx.syncAdmin();assert.equal(good('state',{token:tokenA}).role,'admin');assert.ok(good('admin',{token:tokenA}).audit.length);bad('syncAdmin',{token:tokenA,email:emailB});});
test('admin family view still does not leak another family child',()=>{const a=good('state',{token:tokenA});assert.equal(a.children.length,1);assert.equal(a.children[0].id,childA);});
test('removing admin revokes old session',()=>{props.set('TARGET_EMAIL',email);ctx.removeAdmin();bad('admin',{token:tokenA});tokenA=good('login',{email,proof:newKey}).token;bad('admin',{token:tokenA});});
test('deleting child removes attempts and child sessions',()=>{kidToken=good('startChild',{token:tokenA,childId:childA}).token;tokenA=good('login',{email,proof:newKey}).token;good('deleteChild',{token:tokenA,childId:childA});assert.equal(tables.Attempts.some(x=>x.childId===childA),false);bad('state',{token:kidToken});assert.equal(tables.Children.some(c=>c.id===childB),true);});
test('operator disabling account revokes access',()=>{props.set('TARGET_EMAIL',email);ctx.disableAccount();bad('state',{token:tokenA});bad('login',{email,proof:newKey});});
test('brute force OTP stops after five wrong guesses',()=>{const e='otp@example.com';good('register',{email:e,proof:'1'.repeat(64),consent:true});for(let i=0;i<5;i++)bad('verifyEmail',{email:e,code:latestCode(e)==='000000'?'000001':'000000'});cache.clear();bad('verifyEmail',{email:e,code:latestCode(e)});});
test('expired OTP rejected',()=>{const e='expired@example.com';good('register',{email:e,proof:'1'.repeat(64),consent:true});ctx.updateUser_(ctx.findUser_(e).uid,{codeExpires:Date.now()-1});bad('verifyEmail',{email:e,code:latestCode(e)});});
test('mail resend cooldown blocks repeated messages',()=>{const e='cooldown@example.com';good('register',{email:e,proof:'1'.repeat(64),consent:true});bad('resendVerification',{email:e});});
test('missing, malformed and forged tokens rejected',()=>{bad('state');bad('state',{token:'child.fake'});bad('state',{token:'vh.'+crypto.randomUUID()+crypto.randomUUID()});});
test('formulas neutralized and audit contains no passwords/proofs/tokens',()=>{assert.equal(ctx.safeCell_('=1+1'),"'=1+1");for(const value of [password,key,newKey,tokenA,kidToken])assert.equal(JSON.stringify(tables.Audit).includes(value),false);});
console.log(`${count} backend checks passed. Live Apps Script/Sheets/Mail integration NOT executed.`);
