# Demo poster

`demo-poster.html` is the source of `public/demo-poster.jpg`, the still shown before `public/demo.mp4` plays. It is the recorded transcript in the site's terminal colors, with the grep output trimmed and the trim counted. If the demo is recorded again, copy the new transcript in.

Render it at 2x with headless Chrome, then save a 1920px JPEG:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=1280,720 --virtual-time-budget=6000 --screenshot=poster.png "file://$PWD/design/poster/demo-poster.html"
sips -s format jpeg -s formatOptions 82 -Z 1920 poster.png --out public/demo-poster.jpg
```
