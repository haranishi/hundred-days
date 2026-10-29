import Brand from "./Brand";
import SurveyRequest from "./SurveyRequest";

export default function AboutView({ onBack }: { onBack: () => void }) {
  return (
    <div className="app-shell product-page">
      <header className="site-header product-header">
        <Brand onReset={onBack} />
        <button className="product-header-link" onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          ゲームに戻る ↗
        </button>
      </header>
      <main className="about-main" style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px', lineHeight: 1.8 }}>
        <span className="eyebrow">ABOUT YOUR DATA</span>
        <h1 style={{ fontSize: '32px', margin: '20px 0 30px' }}>
          その「普通」を、<br />おもしろがろう。
        </h1>
        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>お試しデータで遊べます</h2>
          <p>
            現在の割合は、ゲームの操作感を試すために用意した練習用の値です。実際の参加者や、ネット上のアンケートを集計したものではありません。プレイヤーの回答は収集せず、表示の割合にも加算しません。
          </p>
        </section>
        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>正解も、性格の優劣もありません</h2>
          <p>
            日常の二択に正解・不正解はありません。ゲームでは割合の大きい道を「多数派」として扱いますが、一般社会全体の傾向や科学的な性格診断を表すものではありません。恋愛・お金の問題も、助言や推奨を目的としていません。
          </p>
        </section>
        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>回答の言葉が、進む道です</h2>
          <p>
            肯否を尋ねる問題は「はい・いいえ」、好みを選ぶ問題は「A・B」を目印にし、それぞれの回答をゲートに表示します。色や記号で正解・不正解を示すものではありません。
          </p>
          <p>
            例えば旅行の予定なら「計画派・気分派」。短いゲート名と、下のボタンの詳しい回答は同じ選択を表します。
          </p>
        </section>
        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>普通度とゲームのルール</h2>
          <p>
            普通度は、選んだ側の練習用の割合を平均し、最後に四捨五入した値です。サバイバルは少数派で終了、7問完走モードでは最後まで遊べます。同数は続行します。途中終了の場合は、選んだ問題だけで計算します。
          </p>
          <p>
            再プレイでは毎回自由に選べます。前のプレイの選択に固定されません。
          </p>
        </section>
        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>この端末と、共有リンクに保存します</h2>
          <p>
            プレイ状態は端末内に保存します。ブラウザが保存を許可していなくても遊べますが、その場合はページを閉じるとプレイ状態が消えます。会員登録や匿名認証はなく、回答を保存する外部データベースも使いません。
          </p>
          <p>
            共有URLにはカテゴリー・選択した回答・練習用の割合・タイプ・作成日時が含まれます。URLを知る人にはその結果が見えます。氏名・メールアドレスなどの入力欄はありません。共有リンクの結果は、その後に遊び直しても変わりません。
          </p>
          <p>
            X・LINEなどへの共有は、ボタンを押したときに外部サービスを開きます。結果を自動で送信することはありません。
          </p>
        </section>
        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>調べてほしいテーマを教えてください</h2>
          <p>
            テーマの希望は、運営者が用意したDMやフォームで受け付けます。運営者がゲーム外でアンケートを実施し、対象者・実施日・出典を確認したうえで、問題と参考データを更新していく想定です。ゲームを遊んだ回答の自動集計は行いません。
          </p>
        </section>
        <SurveyRequest />
        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <button onClick={onBack} className="product-play-button" style={{ margin: 'auto' }}>
            ゲームに戻る ↗
          </button>
        </div>
      </main>
    </div>
  );
}
