const $recordButton = document.querySelector('.record-button');
const $stopButton = document.querySelector('.stop-button');
const $playButton = document.querySelector('.play-button');

const $form = document.querySelector('form');
const $submitButton = $form.querySelector('[type="submit"]');

let audioBlob = null;
let audioStream = null;
let mediaRecorder = null;
let audioBlobs = [];

$recordButton.addEventListener('click', (_e) => {
  navigator.mediaDevices.getUserMedia({audio: true, video: false}).then((stream) => {
    audioStream = stream;
    mediaRecorder = new MediaRecorder(stream, {mimeType: 'audio/webm; codecs=opus'});
    audioBlobs = [];

    mediaRecorder.addEventListener('dataavailable', (event) => {
      audioBlobs.push(event.data);
    });

    mediaRecorder.addEventListener('stop', () => {
      audioBlob = new Blob(audioBlobs);
      audioBlobs = [];

      document.querySelector('audio').src = window.URL.createObjectURL(audioBlob);
      // const f = new File([audioBlob], "record.opus");
      console.log(audioBlob);
    });

    mediaRecorder.start();
  });
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
