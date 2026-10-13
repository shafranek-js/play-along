const DEFAULT_MAX_CAPTURE_FRAMES = 192000 * 10;

class SF01PcmTapProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.maxCaptureFrames = Math.min(DEFAULT_MAX_CAPTURE_FRAMES, Math.max(1, options.processorOptions?.maxCaptureFrames ?? DEFAULT_MAX_CAPTURE_FRAMES));
    this.capture = null;
    this.port.onmessage = (event) => {
      const message = event.data;
      if (message?.type !== "capture") return;
      if (this.capture) {
        this.port.postMessage({ type: "capture-error", requestId: message.requestId, error: "A PCM capture is already active" });
        return;
      }
      if (!Number.isInteger(message.frames) || message.frames < 1 || message.frames > this.maxCaptureFrames) {
        this.port.postMessage({ type: "capture-error", requestId: message.requestId, error: "PCM capture frame limit exceeded" });
        return;
      }
      this.capture = {
        requestId: message.requestId,
        frames: message.frames,
        copied: 0,
        startedAt: null,
        left: new Float32Array(message.frames),
        right: new Float32Array(message.frames),
      };
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const left = input[0];
    const right = input[1] || left;
    if (left && output[0]) output[0].set(left);
    else output[0]?.fill(0);
    if (right && output[1]) output[1].set(right);
    else output[1]?.fill(0);

    const capture = this.capture;
    if (!capture || !left || !right) return true;
    if (capture.startedAt === null) capture.startedAt = currentTime;
    const count = Math.min(left.length, capture.frames - capture.copied);
    capture.left.set(left.subarray(0, count), capture.copied);
    capture.right.set(right.subarray(0, count), capture.copied);
    capture.copied += count;
    if (capture.copied >= capture.frames) {
      this.capture = null;
      this.port.postMessage({
        type: "capture-result",
        requestId: capture.requestId,
        sampleRate,
        frames: capture.frames,
        startedAt: capture.startedAt,
        endedAt: capture.startedAt + capture.frames / sampleRate,
        left: capture.left.buffer,
        right: capture.right.buffer,
      }, [capture.left.buffer, capture.right.buffer]);
    }
    return true;
  }
}

registerProcessor("sf01-pcm-tap", SF01PcmTapProcessor);
