/**
 * 手の形の仕様データの型（hand-model が持ち主。sign-content が書き、camera-check が読む）。
 * 座標の決まりは .kiro/specs/hand-model/design.md を正とする:
 *  - 手の座標（右手）: 原点=手首の中心, +Y=指先の方向, +Z=手のひらの面の外向き, +X=親指の側
 *  - 場の座標: 見る人（相手）は +Z 側。+X=見る人から見て右, +Y=上。表す人の右手は見る人から見て左（-X 側）
 *  - 長さの単位: 手のひらの長さ（手首から中指の付け根まで）= 1
 */

export type Vec3 = [number, number, number];

/** 向き（相手=見る人から見て）。斜めは数値の3要素で書く */
export type Dir = 'toViewer' | 'toSigner' | 'up' | 'down' | 'viewerLeft' | 'viewerRight' | Vec3;

export type FingerName = 'index' | 'middle' | 'ring' | 'pinky';

/**
 * 指の状態。
 * extended=伸ばす / bentMcp=付け根だけ直角に曲げる / hooked=付け根は伸ばし第2・第1関節を曲げる（かぎ形）
 * curled=握り込む / half=軽く曲げる
 */
export type FingerState = 'extended' | 'bentMcp' | 'hooked' | 'curled' | 'half';

/** 関節の点（接触の指定に使う） */
export type JointName = 'tip' | 'dip' | 'pip' | 'mcp';
export type ContactPoint = `${'thumb' | FingerName}.${JointName}`;

/**
 * 親指の置き方。
 * alongside=握った人差し指の横に添える / acrossFront=握った指の前を横切る / tuckedUnder=曲げた指先の下に入れる
 * extendedOut=横に開く / extendedUp=上（指先の方向）へ伸ばす / foldedPalm=手のひら側に折る
 * betweenIndexMiddle=人差し指と中指の間に挟む / { touch } = 指定の点に親指の先を触れる
 */
export type ThumbPlacement =
  | 'alongside'
  | 'acrossFront'
  | 'tuckedUnder'
  | 'extendedOut'
  | 'extendedUp'
  | 'foldedPalm'
  | 'betweenIndexMiddle'
  | { touch: ContactPoint };

/** 関節角度の個別上書き（度）。例外の形だけに使う */
export interface JointAdjust {
  mcp?: number;
  pip?: number;
  dip?: number;
  /** 開きの角度（向きは HandshapeSpec.spread の指ごとの角度と同じ） */
  spread?: number;
  /** 親指だけ: 付け根（手根中手関節）の曲げ・外への開き・ひねり、指節間関節 */
  cmcFlex?: number;
  cmcAbd?: number;
  cmcRot?: number;
  ip?: number;
}

export interface HandshapeSpec {
  fingers: Record<FingerName, FingerState>;
  thumb: ThumbPlacement;
  /**
   * together=指をそろえる / apart=開く / 指ごとの開きの角度（度）。
   * 角度の向き（hand-model の実装で明記）: 中指から離れる向きが＋（人差し指は親指の側、薬指・小指は小指の側）。中指だけは親指の側が＋
   */
  spread?: 'together' | 'apart' | Partial<Record<FingerName, number>>;
  /** 指の交差（front が back の前＝手のひら側から見て手前） */
  cross?: { front: FingerName; back: FingerName };
  /** 指先どうしの接触（隙間なく描く） */
  contacts?: Array<[ContactPoint, ContactPoint]>;
  adjust?: Partial<Record<FingerName | 'thumb', JointAdjust>>;
}

/** 手の向き: 手のひらの面の向きと、指先の向き（どちらも相手から見て） */
export interface Orientation {
  palm: Dir;
  fingers: Dir;
}

/** 体の位置の名前（上半身つきの単語と、指文字の基準位置に使う） */
export type BodyLocation =
  | 'neutral'
  | 'forehead'
  | 'temple'
  | 'eye'
  | 'nose'
  | 'mouth'
  | 'chin'
  | 'cheek'
  | 'chest'
  | 'belly'
  | 'shoulder';

/** 位置: 体の位置の名前＋ずらし（場の座標・手のひら単位）、または場の座標そのもの */
export type Position = { at: BodyLocation; offset?: Vec3 } | Vec3;

