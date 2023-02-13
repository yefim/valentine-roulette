import {createHearts} from './hearts';

import * as Sentry from "@sentry/browser";
import { BrowserTracing } from "@sentry/tracing";

Sentry.init({
  dsn: "https://767e19a15cad4d6aabad365c250883a0@o4504666334298112.ingest.sentry.io/4504666336002048",
  integrations: [new BrowserTracing()],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});


const Recorder = window.Recorder || null; // comes from external JS

const STATES = {
  initial: 0,
  loading: 1,
  recording: 2,
  finishedRecording: 3,
  playing: 4,
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

let audioStream = null;
let audioContext = null;
let recorder = null;

const startRecording = async () => {
  console.log('startRecording()');

  $statusText.innerText = 'Loading mic...';
  currentState = STATES.loading;
  $recordImg.className = 'loading-mic';

  const startTime = Date.now();

  // This takes forever for some reason :(
  audioStream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});

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
  recorder = new Recorder(
    audioContext.createMediaStreamSource(audioStream),
    {numChannels: 1}
  );
  recorder.record();
};

const stopRecording = () => {
  console.log('stopRecording()');
  document.querySelector('.yay').style.visibility = 'visible';
  $pulse.style.display = 'none';
  $statusText.style.visibility = 'hidden';

  recorder.stop();

  recorder.exportWAV((blob) => {
    console.log('exportWAV...');

    $playbackAudio.src = window.URL.createObjectURL(blob);
    // $playbackAudio.style.display = 'unset';
    // document.querySelector('audio')
    // document.querySelector('audio').src = window.URL.createObjectURL(blob);

    audioStream && audioStream.getTracks().forEach((track) => {
      track.stop();
    });

    recorder.clear();

    const file = new File([blob], 'audio.wav');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    $fileInput.files = dataTransfer.files;

    currentState = STATES.finishedRecording;
    $recordImg.className = 'play';
    $submitButton.disabled = false;
    createHearts($submitButton);
    // $submitButton.classList.add('shake');
  });
};

const playbackRecording = () => {
  console.log('playbackRecording()');
  $playbackAudio.play();

  $pulse.style.display = 'block';
  currentState = STATES.playing;
  $recordImg.className = 'pause';
};

const stopPlayback = () => {
  console.log('stopPlayback()');
  $playbackAudio.pause();

  $pulse.style.display = 'none';
  currentState = STATES.finishedRecording;
  $recordImg.className = 'play';
};

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

for (const $fun of document.querySelectorAll('.fun')) {
  $fun.addEventListener('click', (e) => {
    createHearts(e.target);
  });
}

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

  $submitButton.disabled = true;

  // e.preventDefault();

  // loading animation
  console.log('submitting...');
});
