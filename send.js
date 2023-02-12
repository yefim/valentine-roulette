const Recorder = window.Recorder || null; // comes from external JS

const STATES = {
  initial: 0,
  recording: 1,
  finishedRecording: 2,
  playing: 2,
};

let currentState = STATES.initial;

const $recordButton = document.querySelector('.record-button');
const $recordImg = $recordButton.querySelector('img');
const $playbackAudio = document.querySelector('audio');

$playbackAudio.addEventListener('ended', (_e) => {
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

  currentState = STATES.playing;
  $recordImg.className = 'pause';
};

const stopPlayback = () => {
  console.log('stopPlayback()');
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

$form.addEventListener('submit', (e) => {
  $submitButton.disabled = true;
  // e.preventDefault();

  // loading animation
  console.log('submitting...');
});
