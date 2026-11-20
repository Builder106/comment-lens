# Demo poster

`public/demo-poster.jpg` is the still shown before `public/demo.mp4` plays. It has two layers.

- `type-poster.py` builds the 3D scene in Blender: lines 87 to 94 of `pwndbg/color/syntax_highlight.py` at the head commit, set as type with each line's git blame date beside it. The 2018 comment and its date sit on an amber highlight and have slid out of line. `scene.jpg` is the last render.
- `demo-poster.html` puts the site's headline, subline and mark over `scene.jpg`.

Render the scene on the Mac (Metal GPU), with Geist Mono saved as a local TTF:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python design/poster/type-poster.py -- GeistMono.ttf scene.png 256 100
```

Convert `scene.png` to `design/poster/scene.jpg`, then composite at 1.5x with headless Chrome and save the result as a JPEG:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1.5 --window-size=1280,720 --virtual-time-budget=6000 --screenshot=poster.png "file://$PWD/design/poster/demo-poster.html"
sips -s format jpeg -s formatOptions 85 -Z 1920 poster.png --out public/demo-poster.jpg
```
