import {createHearts} from './hearts';

const Recorder = window.Recorder || null; // comes from external JS

const STATES = {
  initial: 0,
  recording: 1,
  finishedRecording: 2,
  playing: 3,
};

let currentState = STATES.initial;

const $recordButton = document.querySelector('.record-button');
const $recordImg = $recordButton.querySelector('img');
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

let audioStream = null;
let audioContext = null;
let recorder = null;

const startRecording = async () => {
  console.log('startRecording()');
  $pulse.style.display = 'block';

  audioStream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});

  currentState = STATES.recording;
  $recordImg.className = 'stop';

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
  $submitButton.disabled = true;

  // e.preventDefault();

  // loading animation
  console.log('submitting...');
});
