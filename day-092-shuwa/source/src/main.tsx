import { render } from 'preact';
import { App } from './app/App';
import './ui/tokens.css';
import './ui/fonts.css';
import './ui/layout.css';
import './ui/learning.css';

const root = document.getElementById('app');
if (root) {
  root.querySelector('[data-boot]')?.remove();
  render(<App />, root);
}
