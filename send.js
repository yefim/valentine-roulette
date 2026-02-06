import { createHearts } from './hearts';

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
const $submitButton = $form.querySelector('[type="submit"]');
$submitButton.disabled = false; // reset the button to enabled
$submitButton.innerText = 'Send it'; // reset the button text

let audioStream = null;
let audioContext = null;
let recorder = null;

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
  // $statusText.style.visibility = 'hidden';
  $recordImg.className = 'stop';
  currentState = STATES.recording;

  $pulse.style.display = 'block';

  audioContext = new AudioContext();

  const input = audioContext.createMediaStreamSource(audioStream);

  recorder = new WebAudioRecorder(input, {
    workerDir: 'public/', // must end with slash
    encoding: 'mp3',
    numChannels: 2, //2 is the default, mp3 encoding supports only 2
    onEncoderLoading: function (_recorder, encoding) {
      console.log('Loading ' + encoding + ' encoder...');
    },
    onEncoderLoaded: function (_recorder, encoding) {
      console.log(encoding + ' encoder loaded');
    },
  });

  recorder.onComplete = function (_recorder, blob) {
    console.log('Encoding complete');

    handleEncoding(blob);
  };

  recorder.setOptions({
    timeLimit: 60 * 5, // 5 minutes
    encodeAfterRecord: true,
    mp3: { bitRate: 160 },
  });

  recorder.startRecording();
}

function handleEncoding(blob) {
  $playbackAudio.src = window.URL.createObjectURL(blob);

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

function stopRecording() {
  console.log('stopRecording()');
  const phrases = ['You rock!', 'Awww so sweet!', 'That was cute!'];
  const $yay = document.querySelector('.yay');
  $yay.textContent = phrases[Math.floor(Math.random() * phrases.length)];
  $yay.style.visibility = 'visible';
  $pulse.style.display = 'none';
  $statusText.style.visibility = 'hidden';

  currentState = STATES.finishedRecording;
  $recordImg.className = 'play';

  recorder.finishRecording();
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

    setTimeout(() => {
      $form.submit();
    }, 600);

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
