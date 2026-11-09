// Local disposable preview only. No production account or provider is activated.
require('dotenv').config({quiet:true});const {randomUUID}=require('node:crypto');
process.env.API_KEY=randomUUID();process.env.SCHEDULER_API_KEY=randomUUID();
const pool=require('../db/pool');let fixture,server,closing=false;
async function close(){if(closing)return;closing=true;try{if(server)await new Promise(r=>server.close(r));if(fixture)await fixture.cleanup();}finally{await pool.end();}}
process.on('SIGINT',()=>close().then(()=>process.exit()));process.on('SIGTERM',()=>close().then(()=>process.exit()));
process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')close().then(()=>process.exit());});
setTimeout(()=>close().then(()=>process.exit()),30*60000).unref();
(async()=>{fixture=await require('../test-support/dashboard-fixture').createFixture(pool);server=fixture.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
console.log('MOCK-ONLY preview: http://127.0.0.1:'+server.address().port+'/dashboard');
console.log('Simulated login: admin@mock.invalid / demo-only. Type stop to remove the disposable schema and exit.');
})().catch(async e=>{console.error(e.code||'PREVIEW_FAILED');await close();process.exitCode=1;});
