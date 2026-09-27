import { captionAt, DURATION } from './timeline.mjs';
window.renderPromo = t => {
  document.getElementById('caption').textContent = captionAt(t);
  document.getElementById('progress').style.transform = `scaleX(${t / DURATION})`;
  document.getElementById('window').hidden = t >= 26;
  document.getElementById('end').hidden = t < 26;
  document.querySelector('.art-strip').style.transform = `translateY(${Math.sin(t * 1.3) * 4}px)`;
};
window.renderPromo(0);
