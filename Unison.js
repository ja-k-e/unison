import * as waveTables from "./waveTables.js";

const ALL_FREQUENCIES = [
  16.352, 17.324, 18.354, 19.445, 20.602, 21.827, 23.125, 24.5, 25.957, 27.5,
  29.135, 30.868, 32.703, 34.648, 36.708, 38.891, 41.203, 43.654, 46.249,
  48.999, 51.913, 55, 58.27, 61.735, 65.406, 69.296, 73.416, 77.782, 82.407,
  87.307, 92.499, 97.999, 103.826, 110, 116.541, 123.471, 130.813, 138.591,
  146.832, 155.563, 164.814, 174.614, 184.997, 195.998, 207.652, 220, 233.082,
  246.942, 261.626, 277.183, 293.665, 311.127, 329.628, 349.228, 369.994,
  391.995, 415.305, 440, 466.164, 493.883, 523.251, 554.365, 587.33, 622.254,
  659.255, 698.456, 739.989, 783.991, 830.609, 880, 932.328, 987.767, 1046.502,
  1108.731, 1174.659, 1244.508, 1318.51, 1396.913, 1479.978, 1567.982, 1661.219,
  1760, 1864.655, 1975.533, 2093.005, 2217.461, 2349.318, 2489.016, 2637.02,
  2793.826, 2959.955, 3135.963, 3322.438, 3520, 3729.31, 3951.066, 4186.01,
  4434.92, 4698.63, 4978.03, 5274.04, 5587.65, 5919.91, 6271.93, 6644.88, 7040,
  7458.62, 7902.13,
];
const FREQUENCIES = ALL_FREQUENCIES.splice(24, 72);
const SIZE = 32768;

export class Unison {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d");
    document.body.appendChild(this.canvas);
  }

  async initialize() {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    const audio = document.querySelector("audio");
    audio.onplay = () => this.audioContext.resume();
    this.source = this.audioContext.createMediaElementSource(audio);

    this.analyser.fftSize = SIZE;
    this.analyser.smoothingTimeConstant = 0;
    this.binCount = this.analyser.frequencyBinCount;
    this.binSize = this.audioContext.sampleRate / this.binCount;
    this.dataArray = new Uint8Array(this.binCount);
    // this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);
    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    // delay node to sync audio with output of oscillators
    const delay = this.audioContext.createDelay();
    delay.delayTime.setValueAtTime(0.15, this.audioContext.currentTime);
    this.source.connect(gain);
    gain.connect(delay);
    delay.connect(this.audioContext.destination);
    this.initializeChromaticMaps();
    this.initializeOscillators();
    this.draw();
  }

  generateOscillator(waveSettings) {
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = "square";
    // oscillator.setPeriodicWave(
    //   this.audioContext.createPeriodicWave(
    //     Float32Array.from(waveSettings.real),
    //     Float32Array.from(waveSettings.imag)
    //   )
    // );

    return oscillator;
  }

  initializeOscillators() {
    this.oscillators = FREQUENCIES.map((f, i) => {
      const oscillator = this.generateOscillator(waveTables.celeste);
      oscillator.frequency.setValueAtTime(f, this.audioContext.currentTime);
      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0, this.audioContext.currentTime);
      oscillator.connect(gain);
      gain.connect(this.audioContext.destination);
      oscillator.start();
      return gain;
    });
  }

  initializeChromaticMaps() {
    this.frequencyToChromaticIndex = {};
    this.chromaticIndexToFrequencies = {};
    this.chromaticIndices = FREQUENCIES.map((f, i) => {
      const chromaticIndex = Math.floor(f / this.binSize);
      this.frequencyToChromaticIndex[f] = chromaticIndex;
      this.chromaticIndexToFrequencies[chromaticIndex] =
        this.chromaticIndexToFrequencies[chromaticIndex] || [];
      this.chromaticIndexToFrequencies[chromaticIndex].push(f);
      return chromaticIndex;
    });
  }

  draw() {
    requestAnimationFrame(this.draw.bind(this));
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    const { width, height } = this.canvas;
    this.analyser.getByteFrequencyData(this.dataArray);
    this.context.clearRect(0, 0, width, height);
    this.context.fillStyle = "rgb(0, 0, 0)";
    this.context.fillRect(0, 0, width, height);

    const count = FREQUENCIES.length;
    const barWidth = width / count;
    let barHeight;
    let x = 0;

    const max = Math.max(...this.dataArray, 100);

    for (let i = 0; i < count; i++) {
      const freq = FREQUENCIES[i];
      const gain = this.oscillators[i];
      const index = this.frequencyToChromaticIndex[freq];
      const val = this.dataArray[index];
      const indexA =
        i > 0 ? this.frequencyToChromaticIndex[FREQUENCIES[i - 1]] : 0;
      const indexZ =
        i < count - 1
          ? this.frequencyToChromaticIndex[FREQUENCIES[i + 1]]
          : count - 1;
      const valA = this.dataArray[indexA];
      const valZ = this.dataArray[indexZ];
      const rel = val >= valA && val >= valZ ? val : 0;
      // const rel = val;
      const ratio = Math.pow(rel / max, 12);
      gain.gain.setValueAtTime(ratio * 0.2, this.audioContext.currentTime);
      barHeight = ratio * height * 0.8;
      this.context.fillStyle = `rgba(0, 0, 0, ${ratio})`;
      this.context.fillStyle = `lch(96 123 60 / ${ratio})`;
      const y = height * 0.5 - barHeight * 0.5;
      this.context.fillRect(x, y, barWidth, barHeight);
      x += barWidth;
    }
  }
}
