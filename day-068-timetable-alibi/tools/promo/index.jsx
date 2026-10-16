import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {Promo} from './promo.jsx';
const Root=()=> <Composition id="Day68-Promo" component={Promo} durationInFrames={1080} fps={30} width={1080} height={1920} defaultProps={{}} />;
registerRoot(Root);
