const $recordButton = document.querySelector('.record-button');
const $stopButton = document.querySelector('.stop-button');
const $playButton = document.querySelector('.play-button');

const $form = document.querySelector('form');
const $submitButton = $form.querySelector('[type="submit"]');

let audioBlob = null;
let audioStream = null;
let mediaRecorder = null;
let audioBlobs = [];

$recordButton.addEventListener('click', async (_e) => {
  audioStream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});
  mediaRecorder = new MediaRecorder(audioStream);
  audioBlobs = [];

  mediaRecorder.addEventListener('dataavailable', (event) => {
    audioBlobs.push(event.data);
  });

  mediaRecorder.addEventListener('stop', () => {
    console.log('mimeType', mediaRecorder.mimeType);
    audioBlob = new Blob(audioBlobs, {mimeType: mediaRecorder.mimeType});
    audioBlobs = [];

    document.querySelector('audio').src = window.URL.createObjectURL(audioBlob);
    // const f = new File([audioBlob], "record.opus");
    console.log(audioBlob);
  });

  mediaRecorder.start();
});

$stopButton.addEventListener('click', (_e) => {
  mediaRecorder && mediaRecorder.stop();

  audioStream && audioStream.getTracks().forEach((track) => {
    track.stop();
  });
});

$form.addEventListener('submit', (e) => {
  $submitButton.disabled = true;
  e.preventDefault();

  // loading animation
  console.log('submitting...');
});
