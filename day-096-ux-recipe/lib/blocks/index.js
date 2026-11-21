// 部品の描画の登録簿（親の担当）。部品を足すときは、ここと lib/contract.js の BLOCK_TYPES に足す。
import * as hero from './hero.js';
import * as pain from './pain.js';
import * as benefits from './benefits.js';
import * as steps from './steps.js';
import * as proof from './proof.js';
import * as voices from './voices.js';
import * as story from './story.js';
import * as team from './team.js';
import * as menu from './menu.js';
import * as plans from './plans.js';
import * as schedule from './schedule.js';
import * as faq from './faq.js';
import * as compare from './compare.js';
import * as guarantee from './guarantee.js';
import * as limited from './limited.js';
import * as form from './form.js';
import * as cta from './cta.js';
import * as access from './access.js';
import * as footer from './footer.js';

export const BLOCK_RENDERERS = { hero, pain, benefits, steps, proof, voices, story, team, menu, plans, schedule, faq, compare, guarantee, limited, form, cta, access, footer };
