const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const start=source.indexOf('async function deriveProof('),end=source.indexOf('function showCodeDialog',start);
const salt='ab'.repeat(32),password='A long password 2026!';
const c=vm.createContext({window:{crypto:crypto.webcrypto},crypto:crypto.webcrypto,TextEncoder,Uint8Array,Array,Error,parseInt,api:async()=>({algorithm:'PBKDF2-SHA256',salt,iterations:600000})});
vm.runInContext(source.slice(start,end),c);
(async()=>{const result=await c.deriveProof('test@example.com',password);assert.equal(result,crypto.pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex'));console.log('PASS browser WebCrypto proof matches Node PBKDF2 reference');c.api=async()=>({algorithm:'PBKDF2-SHA256',salt,iterations:1});await assert.rejects(()=>c.deriveProof('test@example.com',password));console.log('PASS client rejects weaker server KDF configuration');c.window={};await assert.rejects(()=>c.deriveProof('test@example.com',password));console.log('PASS client fails closed without secure WebCrypto');})().catch(e=>{console.error(e);process.exit(1)});
