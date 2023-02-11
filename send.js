// import Recorder from './recorder';
import {BinaryFileReader} from './binary-file-reader';
const Recorder = window.Recorder || null;

const $recordButton = document.querySelector('.record-button');
const $stopButton = document.querySelector('.stop-button');

const $form = document.querySelector('form');
const $fileInput = $form.querySelector('[type="file"]');
const $submitButton = $form.querySelector('[type="submit"]');

let audioStream = null;
let audioContext = null;
let recorder = null;

$recordButton.addEventListener('click', async (_e) => {
  audioStream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});
  audioContext = new AudioContext();
  recorder = new Recorder(
    audioContext.createMediaStreamSource(audioStream),
    {numChannels: 1}
  );
  recorder.record();

  /*
  mediaRecorder = new MediaRecorder(audioStream);
  audioBlobs = [];

  mediaRecorder.addEventListener('dataavailable', (event) => {
    audioBlobs.push(event.data);
  });

  mediaRecorder.addEventListener('stop', async () => {
    console.log('mimeType', mediaRecorder.mimeType);
    audioBlob = new Blob(audioBlobs, {mimeType: mediaRecorder.mimeType});
    audioBlobs = [];

    const context = new AudioContext();
    const source = context.createBufferSource();
    source.buffer = Buffer.from(await audioBlob.arrayBuffer());
    source.loop = true;
    source.connect(context.destination);
    source.start(0);

    // document.querySelector('audio').src = window.URL.createObjectURL(audioBlob);
    // const f = new File([audioBlob], "record.opus");
    console.log(audioBlob);
  });

  mediaRecorder.start();
  */
});

$stopButton.addEventListener('click', (_e) => {
  recorder.stop();
  recorder.exportWAV((blob) => {
    console.log('exportWAV...');
    document.querySelector('audio').src = window.URL.createObjectURL(blob);

    audioStream && audioStream.getTracks().forEach((track) => {
      track.stop();
    });

    recorder.clear();

    const file = new File([blob], 'audio.wav');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    $fileInput.files = dataTransfer.files;

    /*
    BinaryFileReader.read(blob, (_err, audioFile) => {
      audioContext.decodeAudioData(audioFile.file.buffer, (buffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(audioContext.destination);
        source.start(0);
      }, (err) => {
        console.log(err);
      });
      recorder.clear();
    });
    */

  });
});

$form.addEventListener('submit', (e) => {
  $submitButton.disabled = true;
  // e.preventDefault();

  // loading animation
  console.log('submitting...');
});
