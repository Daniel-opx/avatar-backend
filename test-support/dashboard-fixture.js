const {randomUUID}=require('node:crypto');const {readFileSync}=require('node:fs');const path=require('node:path');
const {createTeamService}=require('../services/team');const {createApprovalService}=require('../services/approvals');
const {createDashboardService}=require('../services/dashboard');const {createPublishingService}=require('../services/publishing');
const {createMockGhl}=require('../services/ghl-mock');const {createMockVideoStore}=require('./mock-video-store');
const migrations=['20261106073647_durable_processing.sql','20261108184837_versioned_content.sql','20261108191748_asset_preparation.sql','20261108193747_render_requests.sql','20261108200903_webhook_media.sql','20261109053326_team_access.sql','20261109053341_video_approvals.sql','20261109082635_mock_social_publishing.sql'];
async function createFixture(pool){
  const schema='step23_test_'+randomUUID().replaceAll('-','');const sql=(s,v)=>pool.query(s.replaceAll('public.',schema+'.'),v);
  await pool.query(`CREATE SCHEMA ${schema}`);
  const cleanup=()=>pool.query(`DROP SCHEMA ${schema} CASCADE`);
  try{
    await pool.query(`CREATE TABLE ${schema}.jobs (LIKE public.jobs INCLUDING ALL)`);
    await pool.query(`CREATE TABLE ${schema}.schedule_config (LIKE public.schedule_config INCLUDING ALL)`);
    await sql("INSERT INTO public.schedule_config(id,enabled,timezone,frequency,interval_count) VALUES(1,false,'Asia/Jerusalem','once',1)");
    await sql('CREATE TABLE public.users(id uuid PRIMARY KEY); CREATE TABLE public.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES public.users(id),not_after timestamptz)');
    for(const file of migrations)await sql(readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
    const users={};for(const role of ['admin','operator','reviewer']){
      users[role]=randomUUID();await sql('INSERT INTO public.users(id) VALUES($1)',[users[role]]);
      await sql('INSERT INTO public.team_members(id,role) VALUES($1,$2)',[users[role],role]);
    }
    const team=createTeamService(pool,{schema,identitySchema:schema,provider:{enabled:true,async login(email,password){
      const id=users[email.split('@')[0]];if(!id||password!=='demo-only')return null;const sessionId=randomUUID();
      await sql('INSERT INTO public.sessions(id,user_id) VALUES($1,$2)',[sessionId,id]);return {id,sessionId,expiresAt:new Date(Date.now()+3600000)};
    }}});
    const actors={},logins={};for(const role of Object.keys(users)){logins[role]=await team.login(role+'@mock.invalid','demo-only');actors[role]=await team.lookup(logins[role].token);}
    const job=(await sql("INSERT INTO public.jobs(topic) VALUES('שלושה טיפים לבעלי עסקים בתחילת הדרך') RETURNING id")).rows[0].id;
    const pack={language:'he',script:'עסק מצליח מתחיל בצעד קטן. הכירו את הלקוחות שלכם, בחרו מטרה ברורה, והקדישו זמן לבדוק מה עובד. מה יהיה הצעד הבא שלכם?',caption:'כל עסק מתחיל בצעד קטן. בחרו היום פעולה אחת שאפשר לקדם.',hashtags:['#עסקיםקטנים','#תוכןבעברית'],
      visual_plan:[{description:'דמות מדברת מול רקע נעים',on_screen_text:'מתחילים בצעד קטן',duration_seconds:15}],claims:[],metadata:{tone:'נעים',audience:'בעלי עסקים',review_notes:['הדגמה בלבד']}};
    const cr=randomUUID(),render=randomUUID();
    await sql(`INSERT INTO public.content_requests(id,job_id,revision,state,token,provider,model,prompt_version,input_snapshot) VALUES($1,$2,1,'succeeded',$3,'mock','mock',1,'{}')`,[cr,job,randomUUID()]);
    await sql('INSERT INTO public.content_versions(job_id,revision,request_id,package) VALUES($1,1,$2,$3)',[job,cr,pack]);
    await sql("INSERT INTO public.asset_manifests(job_id,revision,manifest) VALUES($1,1,'{}')",[job]);
    await sql(`INSERT INTO public.render_requests(id,job_id,revision,state,token,payload,external_video_id,max_polls,poll_after_seconds) VALUES($1,$2,1,'completed',$3,'{}','mock_dashboard',60,5)`,[render,job,randomUUID()]);
    const store=createMockVideoStore();const media=await store.copy({bucket:'mock-videos',object_key:'renders/'+render+'.mp4',operationKey:render,externalId:'mock_dashboard',maxBytes:52428800});
    await sql(`INSERT INTO public.video_media(render_request_id,state,bucket,object_key,mime_type,size_bytes,sha256) VALUES($1,'ready',$2,$3,$4,$5,$6)`,[render,media.bucket,media.object_key,media.mime_type,media.size_bytes,media.sha256]);
    await sql("UPDATE public.jobs SET script=$2,visual_plan=$3,status='ready_for_review' WHERE id=$1",[job,pack.script,JSON.stringify(pack.visual_plan)]);
    await sql("UPDATE public.job_processing SET stage='review',state='succeeded' WHERE job_id=$1",[job]);
    await sql("INSERT INTO public.jobs(topic) VALUES('סיפור קצר על הדרך שלנו'),('שאלות שהלקוחות תמיד שואלים')");
    await sql("UPDATE public.job_processing SET state='failed',last_error='MOCK_CONTENT_ERROR' WHERE job_id=(SELECT id FROM public.jobs WHERE topic='שאלות שהלקוחות תמיד שואלים')");
    await sql("UPDATE public.publishing_config SET enabled=true,max_submissions=5");
    await sql("INSERT INTO public.publishing_accounts(id,platform,label) VALUES('mock_facebook','facebook','עמוד Facebook לדוגמה')");
    const counters={submits:0,reads:0,failSubmit:false,failRead:false,initial:'published'},posts=new Map();
    const provider=createMockGhl({transport:{mode:'mock',async request(url,options){
      const location='mock_location';let post;
      if(options.method==='POST'){
        counters.submits++;if(counters.failSubmit)throw new Error('Mock uncertain outcome');
        const body=JSON.parse(options.body),id='mock_post_'+counters.submits;post={_id:id,locationId:location,status:body.scheduleDate?'scheduled':counters.initial,publishedAt:new Date().toISOString()};posts.set(id,post);
      }else{counters.reads++;if(counters.failRead)throw new Error('Mock unavailable');post=posts.get(url.split('/').at(-1));}
      return new Response(JSON.stringify({success:true,results:{post}}));
    }}});
    const approvals=createApprovalService(pool,team,{schema}),dashboard=createDashboardService(pool,team,{schema}),publishing=createPublishingService(pool,team,{schema,allowMock:true,provider});
    const pipeline={content:require('../services/content').createContentService(pool,{schema}),assets:require('../services/assets').createAssetService(pool,{schema}),
      rendering:require('../services/rendering').createRenderService(pool,{schema}),completion:require('../services/completion').createCompletionService(pool,{schema,allowMock:true,provider:{mode:'mock'},store}),processing:require('../services/processing').createProcessing(pool,{},schema)};
    const app=require('../app').createApp({pool,team,approvals,dashboard,publishing,pipeline,jobs:require('../routes/jobs').createJobsRouter(pool,{schema}),render:false,logger:()=>{},rateLimitMax:1000});
    return {schema,sql,cleanup,team,actors,logins,job,approvals,dashboard,publishing,provider,counters,posts,app};
  }catch(e){await cleanup();throw e;}
}
module.exports={createFixture,migrations};