export type Ease = 'linear' | 'inOut' | 'out';

export interface Keyframe {
  /** 秒 */
  t: number;
  shape?: HandshapeSpec;
  orient?: Orientation;
  pos?: Position;
  ease?: Ease;
}

export interface HandTrack {
  keyframes: Keyframe[];
}

/**
 * 顔。neutral=ふつう / smile=笑顔 / nod=うなずき（一礼。頭を前へ1回傾ける。口と眉はふつう）/
 * frown=嫌な顔（眉を寄せ、口をへの字。hand-r2 で追加）
 */
export type FaceExpression = 'neutral' | 'smile' | 'nod' | 'frown';

export interface SignSpec {
  hands: { dominant: HandTrack; nonDominant?: HandTrack };
  /** 上半身（頭・胴・腕）を描くか。単語で使う */
  body?: boolean;
  /**
   * 顔。faceTimeline が無いときは再生の間ずっとこの顔（'nod' は再生の始めに1回うなずく）。
   * faceTimeline があるときは、その最初の項目より前の顔（'nod' ならふつうの顔）で、うなずく時刻は faceTimeline が決める。
   */
  face?: FaceExpression;
  /**
   * （hand-r2 で追加）顔を変える時刻。各項目の t（秒）から、その顔にする。'nod' はその時刻から1回うなずき（一礼）、口と眉は前のまま。
   * 例: よろしくお願いします の一礼を、後半の「お願い」の動きに合わせる。
   */
  faceTimeline?: Array<{ t: number; face: FaceExpression }>;
  /**
   * 空中に字を書く軌跡（の・り・ん など）。points は場の座標で、指先（既定は人差し指の先）が通る点の列。
   * 表す人から見て書く字なので、相手から見ると左右が反転して見える点に注意（データ側で反転済みの点を書く）。
   */
  trace?: {
    tip?: ContactPoint;
    points: Vec3[];
    tStart: number;
    tEnd: number;
    /**
     * （hand-model の実装で追加）points の基準。'field'＝場の座標そのもの（既定。上の説明どおり）/
     * 'tipStart'＝動き出す時点（tStart）の指先の位置からのずれ（向きは場の座標の軸）。
     * 追加の理由: 字の形だけを書けば済むように。場の座標で書くと、体の寸法や基準の位置（neutral）を変えるたびにデータを直す必要がある。
     */
    relativeTo?: 'field' | 'tipStart';
  };
  /** 全体の長さ（秒）。省略時は最後の Keyframe の t */
  duration?: number;
}

export type Perspective = 'viewer' | 'self';
export type Handedness = 'right' | 'left';

export interface ThumbnailOptions {
  perspective?: Perspective;
  dominant?: Handedness;
  /** 一辺のピクセル数（既定 256） */
  size?: number;
  /**
   * 動きのある形のどの時点を描くか。省いた時は、上半身つき（body: true）の単語は最初の止まる区間の真ん中、それ以外は 'end'
   * （hand-r2 で変更。単語は最後が同じ形になる語があるため。例: おはよう・こんにちは・こんばんは はどれも「あいさつ」で終わる）
   */
  at?: 'start' | 'end' | number;
}

export interface HandViewProps {
  spec: SignSpec;
  /** 形の説明文。3D が使えない時の代わりの表示と、読み上げの代替テキストに使う */
  label: string;
  perspective?: Perspective;
  onPerspectiveChange?: (p: Perspective) => void;
  dominant?: Handedness;
  autoplay?: boolean;
  loop?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** ドラッグで回す・視点切替などの操作を出すか */
  interactive?: boolean;
  /**
   * （hand-r2 で追加）interactive の時に出すボタン。'full'＝視点の切り替え・もう一度・ゆっくり・向きを戻す（既定。今までどおり）/
   * 'view'＝視点の切り替えと向きを戻すだけ（親の画面が自分で再生を操る時。指文字の再生・単語を読む問題）/
   * 'none'＝ボタンを出さない（ドラッグで回すのはそのまま。向きは perspective を変えると戻る）
   */
  controls?: 'full' | 'view' | 'none';
  /** 端末の「動きを減らす」設定。true なら自動再生しない */
  reducedMotion?: boolean;
  class?: string;
}

export interface HandViewHandle {
  replay(speed?: 1 | 0.5): void;
}
