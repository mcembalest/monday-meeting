import {Composition} from 'remotion';
import {FILM_DURATION, Film} from './film/Film';

export const Root = () => <Composition id="Film" component={Film} durationInFrames={FILM_DURATION} fps={30} width={1920} height={1080} />;
