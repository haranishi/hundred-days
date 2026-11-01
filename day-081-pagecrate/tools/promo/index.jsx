import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Promo} from './promo.jsx';
import {FPS, HEIGHT, TOTAL_FRAMES, WIDTH} from './timeline.mjs';

const Root = () => <Composition id="Day81-Promo" component={Promo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{taps: []}}/>;
registerRoot(Root);
