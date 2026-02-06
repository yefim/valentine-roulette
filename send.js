import { createHearts } from './hearts';
import RecordRTC, { StereoAudioRecorder } from 'recordrtc';
import lamejs from '@breezystack/lamejs';

import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: 'https://767e19a15cad4d6aabad365c250883a0@o4504666334298112.ingest.sentry.io/4504666336002048',
  integrations: [new Sentry.BrowserTracing()],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});

const STATES = {
  initial: 0,
  loading: 1,
  recording: 2,
  finishedRecording: 3,
  playing: 4,
  submitting: 5,
};

let currentState = STATES.initial;

const $recordButton = document.querySelector('.record-button');
const $recordImg = $recordButton.querySelector('img');
const $statusText = $recordButton.querySelector('span.status');
const $pulse = $recordButton.querySelector('.pulse');
const $playbackAudio = document.querySelector('audio');

$playbackAudio.addEventListener('ended', (_e) => {
  $pulse.style.display = 'none';
  $recordImg.className = 'play';
  currentState = STATES.finishedRecording;
});

const $form = document.querySelector('form');
const $fileInput = $form.querySelector('[type="file"]');
const $submitButton = $form.querySelector('button:not([type="button"])');
$submitButton.disabled = false; // reset the button to enabled
$submitButton.innerText = 'Send it'; // reset the button text

let audioStream = null;
let recorder = null;

function findDataChunk(buffer) {
  const view = new DataView(buffer);
  let offset = 12; // skip RIFF header (4) + size (4) + WAVE (4)
  while (offset < view.byteLength - 8) {
    const id = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
    const size = view.getUint32(offset + 4, true);
    if (id === 'data') {
      return offset + 8;
    }
    offset += 8 + size;
  }
  return 44; // fallback to standard offset
}

function convertWavBlobToMp3(wavBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function () {
      const dataOffset = findDataChunk(this.result);
      const wavBuffer = new Int16Array(this.result, dataOffset);
      const dataView = new DataView(this.result);
      const numChannels = dataView.getUint16(22, true);
      const sampleRate = dataView.getUint32(24, true);

      const mp3Encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 192);
      const mp3Data = [];

      const blockSize = 1152;

      if (numChannels === 2) {
        const left = new Int16Array(wavBuffer.length / 2);
        const right = new Int16Array(wavBuffer.length / 2);
        for (let i = 0; i < wavBuffer.length; i += 2) {
          left[i / 2] = wavBuffer[i];
          right[i / 2] = wavBuffer[i + 1];
        }

        for (let i = 0; i < left.length; i += blockSize) {
          const leftChunk = left.subarray(i, i + blockSize);
          const rightChunk = right.subarray(i, i + blockSize);
          const mp3buf = mp3Encoder.encodeBuffer(leftChunk, rightChunk);
          if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
          }
        }
      } else {
        for (let i = 0; i < wavBuffer.length; i += blockSize) {
          const chunk = wavBuffer.subarray(i, i + blockSize);
          const mp3buf = mp3Encoder.encodeBuffer(chunk);
          if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
          }
        }
      }

      const end = mp3Encoder.flush();
      if (end.length > 0) {
        mp3Data.push(end);
      }

      resolve(new Blob(mp3Data, { type: 'audio/mp3' }));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(wavBlob);
  });
}

async function startRecording() {
  console.log('startRecording()');

  $statusText.innerText = 'Loading mic...';
  currentState = STATES.loading;
  $recordImg.className = 'loading-mic';

  const startTime = Date.now();

  try {
    // This takes forever for some reason :(
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  } catch (_e) {
    $statusText.innerText = 'Reset permissions';
    currentState = STATES.initial;
    $recordImg.className = '';
    return;
  }

  if (Date.now() - startTime < 800) {
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 800);
    });
  }

  $statusText.innerText = 'Recording!!!';
  $recordImg.className = 'stop';
  currentState = STATES.recording;

  $pulse.style.display = 'block';

  recorder = new RecordRTC(audioStream, {
    type: 'audio',
    recorderType: StereoAudioRecorder,
    mimeType: 'audio/wav',
    numberOfAudioChannels: 2,
    desiredSampRate: 44100,
  });

  recorder.setRecordingDuration(5 * 60 * 1000).onRecordingStopped(function () {
    if (currentState === STATES.recording) {
      stopRecording({ alreadyStopped: true });
    }
  });
  recorder.startRecording();
}

function handleEncoding(blob) {
  audioStream &&
    audioStream.getTracks().forEach((track) => {
      track.stop();
    });

  const file = new File([blob], 'audio.mp3');
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  $fileInput.files = dataTransfer.files;

  $submitButton.disabled = false;
  createHearts($submitButton);
}

async function onRecorderStopped() {
  const wavBlob = recorder.getBlob();
  $playbackAudio.src = window.URL.createObjectURL(wavBlob);
  const mp3Blob = await convertWavBlobToMp3(wavBlob);
  handleEncoding(mp3Blob);
}

function stopRecording({ alreadyStopped = false } = {}) {
  console.log('stopRecording()');
  const phrases = ['You rock!', 'Awww so sweet!', 'That was cute!'];
  const $yay = document.querySelector('.yay');
  $yay.textContent = phrases[Math.floor(Math.random() * phrases.length)];
  $yay.style.visibility = 'visible';
  $pulse.style.display = 'none';
  $statusText.style.visibility = 'hidden';

  currentState = STATES.finishedRecording;
  $recordImg.className = 'play';

  if (alreadyStopped) {
    onRecorderStopped();
  } else {
    recorder.stopRecording(onRecorderStopped);
  }
}

function playbackRecording() {
  console.log('playbackRecording()');
  $playbackAudio.play();

  $pulse.style.display = 'block';
  currentState = STATES.playing;
  $recordImg.className = 'pause';
}

function stopPlayback() {
  console.log('stopPlayback()');
  $playbackAudio.pause();

  $pulse.style.display = 'none';
  currentState = STATES.finishedRecording;
  $recordImg.className = 'play';
}

$recordButton.addEventListener('click', async (_e) => {
  if (currentState === STATES.initial) {
    startRecording();
  } else if (currentState === STATES.recording) {
    stopRecording();
  } else if (currentState === STATES.finishedRecording) {
    playbackRecording();
  } else if (currentState === STATES.playing) {
    stopPlayback();
  }
});

$form.addEventListener('submit', (e) => {
  if (currentState === STATES.recording) {
    e.preventDefault();
    stopRecording();

    const pollInterval = setInterval(() => {
      if ($fileInput.files.length > 0) {
        clearInterval(pollInterval);
        $form.submit();
      }
    }, 100);

    return false;
  }

  // If no file, do not submit
  if (!e.target.elements.file.value) {
    e.preventDefault();
    return false;
  }

  currentState = STATES.submitting;
  $submitButton.disabled = true;
  $submitButton.innerText = 'Uploading...';
});
