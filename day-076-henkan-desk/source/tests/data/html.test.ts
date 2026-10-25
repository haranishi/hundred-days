// @vitest-environment jsdom
import { describe,expect,it } from 'vitest';
import { transformData } from '../../src/features/data/convert';
describe('markup conversion remains inert',()=>{
  it('generates HTML from Markdown and removes active and external resources',()=>{
    const result=transformData('# 見出し\n\n**本文**\n\n<img src="https://example.com/exfil" onerror="alert(1)"><script>alert(2)</script>\n\n[危険](javascript:alert(3))','markdown-html');
    expect(result.text).toContain('<h1>見出し</h1>');expect(result.text).toContain('<strong>本文</strong>');
    expect(result.text).not.toMatch(/<script|<img|onerror|javascript:/i);expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('extracts headings, paragraphs and decoded entities without script/style content',()=>{
    const result=transformData('<h1>見出し</h1><p>本文 &amp; 文章<br>次の行</p><script>秘密</script><style>.secret{}</style><img src="https://example.com/exfil">','html-text');
    expect(result.text).toContain('見出し\n');expect(result.text).toContain('本文 & 文章\n次の行');expect(result.text).not.toMatch(/秘密|secret|<|https/);
  });
  it('preserves preformatted line breaks',()=>{expect(transformData('<pre>first\n  second</pre>','html-text').text).toBe('first\nsecond');});
  it('rejects markup above its specific resource limit',()=>{expect(()=>transformData('a'.repeat(256*1024+1),'markdown-html')).toThrow(/256KiB/);});
});
