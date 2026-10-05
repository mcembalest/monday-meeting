# Self-Play Pretraining with Zero Data: Dueling Banjos cut

Remotion project for `../self-play-pretraining-with-zero-data.mp4`.

Put the Deliverance "Dueling Banjos" mp3 in `../audio/` (not committed), then:

```sh
npm install
uv run analysis/make_cues.py "../audio/Deliverance • Dueling Banjos • Arthur Smith, Eric Weissberg & Steve Mandell.mp3" src/cues.json  # optional: src/cues.json is committed
npm run studio  # preview
npm run film    # render to out/film.mp4
```
