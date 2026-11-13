// Whitelist projection: never carry private notes, transcripts or raw task data.
function visible(s,owner) { return !!s && s.student_id===owner && s.status==='completed' && (s.source_type!=='coach_post_session' || !!s.shared_at) }
const BODY_PART_NAMES = {
  chest: '胸部', back: '背部', shoulders: '肩部', 'upper arms': '手臂',
  'lower arms': '前臂', 'upper legs': '下肢', 'lower legs': '小腿', waist: '核心', neck: '颈部'
}
function trainingAreas(session) {
  const totals = new Map()
  for (const exercise of session.exercises || []) {
    const name = exercise.exerciseId && BODY_PART_NAMES[exercise.bodyPart]
    const completed = (exercise.sets || []).filter(set => set.state === 'done').length
    if (name && completed) totals.set(name, (totals.get(name) || 0) + completed)
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([name]) => name)
}
function displayTrainingTitle(session, areas = trainingAreas(session)) {
  if (session.title && (session.title !== '自主训练' || session.source_type === 'coach_post_session')) return session.title
  return areas.length ? areas.join(' · ') : '力量训练'
}
function report(s,owner) {
 if(!visible(s,owner)) throw new Error('记录不存在或尚未发布');
 const exercises = (s.exercises || []).map((exercise, index) => ({
   id: exercise.id, name: exercise.name || '未命名动作', number: index + 1,
   sets: (exercise.sets || []).map((set, setIndex) => ({
     id: set.id, number: set.setNo || setIndex + 1,
     weight: set.state !== 'done' || set.actualWeight == null ? '未记录' : set.actualWeight + ' kg',
     reps: set.state !== 'done' || set.actualReps == null ? '未记录' : set.actualReps + ' 次',
     state: set.state === 'done' ? '已完成' : set.state === 'skipped' ? '未做' : '待确认',
     kind: set.setType === 'warmup' ? '热身组' : set.setType === 'working' ? '正式组' : '',
     done: set.state === 'done'
   }))
 }))
 const areas = trainingAreas(s)
 return {id:s.session_id,title:displayTrainingTitle(s, areas),date:s.business_date||'日期未记录',source:s.source_type==='coach_post_session'?'教练指导':'自主训练',coachReport:s.source_type==='coach_post_session',exerciseCount:exercises.length,completedSets:exercises.reduce((n,e)=>n+e.sets.filter(v=>v.done).length,0),exercises,areas,publicNote:s.public_note||''};
}
function history(rows,owner) { const ids=new Set();return (rows||[]).filter(s=>visible(s,owner)&&s.session_id&&!ids.has(s.session_id)&&ids.add(s.session_id)).sort((a,b)=>String(b.business_date||'').localeCompare(String(a.business_date||'')) || (Number(b.ended_at)||0)-(Number(a.ended_at)||0) || String(a.session_id).localeCompare(String(b.session_id))).map(s=>report(s,owner)); }
module.exports={report,history,visible,trainingAreas,displayTrainingTitle};
