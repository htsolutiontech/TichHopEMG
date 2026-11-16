/* v2 Sheets-only backend. Raw passwords, derived proofs and raw session tokens are never stored. */
const HEADERS = {
 Users:['uid','email','verifier','role','status','emailVerified','createdAt','failed','lockedUntil','codeHash','codePurpose','codeExpires','codeTries','codeSentAt','consentVersion'],
 Sessions:['tokenHash','uid','kind','childId','expires','createdAt'],
 Parents:['uid','createdAt','consentVersion'],
 Children:['id','parentUid','nickname','grade','createdAt'],
 Attempts:['id','childId','lessonId','score','at','curriculumVersion'],
 Audit:['at','uid','event','ref'],
 Curriculum:['version','json','publishedAt']
};
function props_(){return PropertiesService.getScriptProperties();}
function db_(){const id=props_().getProperty('SPREADSHEET_ID');if(!id)throw Error('Chưa cấu hình hệ thống.');return SpreadsheetApp.openById(id);}
function sheet_(name){const s=db_().getSheetByName(name);if(!s)throw Error('Chưa khởi tạo dữ liệu.');return s;}
function rows_(name){const v=sheet_(name).getDataRange().getValues();return v.slice(1).filter(r=>r[0]!=='' ).map(r=>Object.fromEntries(HEADERS[name].map((k,i)=>[k,r[i]])));}
function add_(name,o){sheet_(name).appendRow(HEADERS[name].map(k=>typeof o[k]==='string'?safeCell_(o[k]):o[k]??''));}
function safeCell_(v){return /^[=+\-@]/.test(v)?"'"+v:v;}
function now_(){return new Date().toISOString();}
function audit_(uid,event,ref){add_('Audit',{at:now_(),uid,event,ref:ref||''});}
function digest_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function locked_(fn){const l=LockService.getScriptLock();if(!l.tryLock(15000))throw Error('Hệ thống đang bận. Vui lòng thử lại.');try{return fn();}finally{l.releaseLock();}}
function setup(){
 // Set SPREADSHEET_ID first. setup creates AUTH_SECRET once; back it up privately. 
 locked_(()=>{if(!props_().getProperty('AUTH_SECRET'))props_().setProperty('AUTH_SECRET',Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid());const db=db_();Object.keys(HEADERS).forEach(n=>{let s=db.getSheetByName(n);if(!s){s=db.insertSheet(n);s.appendRow(HEADERS[n]);s.setFrozenRows(1);}else if(JSON.stringify(s.getRange(1,1,1,HEADERS[n].length).getValues()[0])!==JSON.stringify(HEADERS[n]))throw Error('Schema mismatch: '+n);});if(!rows_('Curriculum').length)writeCurriculum_(SEED);});
}
function validateCurriculum_(c){
 if(!c||!Number.isInteger(c.version)||c.version<1||c.passScore!==80||!Array.isArray(c.lessons)||!c.lessons.length||!c.vocabulary)throw Error('Học liệu không hợp lệ.');
 const ids=new Set();c.lessons.forEach(l=>{if(!/^(la|[1-5])-\d{2,3}$/.test(l.id)||ids.has(l.id)||!['la','1','2','3','4','5'].includes(l.grade)||!Number.isInteger(l.order)||l.order<1||!Array.isArray(l.words)||l.words.length<3||l.words.length>12||new Set(l.words).size!==l.words.length||l.words.some(w=>!c.vocabulary[w]?.vi||!c.vocabulary[w]?.icon))throw Error('Buổi học không hợp lệ: '+l.id);ids.add(l.id);});
 for(const grade of new Set(c.lessons.map(l=>l.grade))){const ls=c.lessons.filter(l=>l.grade===grade).sort((a,b)=>a.order-b.order);if(ls.some((l,i)=>l.order!==i+1))throw Error('Thứ tự buổi không liên tục.');}
}
function writeCurriculum_(c){validateCurriculum_(c);const json=JSON.stringify(c); // Sheets limits cell size: store one lesson per row? Use numbered JSON chunks instead.
 const s=sheet_('Curriculum');s.clearContents();s.appendRow(HEADERS.Curriculum);for(let i=0;i<json.length;i+=20000)s.appendRow([c.version,JSON.stringify(json.slice(i,i+20000)),now_()]);}
