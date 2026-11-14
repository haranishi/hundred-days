import type { SignSpec } from '../hand/types';

/** 手話の中身の1項目（sign-content が持ち主）。設計は .kiro/specs/sign-content/design.md */
export type ItemKind = 'kana' | 'modifier' | 'number' | 'word';
export type Confidence = 'high' | 'medium' | 'low';

export interface SignItem {
  /** kana-a / mod-dakuon / num-1 / word-arigatou のように 種類の接頭辞＋ローマ字 */
  id: string;
  kind: ItemKind;
  /** 表示名（あ・1・ありがとう） */
  label: string;
  /** 読み（ローマ字） */
  reading?: string;
  /** 単語の意味（単語のみ） */
  meaning?: string;
  sign: SignSpec;
  describe: {
    /** 相手から見た説明 */
    viewer: string;
    /** 自分で作るときのコツ（自分の目に見える形で書く） */
    self: string;
  };
  /** origin=資料で確かめた由来 / mnemonic=覚え方の例（由来ではない） */
  memory?: { kind: 'origin' | 'mnemonic'; text: string };
  confusables?: Array<{ id: string; tip: string }>;
  /** 地域差・別の表し方の注記 */
  variants?: string;
  /** 出典ID（src/content/sources.ts） */
  sources: string[];
  confidence: Confidence;
  /**
   * 基本の形は確かだが、細部（親指の収め方・指の開き幅・曲げの角度など）が資料で決まらないときの注記。
   * 表の図から推し量った細部は「推定」と書く。confidence が high でも細部の不確かさを残すために使う
   */
  detailNote?: string;
  /** 動きがあるか（あればカメラ判定の対象外） */
  dynamic: boolean;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  publisher?: string;
}

/** 指文字で読む練習の単語 */
export interface VocabWord {
  /** ひらがな（濁点・小さい字・長音を含んでよい） */
  kana: string;
  /** 短い意味（例: 動物の犬） */
  meaning: string;
}
