import { IMAGE_RIGHTS_NOTICE, VOICE_RIGHTS_NOTICE } from '../../legal/notices'
import { Phrases } from '../ui/Phrases'
import './legal.css'

const TEXT = { image: IMAGE_RIGHTS_NOTICE, voice: VOICE_RIGHTS_NOTICE } as const

/** 選ぶ欄の近くに、いつも全文を出しておく権利の注意。色だけに頼らず「ご注意」の見出しを付ける。
    本文は補足文と同じ大きさ・色にして、操作より目立たせない（UI採点 M4） */
export function RightsNotice({ kind, testId }: { kind: keyof typeof TEXT; testId: string }) {
  return (
    <p className="rights-notice" data-testid={testId}>
      <strong className="rights-notice-label">ご注意</strong>
      <Phrases text={TEXT[kind]} />
    </p>
  )
}
