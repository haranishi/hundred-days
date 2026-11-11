// Existing part IDs remain stable. Backpack hardware shares the bindings part.
export function equipmentGear(name,bone){
 if(name.startsWith('ski')||name.startsWith('pole'))return 'ski';
 if(['board','metalEdge','graphic','boardBase'].includes(name))return 'board';
 if(name==='bindings'&&(bone===13||bone===16))return 'board';
 return null;
}
export function upperEquipment(name){
 if(name==='poleGrip'||name==='poleStrap')return true;
 if(name==='poleShaft'||name==='poleBasket')return false;
 return null;
}
// Keep the original board skin bytes. Ski mittens follow the authored wrist frame.
export function skinBoneForGear(name,bone,gear){
 return gear==='ski'&&name==='mittens'?(bone===6?7:bone===9?10:bone):bone;
}
