// Whitelist projection: never carry private notes, transcripts or raw task data.
function visible(s,owner) { return !!s && s.student_id===owner && s.status==='completed' && (s.source_type!=='coach_post_session' || !!s.shared_at) }
function report(s,owner) {
 if(!visible(s,owner)) throw new Error('记录不存在或尚未发布');
 const exercises=(s.exercises||[]).map((ex,i)=>({id:ex.id,name:ex.name||'未命名动作',number:i+1,sets:(ex.sets||[]).map((v,j)=>({id:v.id,number:v.setNo||j+1,weight:v.actualWeight==null?'未记录':String(v.actualWeight)+' kg',reps:v.actualReps==null?'未记录':String(v.actualReps)+' 次',state:v.state==='done'?'已完成':v.state==='skipped'?'未做':'待确认',kind:v.setType==='warmup'?'热身组':v.setType==='working'?'正式组':'',done:v.state==='done'}))}));
 return {id:s.session_id,title:s.title||'本次训练',date:s.business_date||'日期未记录',source:s.source_type==='coach_post_session'?'教练指导':'自主训练',coachReport:s.source_type==='coach_post_session',exerciseCount:exercises.length,completedSets:exercises.reduce((n,e)=>n+e.sets.filter(v=>v.done).length,0),exercises,publicNote:s.public_note||''};
}
function history(rows,owner) { const ids=new Set();return (rows||[]).filter(s=>visible(s,owner)&&s.session_id&&!ids.has(s.session_id)&&ids.add(s.session_id)).sort((a,b)=>String(b.business_date||'').localeCompare(String(a.business_date||'')) || (Number(b.ended_at)||0)-(Number(a.ended_at)||0) || String(a.session_id).localeCompare(String(b.session_id))).map(s=>report(s,owner)); }
module.exports={report,history,visible};