function curriculum_(){const rs=rows_('Curriculum');const c=JSON.parse(rs.map(r=>JSON.parse(r.json)).join(''));validateCurriculum_(c);return c;}
function publishCurriculum(){
 // Update Seed.gs from reviewed data/curriculum.json first. This runs only in the owner's editor.
 locked_(()=>{const old=curriculum_();if(SEED.version<=old.version)throw Error('Tăng version trước khi xuất bản.');validateCurriculum_(SEED);if(!SEED.lessons.every(l=>!old.lessons.some(o=>o.id===l.id&&(o.order!==l.order||o.grade!==l.grade)))||!old.lessons.every(l=>SEED.lessons.some(n=>n.id===l.id)))throw Error('Không xóa hoặc đổi thứ tự ID đã có tiến độ.');writeCurriculum_(SEED);audit_('operator','curriculum_publish',String(SEED.version));});
}
function requireParent_(a){if(!['parent','admin'].includes(a.role))throw Error('Không có quyền thao tác.');}
function owns_(a,id){const c=rows_('Children').find(c=>c.id===id&&c.parentUid===a.uid);if(!c||a.role==='child'&&a.child.id!==id)throw Error('Không có quyền với hồ sơ này.');return c;}
function attempts_(ids){return rows_('Attempts').filter(a=>ids.includes(a.childId)).map(a=>({...a,score:Number(a.score)}));}
function state_(a){if(a.role==='child')return {role:'child',child:{id:a.child.id,nickname:a.child.nickname,grade:a.child.grade},attempts:attempts_([a.child.id])};const cs=rows_('Children').filter(c=>c.parentUid===a.uid).map(c=>({id:c.id,nickname:c.nickname,grade:c.grade}));return {role:a.role,children:cs,attempts:attempts_(cs.map(c=>c.id))};}
function rate_(a){const c=CacheService.getScriptCache(),key='rate:'+digest_(a.uid),current=Number(c.get(key)||0);if(current>=90)throw Error('Có nhiều thao tác liên tiếp. Hãy nghỉ một phút.');c.put(key,String(current+1),60);}
function canOpen_(c,l,cur){if(l.grade!==c.grade)return false;if(l.order===1)return true;const prev=cur.lessons.find(x=>x.grade===l.grade&&x.order===l.order-1);return attempts_([c.id]).some(a=>a.lessonId===l.id&&a.score>=cur.passScore||prev&&a.lessonId===prev.id&&a.score>=cur.passScore);}
function questions_(l,cur){return Array.from({length:5},(_,i)=>{const w=l.words[i%l.words.length],v=cur.vocabulary[w];let opts=l.words.map(t=>({id:t,label:i%2?t:cur.vocabulary[t].vi,icon:cur.vocabulary[t].icon}));for(let j=opts.length-1;j>0;j--){const k=Math.floor(Math.random()*(j+1));[opts[j],opts[k]]=[opts[k],opts[j]];}return {id:String(i),prompt:i%2?'Từ nào có nghĩa là “'+v.vi+'”?':'Hãy chọn hình cho từ “'+w+'”.',audio:w,visual:i%2?'text':'image',options:opts,correct:w};});}
function removeWhere_(name,predicate){const s=sheet_(name),rs=rows_(name);for(let i=rs.length-1;i>=0;i--)if(predicate(rs[i]))s.deleteRow(i+2);}
function dispatch_(action,d,a){
 rate_(a);
 if(action==='state'){audit_(a.uid,a.role==='child'?'child_visit':'parent_visit','');return state_(a);}
 if(action==='createChild'){requireParent_(a);if(d.consent!==true)throw Error('Cần đồng ý của người giám hộ.');if(d.grade!=='la')throw Error('Lớp này chưa có giáo án.');const nickname=String(d.nickname||'').trim();if(nickname.length<1||nickname.length>30||/[\u0000-\u001f]/.test(nickname))throw Error('Biệt danh cần từ 1–30 ký tự.');if(rows_('Children').filter(c=>c.parentUid===a.uid).length>=5)throw Error('POC hỗ trợ tối đa 5 hồ sơ mỗi gia đình.');const id=Utilities.getUuid();add_('Children',{id,parentUid:a.uid,nickname,grade:'la',createdAt:now_()});audit_(a.uid,'consent_and_child_create',id);return {id};}
 if(action==='startChild'){requireParent_(a);const c=owns_(a,d.childId),u=rows_('Users').find(u=>u.uid===a.uid),s=issueSession_(u,'child',c.id);revoke_(a.sessionKey);audit_(a.uid,'child_session_start',c.id);return s;}
 if(action==='endChild'||action==='logout'){revoke_(a.sessionKey);audit_(a.uid,action==='endChild'?'child_session_end':'logout',a.child?.id||'');return {};}
 if(action==='begin'){if(a.role!=='child')throw Error('Chỉ phiên bé được làm bài.');const cur=curriculum_(),l=cur.lessons.find(x=>x.id===d.lessonId);if(!l||!canOpen_(a.child,l,cur))throw Error('Cần hoàn thành buổi trước.');const qs=questions_(l,cur),id=Utilities.getUuid();CacheService.getScriptCache().put('quiz:'+id,JSON.stringify({uid:a.uid,childId:a.child.id,sessionKey:a.sessionKey,lessonId:l.id,version:cur.version,qs}),1800);audit_(a.uid,'quiz_start',l.id);return {challenge:id,questions:qs.map(({correct,...q})=>q)};}
 if(action==='submit'){if(a.role!=='child'||typeof d.challenge!=='string')throw Error('Không có quyền nộp bài.');const cache=CacheService.getScriptCache(),raw=cache.get('quiz:'+d.challenge);if(!raw)throw Error('Bài tập đã hết hạn hoặc đã nộp. Vui lòng bắt đầu lại.');const q=JSON.parse(raw);if(q.uid!==a.uid||q.childId!==a.child.id||q.sessionKey!==a.sessionKey)throw Error('Sai hồ sơ nộp bài.');if(!Array.isArray(d.answers)||d.answers.length!==5||d.answers.some((v,i)=>typeof v!=='string'||!q.qs[i].options.some(o=>o.id===v)))throw Error('Đáp án không hợp lệ.');const cur=curriculum_(),l=cur.lessons.find(x=>x.id===q.lessonId);if(cur.version!==q.version)throw Error('Học liệu vừa cập nhật. Vui lòng bắt đầu lại bài tập.');if(!l||!canOpen_(a.child,l,cur))throw Error('Buổi học chưa mở.');const score=q.qs.filter((x,i)=>x.correct===d.answers[i]).length*20,result={id:d.challenge,childId:a.child.id,lessonId:l.id,score,at:now_(),curriculumVersion:cur.version};if(rows_('Attempts').some(x=>x.id===d.challenge))throw Error('Bài đã nộp.');add_('Attempts',result);cache.remove('quiz:'+d.challenge);audit_(a.uid,'quiz_submit',l.id);return {...result,passed:score>=cur.passScore};}
 if(action==='deleteChild'){requireParent_(a);const c=owns_(a,d.childId);removeWhere_('Attempts',x=>x.childId===c.id);removeWhere_('Children',x=>x.id===c.id);removeWhere_('Sessions',x=>x.childId===c.id);audit_(a.uid,'child_delete','redacted');return {};}
 if(action==='admin'){if(a.role!=='admin')throw Error('Không có quyền quản trị.');audit_(a.uid,'admin_access','');return {parents:rows_('Parents').length,children:rows_('Children').length,attempts:rows_('Attempts').length,audit:rows_('Audit').slice(-200).reverse()};}
 throw Error('Thao tác không được hỗ trợ.');
}
function doPost(e){let out;try{if(!e?.postData?.contents||e.postData.contents.length>15000)throw Error('Yêu cầu không hợp lệ.');const d=JSON.parse(e.postData.contents);if(typeof d.action!=='string')throw Error('Yêu cầu không hợp lệ.');const publicActions=['challenge','register','login','verifyEmail','resendVerification','requestReset','resetPassword'];out={ok:true,data:locked_(()=>publicActions.includes(d.action)?publicAuth_(d.action,d):dispatch_(d.action,d,auth_(d.token)))};}catch(err){out={ok:false,error:/^(Vui|Phiên|Chưa|Không|Cần|Lớp|Biệt|POC|Có|Hệ|Chỉ|Sai|Bài|Đáp|Học|Buổi|Yêu|Thao|Email|Thông|Tài|Mã)/.test(err.message)?err.message:'Hệ thống chưa xử lý được. Vui lòng thử lại.'};}return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);}
function doGet(){return ContentService.createTextOutput(JSON.stringify({ok:true,service:'VuonHocNho POC',version:2})).setMimeType(ContentService.MimeType.JSON);}
function purgeAudit(){locked_(()=>{removeWhere_('Audit',a=>new Date(a.at).getTime()<Date.now()-90*86400000);removeWhere_('Sessions',s=>Number(s.expires)<Date.now());});}
function installRetentionTrigger(){ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='purgeAudit').forEach(t=>ScriptApp.deleteTrigger(t));ScriptApp.newTrigger('purgeAudit').timeBased().everyDays(1).atHour(3).create();}
