import type { JSX } from 'preact';
export function Button({ secondary, class: className = '', ...props }: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button type="button" class={`${secondary ? 'button button--secondary' : 'button'} ${className}`} {...props} />;
}
