import {
  ArrowUpRight,
  MessageCircle,
  ClipboardList,
  Sparkles,
} from "lucide-react";
import { publicSurveyUrl } from "@/lib/survey-request";
export default function SurveyRequest() {
  const form = publicSurveyUrl(process.env.NEXT_PUBLIC_SURVEY_FORM_URL);
  const dm = publicSurveyUrl(process.env.NEXT_PUBLIC_SURVEY_DM_URL);
  return (
    <section className="product-survey" aria-labelledby="survey-request-title">
      <div className="product-survey-art" aria-hidden="true">
        <MessageCircle size={38} strokeWidth={1.4} />
        <Sparkles size={19} />
      </div>
      <div className="product-survey-copy">
        <span className="product-survey-kicker">NEXT QUESTION, FROM YOU.</span>
        <h2 id="survey-request-title">
          その「みんなはどう？」を、お題にしよう。
        </h2>
        <p>
          やってほしいアンケートを、DMかGoogleフォームへ。
          <br />
          いただいたお題をもとに調査して、ゲームに追加していきます。
        </p>
        <div className="product-survey-links">
          {dm && (
            <a href={dm} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={16} />
              DMでお題を送る <ArrowUpRight size={15} />
            </a>
          )}
          {form && (
            <a href={form} target="_blank" rel="noopener noreferrer">
              <ClipboardList size={16} />
              Googleフォームで送る <ArrowUpRight size={15} />
            </a>
          )}
          {!dm && !form && <span>お題の募集先は、ただいま準備中です。</span>}
        </div>
        <small>
          お題の送信は外部サービスで行います。ゲームの回答は自動送信されません。
        </small>
      </div>
    </section>
  );
}
