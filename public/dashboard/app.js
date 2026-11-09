'use strict';
const $=id=>document.getElementById(id);
const labels={admin:'מנהל',operator:'מפעיל',reviewer:'בודק',draft:'טיוטה',rendering:'יצירת וידאו',ready_for_review:'מוכן לביקורת',approved:'אושר',pending:'ממתין',rejected:'נדחה',revision_requested:'נדרש תיקון',superseded:'גרסה קודמת',published:'פורסם',scheduled:'מתוזמן',submitted:'נשלח',submitting:'בשליחה',failed:'נדרש טיפול',needs_reconciliation:'נדרשת בדיקה',queued:'בתור',retry_wait:'ממתין לניסיון',running:'בעיבוד',succeeded:'הושלם',cancelled:'בוטל'};
const text=value=>labels[value]||value||'—';
const date=value=>value?new Intl.DateTimeFormat('he-IL',{timeZone:'Asia/Jerusalem',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
let user=null,data=null,selected=null,currentApproval=null,connections=null;
const memoryKeys=new Map();
function keyFor(action,body){const name='avatar-operation:'+action+':'+JSON.stringify(body);let key;
  try{key=sessionStorage.getItem(name);}catch{}key ||= memoryKeys.get(name)||crypto.randomUUID();memoryKeys.set(name,key);
  try{sessionStorage.setItem(name,key);}catch{}return key;
}
function element(tag,content,className){const node=document.createElement(tag);if(content!==undefined)node.textContent=content;if(className)node.className=className;return node;}
function csrf(){return document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-avatar_csrf=')||s.startsWith('avatar_csrf='))?.split('=')[1]||'';}
function loginView(){user=null;data=null;selected=null;currentApproval=null;$('workspace').hidden=true;$('login-view').hidden=false;$('job-rows').replaceChildren();$('detail-panel').hidden=true;}
function message(value){$('status-message').textContent=value;$('status-message').hidden=!value;}
async function api(path,{method='GET',body}={}){
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'x-csrf-token':csrf()}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});
  const result=response.status===204?null:await response.json().catch(()=>null);
  if(!response.ok){if(response.status===401)loginView();const e=new Error(response.status===401?'יש להיכנס מחדש.':response.status===403?'אין הרשאה לפעולה זו.':response.status===409?'הפריט השתנה או שהפעולה נעולה. יש לרענן ולבדוק שוב.':response.status===503?'הפעולה אינה זמינה כרגע. החיבור או הספק עדיין לא הופעלו.':'לא ניתן להשלים את הפעולה. יש לבדוק את הנתונים ולנסות שוב.');e.status=response.status;throw e;}
  return result;
}
const operator=()=>['admin','operator'].includes(user?.role);
const reviewer=()=>['admin','reviewer'].includes(user?.role);
function roles(){document.querySelectorAll('.operator').forEach(n=>n.hidden=!operator());$('schedule-fields').disabled=user?.role!=='admin';}
function actionStates(){if(!data)return;$('run-step').disabled=!data.generation.processing;const job=data.jobs.find(j=>j.id===selected);if(job){$('request-review').disabled=job.status!=='ready_for_review';$('retry-job').disabled=job.processing_state!=='failed';$('cancel-job').disabled=!['queued','retry_wait','failed'].includes(job.processing_state);}}
async function busy(button,work){const old=button?.disabled;if(button)button.disabled=true;try{await work();}catch(e){message(e.name==='TimeoutError'?'השרת מתעורר או שהבקשה ארכה זמן רב. אפשר לנסות שוב.':e.message);}finally{if(button)button.disabled=old||false;actionStates();}}
$('login-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;$('login-message').textContent='מתבצעת כניסה…';
  try{await api('/auth/login',{method:'POST',body:{email:form.email.value,password:form.password.value}});$('login-message').textContent='';await refresh();}
  catch(e){$('login-message').textContent=e.status===503?'הכניסה עדיין אינה פעילה. נדרש להשלים את הגדרת חיבור הצוות בשרת.':e.message;}
  finally{form.password.value='';button.disabled=false;}
});
async function refresh(){
  user=await api('/auth/me');const [overview,notifications,accounts]=await Promise.all([api('/team/dashboard'),api('/team/notifications'),api('/team/publishing/accounts')]);
  data=overview;connections=accounts;$('login-view').hidden=true;$('workspace').hidden=false;$('identity').textContent=text(user.role)+' · '+user.id.slice(0,8);roles();
  for(const name of ['total','review','failed','published'])$('metric-'+name).textContent=String(data.metrics[name]);
  $('generation-note').textContent=data.generation.processing?'עיבוד ידני זמין בהתאם להגדרות הספקים':'יצירת סרטונים אינה מופעלת';$('run-step').disabled=!data.generation.processing;
  renderJobs();renderNotifications(notifications);renderSchedule();if(selected&&data.jobs.some(j=>j.id===selected))await openJob(selected,false);
}
function renderJobs(){const search=$('search').value.toLowerCase(),filter=$('filter').value;
  const jobs=data.jobs.filter(j=>(j.topic+' '+j.id).toLowerCase().includes(search)&&(filter==='all'||filter==='review'&&j.status==='ready_for_review'||filter==='failed'&&(j.status==='failed'||j.processing_state==='failed')||filter===j.status));
  $('job-rows').replaceChildren();$('empty-jobs').hidden=jobs.length>0;
  for(const job of jobs){const row=element('tr'),topic=element('td'),button=element('button',job.topic,'job-link');button.type='button';button.addEventListener('click',()=>busy(button,()=>openJob(job.id)));topic.append(button,element('small',job.id.slice(0,8)+' · גרסה '+(job.content_revision||'—')));
    const status=element('td'),state=job.processing_state==='failed'?'failed':job.status;status.append(element('span',text(state),'pill '+(state==='ready_for_review'?'review':state==='failed'?'failed':'')));
    row.append(topic,status,element('td',text(job.review_state)),element('td',date(job.created_at)),element('td',job.mock_publication_state?'הדמיה: '+text(job.mock_publication_state):'לא נשלח'));$('job-rows').append(row);
  }
}
function renderNotifications(items){$('notification-count').textContent=String(items.filter(n=>!n.read_at).length);$('notifications').replaceChildren();
  if(!items.length)$('notifications').append(element('p','אין עדכונים חדשים.','muted'));
  for(const item of items){const node=element('div',undefined,'notification');node.append(element('strong',item.kind==='review_requested'?'בקשת ביקורת חדשה':'התקבלה החלטה'),element('p','גרסה '+item.revision+' · '+text(item.state)+' · '+date(item.created_at)));const button=element('button','פתיחת העבודה','quiet');button.type='button';button.addEventListener('click',()=>busy(button,async()=>{await openJob(item.job_id);await api(`/team/notifications/${item.request_id}/${item.kind}/read`,{method:'POST'});await refresh();}));node.append(button);$('notifications').append(node);}
}
function renderSchedule(){const s=data.schedule,form=$('schedule-form');if(!s){$('schedule-status').textContent='לא נמצאה הגדרת תזמון.';$('schedule-fields').disabled=true;return;}
  $('schedule-status').textContent=(s.enabled?'תזמון פעיל':'תזמון כבוי')+' · המועד הבא: '+date(s.next_run_at);
  form.frequency.value=s.frequency||'once';form.interval.value=s.interval_count;form.time.value=(s.local_run_time||'09:00').slice(0,5);form.next.value=s.next_run_at||'';form.topic.value=s.default_topic||'';form.enabled.checked=s.enabled;form.enabled.disabled=!data.schedule_activation_allowed&&!s.enabled;
  $('activation-note').textContent=data.schedule_activation_allowed?'הפעלה מחייבת בחירה ושמירה מפורשת.':'הפעלת תזמון נעולה עד לאישור נפרד. ניתן לשמור הגדרות כשהתזמון כבוי.';
}
$('schedule-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;busy(form.querySelector('button'),async()=>{const body={version:data.schedule.version,enabled:form.enabled.checked,frequency:form.frequency.value,interval_count:Number(form.interval.value),local_run_time:form.time.value,next_run_at:form.next.value||null,default_topic:form.topic.value,timezone:'Asia/Jerusalem'};await api('/team/schedule',{method:'PUT',body});await refresh();message('הגדרות התזמון נשמרו.');});});
$('new-job-toggle').addEventListener('click',()=>{$('new-job').hidden=!$('new-job').hidden;});
$('new-job').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;busy(form.querySelector('button'),async()=>{await api('/jobs',{method:'POST',body:{topic:form.topic.value}});form.reset();form.hidden=true;await refresh();message('הטיוטה נוצרה. לא הופעלו יצירת וידאו או פרסום.');});});
async function openJob(id,scroll=true){if(selected!==id)$('detail-panel').hidden=true;selected=id;currentApproval=null;const job=data.jobs.find(j=>j.id===id);if(!job){message('העבודה אינה בין 100 העבודות האחרונות.');return;}
  const [content,history,approvals,publications]=await Promise.all([api(`/jobs/${id}/content`),api(`/team/jobs/${id}/history`),api(`/jobs/${id}/approvals`),api(`/team/jobs/${id}/publishing`)]);
  if(selected!==id)return;const version=content.versions.find(v=>v.revision===job.content_revision);$('detail-panel').hidden=false;$('detail-title').textContent=job.topic;$('detail-status').textContent=text(job.status)+' · גרסה '+(job.content_revision||'—')+' · '+text(job.processing_state);
  $('script').textContent=version?.package?.script||'טרם נוצר תסריט.';$('caption').textContent=[version?.package?.caption,version?.package?.hashtags?.join(' ')].filter(Boolean).join('\n')||'טרם נוצר כיתוב.';
  $('history').textContent=JSON.stringify(history,null,2);$('video-preview').pause();$('video-preview').removeAttribute('src');$('video-preview').hidden=true;$('video-placeholder').hidden=false;$('video-note').textContent='הדגמות אינן סרטון שניתן לנגן.';
  $('approval-list').replaceChildren();$('decision-form').hidden=true;$('revision-form').hidden=true;$('publish-form').hidden=true;
  for(const approval of approvals){const node=element('div',undefined,'review-entry');node.append(element('strong','גרסה '+approval.revision+' · '+text(approval.state)),element('p',approval.comment||'ללא הערה'));if(approval.reviewed_at)node.append(element('small',date(approval.reviewed_at)));$('approval-list').append(node);}
  if(!approvals.length)$('approval-list').append(element('p','עדיין לא נפתחה בקשת ביקורת.','muted'));
  const active=approvals.find(a=>a.revision===job.content_revision&&a.state!=='superseded');
  if(active){const detail=await api(`/jobs/${id}/approvals/${active.id}`);if(selected!==id)return;currentApproval=detail;$('decision-form').hidden=!(reviewer()&&active.state==='pending'&&currentApproval.current);$('review-warning').textContent='נתוני הדגמה בלבד. אישור זה אינו מאפשר פרסום חי.';
    $('revision-form').hidden=!(operator()&&['rejected','revision_requested'].includes(active.state));$('revision-form').topic.value=job.topic;
    if(operator()&&active.state==='approved'&&currentApproval.current&&connections.available){$('publish-form').hidden=false;$('publish-account').replaceChildren(...connections.accounts.map(a=>{const option=element('option',a.label+' · הדגמה');option.value=a.id;return option;}));}
  }
  $('request-review').disabled=job.status!=='ready_for_review';$('retry-job').disabled=job.processing_state!=='failed';$('cancel-job').disabled=!['queued','retry_wait','failed'].includes(job.processing_state);
  renderPublications(publications);roles();if(scroll)$('detail-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderPublications(items){$('publication-history').replaceChildren();if(!items.length)$('publication-history').append(element('p',connections.available?'אין שליחות הדגמה.':'אין חיבור לפרסום חי. הדמיה אינה פעילה בשרת זה.','muted'));
  for(const item of items){const node=element('div',undefined,'publication-entry');node.append(element('strong','הדמיה בלבד: '+text(item.state)),element('p',date(item.created_at)));if(operator()&&item.external_post_id&&!['published','failed'].includes(item.state)){const button=element('button','בדיקת מצב ההדמיה','quiet');button.type='button';button.addEventListener('click',()=>busy(button,async()=>{await api(`/team/jobs/${selected}/publishing/${item.id}/reconcile`,{method:'POST'});await openJob(selected,false);}));node.append(button);}$('publication-history').append(node);}
}
$('decision-form').addEventListener('submit',event=>{event.preventDefault();const action=event.submitter.value,form=event.currentTarget;busy(event.submitter,async()=>{if(!currentApproval?.current||!form.reviewed.checked)return;const details={action,expected_hash:currentApproval.snapshot_hash,comment:form.comment.value};await api(`/jobs/${selected}/approvals/${currentApproval.id}/decisions`,{method:'POST',body:{...details,request_key:keyFor('decision:'+currentApproval.id,details)}});await refresh();message('החלטת הביקורת נשמרה. פרסום חי נותר כבוי.');});});
$('revision-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;busy(form.querySelector('button'),async()=>{const topic=form.topic.value;await api(`/jobs/${selected}/approvals/${currentApproval.id}/revise`,{method:'POST',body:{topic,request_key:keyFor('revise:'+currentApproval.id,{topic})}});await refresh();message('גרסה חדשה הוכנסה לתור. יצירה תתבצע רק כשהעיבוד והספקים מורשים.');});});
$('request-review').addEventListener('click',event=>busy(event.currentTarget,async()=>{await api(`/jobs/${selected}/approvals`,{method:'POST',body:{request_key:keyFor('review:'+selected,{revision:data.jobs.find(j=>j.id===selected)?.content_revision})}});await refresh();message('בקשת הביקורת נפתחה בתיבת הצוות.');}));
$('publish-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;busy(form.querySelector('button'),async()=>{const details={approval_id:currentApproval.id,account_id:form.account.value,schedule_date:form.schedule.value||null};await api(`/team/jobs/${selected}/publishing`,{method:'POST',body:{...details,request_key:keyFor('publish:'+selected,details)}});await openJob(selected,false);message('הדמיית השליחה נשמרה. לא נוצר פוסט אמיתי.');});});
for(const action of ['retry','cancel'])$(action+'-job').addEventListener('click',event=>busy(event.currentTarget,async()=>{await api(`/team/jobs/${selected}/${action}`,{method:'POST'});await refresh();message('מצב העיבוד עודכן.');}));
$('preview-video').addEventListener('click',event=>busy(event.currentTarget,async()=>{if(currentApproval?.snapshot?.media?.mode==='mock'){message('זו הדגמה ללא קובץ וידאו אמיתי. אין סרטון שניתן לנגן.');return;}const grant=await api(`/jobs/${selected}/video/review`,{method:'POST'});if(grant.mode==='mock'){message('התקבל קישור לנתוני הדגמה, לא לווידאו אמיתי.');return;}if(!/^\/review\/[A-Za-z0-9_-]{43}$/.test(grant.url))throw new Error('קישור התצוגה אינו תקין.');$('video-preview').src=grant.url;$('video-preview').hidden=false;$('video-placeholder').hidden=true;}));
$('run-step').addEventListener('click',event=>busy(event.currentTarget,async()=>{const result=await api('/team/processing/run',{method:'POST'});await refresh();message(result.status==='disabled'?'העיבוד כבוי. לא הופעל ספק.':result.status==='unconfigured'?'ספקי היצירה עדיין אינם מחוברים.':'שלב העיבוד הסתיים: '+text(result.status));}));
$('refresh').addEventListener('click',event=>busy(event.currentTarget,async()=>{message('');await refresh();}));
$('logout').addEventListener('click',event=>busy(event.currentTarget,async()=>{await api('/auth/logout',{method:'POST'});loginView();}));
$('search').addEventListener('input',()=>data&&renderJobs());$('filter').addEventListener('change',()=>data&&renderJobs());$('close-detail').addEventListener('click',()=>{selected=null;$('detail-panel').hidden=true;});
for(const name of ['jobs','review','schedule'])$('nav-'+name).addEventListener('click',()=>{document.querySelectorAll('.nav').forEach(n=>n.classList.remove('active'));$('nav-'+name).classList.add('active');if(name==='schedule')$('settings-panel').scrollIntoView({behavior:'smooth'});else{$('filter').value=name==='review'?'review':'all';if(data)renderJobs();$('jobs-panel').scrollIntoView({behavior:'smooth'});}});
refresh().catch(error=>{if(error.status!==401)$('login-message').textContent=error.message;});
