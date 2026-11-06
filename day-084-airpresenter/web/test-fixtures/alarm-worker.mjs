// Test-only runtime entrypoint. Never imported by production worker.mjs.
import worker, {PresentationRoom} from '../worker.mjs';
export class AlarmTestRoom extends PresentationRoom {
  getAlarmForTest() {return this.ctx.storage.getAlarm();}
  forceAlarmForTest() {return this.alarm();}
}
export default worker;
