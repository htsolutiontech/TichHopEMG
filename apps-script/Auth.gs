/* Sheet-only authentication. Client PBKDF2-SHA256 600,000 rounds; server HMAC pepper.
 * Derived proofs are password-equivalent credentials: HTTPS only, never logged/stored.
 * No Firebase, no third-party identity API. All durable account/session data is in Sheets.
 */
const KDF_ITERATIONS = 600000;
function secret_(){const p=props_(),s=p.getProperty('AUTH_SECRET');if(!s||s.length<64)throw Error('Chưa khởi tạo bí mật xác thực. Chạy setup().');return s;}
function hmac_(value){return Utilities.computeHmacSha256Signature(value,secret_()).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function equal_(a,b){if(typeof a!=='string'||typeof b!=='string')return false;let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function email_(value){const s=String(value||'').trim().toLowerCase();if(s.length>150||!/^[-a-z0-9.!#$%&'*+/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(s))throw Error('Email không hợp lệ.');return s;}
function salt_(email){return hmac_('salt:v2:'+email);}
function proof_(p){if(typeof p!=='string'||!/^[a-f0-9]{64}$/.test(p))throw Error('Thông tin xác thực không hợp lệ.');return p;}
function verifier_(email,proof){return hmac_('verifier:v2:'+email+':'+proof_(proof));}
function findUser_(email){return rows_('Users').find(u=>u.email===email);}
function updateUser_(uid,patch){const s=sheet_('Users'),rs=rows_('Users'),i=rs.findIndex(u=>u.uid===uid);if(i<0)throw Error('Không tìm thấy tài khoản.');const obj={...rs[i],...patch};s.getRange(i+2,1,1,HEADERS.Users.length).setValues([HEADERS.Users.map(k=>typeof obj[k]==='string'?safeCell_(obj[k]):obj[k]??'')]);return obj;}
function userStatus_(u){return !!u&&u.status==='active'&&u.emailVerified===true;}
function publicRate_(action,email){
 const c=CacheService.getScriptCache(),minute=Math.floor(Date.now()/60000),global='auth-global:'+minute,n=Number(c.get(global)||0);
 if(n>=40)throw Error('Có nhiều yêu cầu. Vui lòng thử lại sau một phút.');c.put(global,String(n+1),120);
 const window=Math.floor(Date.now()/900000),key='auth-rate:'+action+':'+hmac_(email)+':'+window,v=Number(c.get(key)||0),max=action==='challenge'?30:action==='login'?10:5;
 if(v>=max)throw Error('Có nhiều yêu cầu. Vui lòng thử lại sau 15 phút.');c.put(key,String(v+1),1000);
}
function mailCode_(user,purpose){
 const now=Date.now();if(Number(user.codeSentAt)>now-60000)throw Error('Vui lòng đợi một phút trước khi gửi lại mã.');
 // Persistent daily quota gate, separate from cache. Mail abuse remains a POC limitation.
 const p=props_(),day=Utilities.formatDate(new Date(),'Asia/Ho_Chi_Minh','yyyy-MM-dd'),key='MAIL_QUOTA_'+day,count=Number(p.getProperty(key)||0),limit=Number(p.getProperty('DAILY_MAIL_LIMIT')||50);
 if(count>=limit||MailApp.getRemainingDailyQuota()<1)throw Error('Hệ thống đã hết lượt gửi email trong ngày.');
 const code=String(parseInt(digest_(Utilities.getUuid()+Utilities.getUuid()).slice(0,8),16)%1000000).padStart(6,'0');
 const title=purpose==='verify'?'Mã xác minh tài khoản':'Mã đặt lại mật khẩu';
 MailApp.sendEmail({to:user.email,subject:title+' · Vườn học nhỏ',body:title+': '+code+'\nMã có hiệu lực 15 phút, tối đa 5 lần nhập. Không chia sẻ mã này. Nếu không yêu cầu, hãy bỏ qua email.\nVườn học nhỏ POC'});
 p.setProperty(key,String(count+1));
 updateUser_(user.uid,{codeHash:hmac_('otp:'+purpose+':'+user.uid+':'+code),codePurpose:purpose,codeExpires:now+900000,codeTries:0,codeSentAt:now});
}
function checkCode_(user,purpose,code){
 if(!user||user.codePurpose!==purpose||Number(user.codeExpires)<Date.now()||Number(user.codeTries)>=5||!/^\d{6}$/.test(String(code||'')))throw Error('Mã không hợp lệ hoặc đã hết hạn.');
 updateUser_(user.uid,{codeTries:Number(user.codeTries)+1});
 if(!equal_(user.codeHash,hmac_('otp:'+purpose+':'+user.uid+':'+code)))throw Error('Mã không hợp lệ hoặc đã hết hạn.');
}
function clearCode_(){return {codeHash:'',codePurpose:'',codeExpires:0,codeTries:0};}
function issueSession_(user,kind,childId){
 const token='vh.'+Utilities.getUuid()+Utilities.getUuid(),expires=Date.now()+3600000;
 add_('Sessions',{tokenHash:digest_(token),uid:user.uid,kind,childId:childId||'',expires,createdAt:now_()});return {token,expires};
}
function revoke_(hash){removeWhere_('Sessions',s=>s.tokenHash===hash);}
function revokeUser_(uid){removeWhere_('Sessions',s=>s.uid===uid);}
function auth_(token){
 if(typeof token!=='string'||!/^vh\.[0-9a-f-]{72}$/i.test(token))throw Error('Vui lòng đăng nhập.');
 const hash=digest_(token),s=rows_('Sessions').find(x=>x.tokenHash===hash);if(!s||Number(s.expires)<=Date.now())throw Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
 const u=rows_('Users').find(x=>x.uid===s.uid);if(!userStatus_(u))throw Error('Tài khoản chưa hoạt động hoặc đã bị khóa.');
 if(s.kind==='child'){const c=rows_('Children').find(c=>c.id===s.childId&&c.parentUid===u.uid);if(!c)throw Error('Hồ sơ không còn tồn tại.');return {uid:u.uid,role:'child',child:c,sessionKey:hash};}
 if(s.kind!=='parent')throw Error('Phiên đăng nhập không hợp lệ.');
 return {uid:u.uid,role:u.role==='admin'?'admin':'parent',sessionKey:hash};
}
function publicAuth_(action,d){
 const email=email_(d.email);publicRate_(action,email);
 if(action==='challenge')return {salt:salt_(email),iterations:KDF_ITERATIONS,algorithm:'PBKDF2-SHA256'};
 let u=findUser_(email);
 if(action==='register'){
  if(d.consent!==true)throw Error('Cần đồng ý của người giám hộ.');proof_(d.proof);
  if(!u){const p=props_(),day=Utilities.formatDate(new Date(),'Asia/Ho_Chi_Minh','yyyy-MM-dd'),k='REGISTER_QUOTA_'+day,n=Number(p.getProperty(k)||0);if(n>=Number(p.getProperty('DAILY_REGISTER_LIMIT')||50))throw Error('Hệ thống đã hết lượt đăng ký trong ngày.');p.setProperty(k,String(n+1));const uid=Utilities.getUuid();u={uid,email,verifier:verifier_(email,d.proof),role:'parent',status:'pending',emailVerified:false,createdAt:now_(),failed:0,lockedUntil:0,...clearCode_(),codeSentAt:0,consentVersion:'poc-v2'};add_('Users',u);add_('Parents',{uid,createdAt:now_(),consentVersion:'poc-v2'});mailCode_(u,'verify');audit_(uid,'register_pending','');}
  // Existing accounts are never overwritten by repeated registration.
  return {message:'Nếu địa chỉ có thể đăng ký, mã xác minh đã được gửi. Kiểm tra email hoặc dùng chức năng gửi lại mã.'};
 }
 if(action==='resendVerification'){
  if(u&&u.status==='pending'&&!u.emailVerified)mailCode_(u,'verify');
  return {message:'Nếu tài khoản đang chờ xác minh, mã đã được gửi.'};
 }
 if(action==='verifyEmail'){
  if(!u||u.status!=='pending')throw Error('Mã không hợp lệ hoặc tài khoản không chờ xác minh.');checkCode_(u,'verify',d.code);updateUser_(u.uid,{emailVerified:true,status:'active',...clearCode_()});audit_(u.uid,'email_verified','');return {message:'Xác minh thành công. Vui lòng đăng nhập.'};
 }
 if(action==='login'){
  const proof=proof_(d.proof),valid=equal_(u?.verifier||hmac_('dummy-verifier'),verifier_(email,proof));
  if(!u||Number(u.lockedUntil)>Date.now())throw Error('Email hoặc mật khẩu chưa đúng, hoặc tài khoản đang tạm khóa.');
  if(!valid){const failed=Number(u.failed)+1;updateUser_(u.uid,{failed,lockedUntil:failed>=5?Date.now()+900000:0});audit_(u.uid,'login_failed','');throw Error('Email hoặc mật khẩu chưa đúng, hoặc tài khoản đang tạm khóa.');}
  if(!userStatus_(u))throw Error('Tài khoản chưa xác minh email hoặc đã bị khóa.');
  updateUser_(u.uid,{failed:0,lockedUntil:0});const session=issueSession_(u,'parent');audit_(u.uid,'login_success','');return session;
 }
 if(action==='requestReset'){
  if(userStatus_(u))mailCode_(u,'reset');return {message:'Nếu tài khoản đủ điều kiện, mã đặt lại mật khẩu đã được gửi.'};
 }
 if(action==='resetPassword'){
  proof_(d.proof);if(!userStatus_(u))throw Error('Mã không hợp lệ hoặc tài khoản chưa hoạt động.');checkCode_(u,'reset',d.code);updateUser_(u.uid,{verifier:verifier_(email,d.proof),failed:0,lockedUntil:0,...clearCode_()});revokeUser_(u.uid);audit_(u.uid,'password_reset','');return {message:'Đã cập nhật mật khẩu và kết thúc mọi phiên cũ. Vui lòng đăng nhập lại.'};
 }
 throw Error('Thao tác xác thực không được hỗ trợ.');
}
// Operator-only functions: run from Apps Script editor. No API action can assign roles.
function syncAdmin(){locked_(()=>{const email=email_(props_().getProperty('ADMIN_EMAIL')),u=findUser_(email);if(!userStatus_(u))throw Error('Admin phải đăng ký và xác minh email trước.');updateUser_(u.uid,{role:'admin'});audit_('operator','admin_granted',u.uid);});}
function disableAccount(){locked_(()=>{const u=findUser_(email_(props_().getProperty('TARGET_EMAIL')));if(!u)throw Error('Không tìm thấy tài khoản.');updateUser_(u.uid,{status:'disabled'});revokeUser_(u.uid);audit_('operator','account_disabled',u.uid);});}
function removeAdmin(){locked_(()=>{const u=findUser_(email_(props_().getProperty('TARGET_EMAIL')));if(!u)throw Error('Không tìm thấy tài khoản.');updateUser_(u.uid,{role:'parent'});revokeUser_(u.uid);audit_('operator','admin_removed',u.uid);});}
