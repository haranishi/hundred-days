export const LIGHT_SPEED = 1079252849, SOUND_SPEED = 1225, ORBIT_SPEED = 27600;
export const MILESTONES = Object.freeze([
  [0.05,'カタツムリ'],[1.4,'ゾウガメ'],[4,'歩く人'],[20,'自転車'],[37,'ウサイン・ボルト（100mの平均）'],[60,'市街地の車'],[100,'高速道路の車'],[110,'チーター'],[320,'新幹線（営業最高）'],[390,'ハヤブサの急降下'],[603,'リニアの世界記録'],[900,'旅客機の巡航'],[1225,'音速（海面・15℃）'],[3530,'SR-71（有人機の記録）'],[11000,'X-43A（無人機・マッハ9.6）'],[27600,'ISS の軌道速度'],[40300,'地球の脱出速度'],[107200,'地球の公転'],[692000,'パーカー・ソーラー・プローブ'],[828000,'太陽系の銀河公転'],[LIGHT_SPEED,'光速']
].map(([speed,name],i)=>Object.freeze({speed,name,wall:i===20})));
export function lastPassed(speed) { return MILESTONES.filter(m=>!m.wall&&m.speed<=speed).at(-1)||null; }
export function passedCount(speed) { return MILESTONES.filter(m=>!m.wall&&m.speed<=speed).length; }
export function nextMilestone(speed) { return MILESTONES.find(m=>m.speed>speed)||MILESTONES.at(-1); }
