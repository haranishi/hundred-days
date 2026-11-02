// OWNER: contract
// art の入口。世界（world 担当）とキャラクター（chars 担当）の部品を、契約 ArtApi の形にまとめるだけ。
import type { ArtApi } from '../contract/art';
import { createCharacter } from './characters';
import { buildWorld, createPost, createRenderer, createSeeThrough, warmUp } from './world';

export const art: ArtApi = { createRenderer, buildWorld, createCharacter, createPost, createSeeThrough, warmUp };
