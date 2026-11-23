// The browser resamples the input to the capture context's 16 kHz rate.
class Microphone extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Int16Array(320);
    this.used = 0;
    this.active = true;
    this.port.onmessage = () => {
      this.active = false;
      if (this.used) this.port.postMessage(this.frame.slice(0, this.used).buffer);
      this.port.postMessage('flushed');
    };
  }
  process(inputs) {
    if (!this.active) return false;
    for (const sample of inputs[0][0] || []) {
      this.frame[this.used++] = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
      if (this.used === this.frame.length) {
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Int16Array(320);
        this.used = 0;
      }
    }
    return true;
  }
}
registerProcessor('microphone', Microphone);

