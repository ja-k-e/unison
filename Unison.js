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
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// const FREQUENCIES = ALL_FREQUENCIES.splice(24, 72);
const FREQUENCIES = [...ALL_FREQUENCIES];
const SIZE = 32768;
const SMOOTHING = 0;
const AUDIO_DELAY = 0.15;
const AUDIO_VOLUME = 0.0;
const POWER = 16;
const ATTACK = 0.8;
const FILTER_MIN = 0;
const FILTER_MAX = FREQUENCIES.length;
const CONFIDENCE_THRESHOLD = 5;

export class Unison {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d");
    document.body.appendChild(this.canvas);
    const $factorPower = document.getElementById("factor-power");
    const $factorAttack = document.getElementById("factor-attack");
    const $filterMin = document.getElementById("filter-min");
    const $filterMax = document.getElementById("filter-max");
    $filterMin.setAttribute("max", FILTER_MAX);
    $filterMax.setAttribute("max", FILTER_MAX);
    this.factorPower = $factorPower.value = POWER;
    this.factorAttack = $factorAttack.value = ATTACK;
    this.filterMin = $filterMin.value = FILTER_MIN;
    this.filterMax = $filterMax.value = FILTER_MAX;
    $factorPower.addEventListener("input", ({ target }) => {
      this.factorPower = parseFloat(target.value);
    });
    $factorAttack.addEventListener("input", ({ target }) => {
      this.factorAttack = parseFloat(target.value);
    });
    $filterMin.addEventListener("input", ({ target }) => {
      this.filterMin = parseFloat(target.value);
      this.onFilterChange();
    });
    $filterMax.addEventListener("input", ({ target }) => {
      this.filterMax = parseFloat(target.value);
      this.onFilterChange();
    });
  }

  async initialize() {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    const audio = document.querySelector("audio");
    audio.onplay = () => this.audioContext.resume();

    this.source = this.audioContext.createMediaElementSource(audio);
    // this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // this.source = this.audioContext.createMediaStreamSource(this.stream);

    this.analyser.fftSize = SIZE;
    this.analyser.smoothingTimeConstant = SMOOTHING;
    this.binCount = this.analyser.frequencyBinCount;
    this.binSize = this.audioContext.sampleRate / this.binCount;
    this.dataArray = new Uint8Array(this.binCount);
    this.source.connect(this.analyser);
    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(AUDIO_VOLUME, this.audioContext.currentTime);
    // delay node to sync audio with output of oscillators
    const delay = this.audioContext.createDelay();
    delay.delayTime.setValueAtTime(AUDIO_DELAY, this.audioContext.currentTime);
    this.source.connect(gain);
    gain.connect(delay);
    delay.connect(this.audioContext.destination);
    this.initializeChromaticMaps();
    this.initializeOscillators();
    this.draw();
  }

  attackFrequency(frequency) {
    if (this.history[frequency].attack) {
      return;
    }
    const oscillator = this.generateOscillator();
    oscillator.frequency.setValueAtTime(
      frequency,
      this.audioContext.currentTime
    );
    const gain = this.audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start();
    gain.gain.setValueAtTime(0, this.audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(
      0.05,
      this.audioContext.currentTime + 0.01
    );
    gain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.5);
    this.history[frequency].attack = { oscillator, gain };
  }

  releaseFrequency(frequency) {
    if (!this.history[frequency].attack) {
      return;
    }
    const stopTime = this.audioContext.currentTime + 0.5;
    this.history[frequency].attack.oscillator.stop(stopTime);
    this.history[frequency].attack.gain.gain.linearRampToValueAtTime(
      0,
      stopTime
    );
    delete this.history[frequency].attack;
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
    this.history = {};
    this.frequencyToChromaticIndex = {};
    this.chromaticIndexToFrequencies = {};
    this.chromaticIndices = FREQUENCIES.map((f, i) => {
      this.history[f] = {
        attackOscillator: 0,
        confidence: 0,
        previousValue: 0,
        maxValue: 0,
      };
      const chromaticIndex = Math.floor(f / this.binSize);
      this.frequencyToChromaticIndex[f] = chromaticIndex;
      this.chromaticIndexToFrequencies[chromaticIndex] =
        this.chromaticIndexToFrequencies[chromaticIndex] || [];
      this.chromaticIndexToFrequencies[chromaticIndex].push(f);
      return chromaticIndex;
    });
  }

  generateOscillator(waveSettings) {
    const oscillator = this.audioContext.createOscillator();
    if (waveSettings) {
      oscillator.setPeriodicWave(
        this.audioContext.createPeriodicWave(
          Float32Array.from(waveSettings.real),
          Float32Array.from(waveSettings.imag)
        )
      );
    } else {
      oscillator.type = "square";
    }
    return oscillator;
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

    const count = Math.abs(this.filterMax - this.filterMin);
    const barWidth = width / count;
    let barHeight;
    let x = 0;

    const maxValue = Math.max(...this.dataArray, 1);

    const starting = Math.min(this.filterMin, this.filterMax);
    const ending = Math.max(this.filterMin, this.filterMax);

    this.top = [];

    for (let i = starting; i < ending; i++) {
      const frequency = FREQUENCIES[i];
      const { previousValue } = this.history[frequency];
      const gain = this.oscillators[i];
      const index = this.frequencyToChromaticIndex[frequency];
      const value = this.dataArray[index];
      const indexA =
        i > 0 ? this.frequencyToChromaticIndex[FREQUENCIES[i - 1]] : 0;
      const indexZ =
        i < count - 1
          ? this.frequencyToChromaticIndex[FREQUENCIES[i + 1]]
          : count - 1;
      const valueA = this.dataArray[indexA];
      const valueZ = this.dataArray[indexZ];
      const areaVolume = value + valueA + valueZ;
      const areaProminence = areaVolume ? value / (areaVolume / 3) : 0;
      const relativeValue = Math.min(
        value,
        value * areaProminence * 0.25 + value * 0.75
      );
      const safeRatio = maxValue ? relativeValue / maxValue : 0;
      const adjustedRatio = Math.pow(safeRatio, this.factorPower);
      this.history[frequency].previousValue = value;
      if (value > previousValue) {
        this.history[frequency].confidence += adjustedRatio;
        this.history[frequency].maxValue = Math.max(
          this.history[frequency].maxValue,
          value
        );
      } else {
        this.history[frequency].confidence *= 0.99;
      }
      if (this.history[frequency].confidence > CONFIDENCE_THRESHOLD) {
        this.top.push(frequency);
      }
      // if ratio above attack threshold, attack, otherwise release
      if (adjustedRatio > this.factorAttack) {
        if (!this.history[frequency].attack) {
          this.attackFrequency(frequency);
        }
      } else if (this.history[frequency].attack) {
        this.releaseFrequency(frequency);
      }
      gain.gain.setValueAtTime(
        adjustedRatio * 0.1,
        this.audioContext.currentTime
      );
      barHeight = adjustedRatio * height * 0.8;
      const hue = Math.round(((i % 12) / 12) * 360);
      const floored = Math.floor(this.history[frequency].confidence);
      if (floored) {
        this.context.fillStyle = "white";
        this.context.font = "12px sans-serif";
        this.context.textAlign = "center";
        this.context.fillText(
          floored,
          x + barWidth * 0.5,
          height * 0.5 - 6,
          barWidth
        );
      }
      this.context.fillStyle = `lch(96 133 ${hue} / ${adjustedRatio})`;
      const y = height * 0.5 - barHeight * 0.5;
      this.context.fillRect(x, y, barWidth, barHeight);
      x += barWidth;
    }

    const topNotes = this.top.map((a) => {
      const index = FREQUENCIES.indexOf(a);
      return `${NOTES[index % 12]}${Math.floor(index / 12)}`;
    });
    this.context.fillStyle = "white";
    this.context.font = "24px sans-serif";
    this.context.textAlign = "center";
    this.context.fillText(topNotes.join(", "), width * 0.5, 30);
  }

  onFilterChange() {
    const min = Math.min(this.filterMin, this.filterMax);
    const max = Math.max(this.filterMin, this.filterMax);

    const muteFrequency = (index) => {
      const frequency = FREQUENCIES[index];
      if (this.history[frequency].attack) {
        this.releaseFrequency(frequency);
      }
      const gain = this.oscillators[index];
      gain.gain.setValueAtTime(0, this.audioContext.currentTime);
    };

    for (let i = 0; i < min; i++) {
      muteFrequency(i);
    }
    for (let i = max; i < FREQUENCIES.length; i++) {
      muteFrequency(i);
    }
  }
}
