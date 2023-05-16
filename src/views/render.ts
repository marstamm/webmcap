import m from "mithril";
import { Muxer, ArrayBufferTarget } from 'webm-muxer';

import { App, Recording, RenderOptions } from "../gifcap";
import Button from "../components/button";
import View from "../components/view";

interface RenderViewAttrs {
  readonly app: App;
  readonly recording: Recording;
  readonly renderOptions: RenderOptions;
}

export default class RenderView implements m.ClassComponent<RenderViewAttrs> {
  private readonly app: App;
  private readonly recording: Recording;
  private readonly renderOptions: RenderOptions;

  private progress = 0;

  constructor(vnode: m.CVnode<RenderViewAttrs>) {
    this.app = vnode.attrs.app;
    this.recording = vnode.attrs.recording;
    this.renderOptions = vnode.attrs.renderOptions;
  }

  async oncreate(vnode: m.VnodeDOM<RenderViewAttrs, this>) {

    const ctx = vnode.dom.getElementsByTagName("canvas")[0].getContext("2d")!;

    let muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'V_VP9',
        width: this.renderOptions.crop.width,
        height: this.renderOptions.crop.height
      }
    });

    let videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => console.error(e)
    });

    videoEncoder.configure({
      codec: 'vp09.00.10.08',
      width: this.renderOptions.crop.width,
      height: this.renderOptions.crop.height,
      bitrate: 1e6
    });


    const frameLengthInMicroSeconds = this.app.frameLength * 1000

    for (let index = this.renderOptions.trim.start; index <= this.renderOptions.trim.end; index++) {
      const frame = this.recording.frames[index];
      let imageData = frame.imageData;

      // we always copy the imagedata, because the user might want to
      // go back to edit, and we can't afford to lose frames which
      // were moved to web workers
      ctx.putImageData(imageData, 0, 0);
      imageData = ctx.getImageData(
        this.renderOptions.crop.left,
        this.renderOptions.crop.top,
        this.renderOptions.crop.width,
        this.renderOptions.crop.height
      );

      const bitmap = await createImageBitmap(imageData)
      const videoFrame = new VideoFrame(bitmap, {
        timestamp: frameLengthInMicroSeconds * (index - this.renderOptions.trim.start),
        duration: frameLengthInMicroSeconds
      });

      videoEncoder.encode(videoFrame);
    }

    await videoEncoder.flush();

    muxer.finalize();
    let buffer = muxer.target.buffer;

    const blob = new Blob([buffer]);

    const webmURL = window.URL.createObjectURL(blob);

    const duration =
      this.recording.frames[this.renderOptions.trim.end].timestamp -
      this.recording.frames[this.renderOptions.trim.start].timestamp +
      this.app.frameLength;

    this.app.finishRendering({ blob, url: webmURL, duration, size: blob.size });
  }

  view() {
    const actions = [
      m(Button, {
        label: "Cancel",
        icon: "square-fill",
        onclick: () => this.app.cancelRendering(),
      }),
    ];

    return [
      m(View, { actions }, [
        m(
          "progress",
          { max: "1", value: this.progress, title: "Rendering..." },
          `Rendering: ${Math.floor(this.progress * 100)}%`
        ),
        m("canvas.hidden", {
          width: this.recording.width,
          height: this.recording.height,
        }),
      ]),
    ];
  }

}
