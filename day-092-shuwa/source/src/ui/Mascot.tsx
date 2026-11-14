export function Mascot({ expression = 'happy', size = 180 }: { expression?: 'happy' | 'cheer' | 'think'; size?: number }) {
  const cheer = expression === 'cheer';
  const think = expression === 'think';
  return <svg class={`mascot mascot--${expression}`} width={size} height={size} viewBox="0 0 200 190" role="img" aria-label={`案内役てまる${cheer ? 'が両手を上げて喜んでいます' : think ? 'が考えています' : 'が手を振っています'}`}>
    <ellipse cx="100" cy="177" rx="58" ry="7" fill="#EAE3DA" />
    <g fill="#FFF3E3" stroke="#1F2544" stroke-width="3" stroke-linejoin="round">
      <path d="M40 120C40 76 58 42 100 42s60 34 60 78c0 34-26 50-60 50s-60-16-60-50Z" />
    </g>
    <g fill="#1F2544"><circle cx="78" cy="105" r="4" /><circle cx="122" cy="105" r="4" /></g>
    <g fill="#FFB59A"><ellipse cx="66" cy="120" rx="10" ry="6" /><ellipse cx="134" cy="120" rx="10" ry="6" /></g>
    {cheer ? <ellipse cx="100" cy="126" rx="10" ry="13" fill="#1F2544" /> : <path d={think ? 'M94 128h12' : 'M88 123q12 16 24 0'} fill="none" stroke="#1F2544" stroke-width="3" stroke-linecap="round" />}
    <g class="mascot__hands" fill="#FFF3E3" stroke="#1F2544" stroke-width="3" stroke-linejoin="round">
      <ellipse cx={think ? 49 : 29} cy={cheer ? 60 : 120} rx="21" ry="28" transform={`rotate(${cheer ? -30 : 20} ${think ? 49 : 29} ${cheer ? 60 : 120})`} />
      <g class="mascot__wave"><ellipse cx={think ? 120 : 173} cy={think ? 135 : 65} rx="21" ry="28" transform={think ? 'rotate(-30 120 135)' : 'rotate(25 173 65)'} /><path d={think ? 'M113 120v9m7-11v10' : 'm166 45 1 13m8-14-1 13m8-9-3 12'} /></g>
    </g>
    {cheer && <g fill="#FF8A3D"><path d="m26 16 3 8 8 3-8 3-3 8-3-8-8-3 8-3ZM171 14l3 6 7 2-7 3-3 7-2-7-7-3 7-2Z" /></g>}
  </svg>;
}
