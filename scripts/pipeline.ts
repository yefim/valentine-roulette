import 'dotenv/config';
import chalk from 'chalk';
import ffmpeg from 'fluent-ffmpeg';
import twilio from 'twilio';
import _ from 'lodash';
import fs from 'fs';
import { Readable } from 'stream';
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import Airtable from 'airtable';

// --- Config ---

const YEAR = '2026';
const ASSIGNMENTS_CSV = `./assignments-${YEAR}.csv`;
const SENT_TRACKING = `./sent-${YEAR}.txt`;

// --- Clients ---

const client = twilio(
  process.env.TWILIO_API_KEY,
  process.env.TWILIO_API_SECRET,
  { accountSid: process.env.TWILIO_ACCOUNT_SID },
);

const s3 = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.VDAY_AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.VDAY_AWS_SECRET_ACCESS_KEY ?? '',
  },
});

Airtable.configure({
  endpointUrl: 'https://api.airtable.com',
  apiKey: process.env.AIRTABLE_API_KEY,
});
const base = Airtable.base(process.env.AIRTABLE_VDAY_BASE ?? '');

// --- Types ---

interface VRecord {
  sender: string;
  url: string;
  approved: boolean;
}

interface Assignment {
  recipient: string;
  voiceNoteUrl: string;
  voiceNoteFilename: string;
}

// --- Constants ---

const copy =
  "Happy Valentine's Day! Here's a little something to make you smile, courtesy of a random stranger. Love, The Voice Note Valentine Team";

const copy2 =
  "Here's a day-late dose of love. Please accept Cupid's apology for running behind. But, hey, love doesn't end after Feb 14! <3 The Voice Note Valentine Team";

// --- Utilities ---

async function sleep(n: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), n);
  });
}

async function fetchAllRecords(
  tableName: string,
  filter?: string,
): Promise<VRecord[]> {
  const results: VRecord[] = [];

  return new Promise((resolve, reject) => {
    base(tableName)
      .select({
        view: 'Grid view',
        ...(filter && { filterByFormula: filter }),
      })
      .eachPage(
        function page(records, fetchNextPage) {
          for (const submission of records) {
            const url = submission.get('URL');
            const sender = submission.get('Sender');
            const approved = !!submission.get('Approved');

            if (typeof url === 'string' && typeof sender === 'string') {
              results.push({ url, sender, approved });
            }
          }
          fetchNextPage();
        },
        function done(err: any) {
          if (err) {
            console.error(err);
            reject(err);
          }
          resolve(results);
        },
      );
  });
}

// --- Step 1: Assign voice notes to recipients ---

async function assignValentines(year: string): Promise<Assignment[]> {
  const allRecords = await fetchAllRecords(year);

  const recipients = new Set<string>();
  const approvedUrls: string[] = [];
  const senderUrls: { [sender: string]: string[] } = {};

  for (const { sender, url, approved } of allRecords) {
    recipients.add(sender);
    senderUrls[sender] = senderUrls[sender] || [];
    senderUrls[sender].push(url);

    if (approved) {
      approvedUrls.push(url);
    }
  }

  console.log(`Total recipients: ${recipients.size}`);
  console.log(`Approved voice notes: ${approvedUrls.length}`);

  // Shuffle approved URLs and use each one only once.
  // When the pool runs out, reshuffle and start over so every note gets equal distribution.
  let pool = _.shuffle(approvedUrls);
  const assignments: Assignment[] = [];

  for (const recipient of recipients) {
    let assigned = false;

    // Find a voice note in the pool that isn't the recipient's own
    for (let i = 0; i < pool.length; i++) {
      if (senderUrls[recipient]?.includes(pool[i])) {
        continue;
      }

      const candidateUrl = pool[i];
      pool.splice(i, 1);

      const fullFilename = candidateUrl.split('/').at(-1)!;
      const voiceNoteFilename = fullFilename.split('---').at(-1)!;

      assignments.push({
        recipient,
        voiceNoteUrl: candidateUrl,
        voiceNoteFilename,
      });

      assigned = true;
      break;
    }

    // Pool exhausted — reshuffle all approved URLs and try again
    if (!assigned) {
      console.log(
        chalk.yellow(
          `Pool exhausted, reshuffling. ${recipient} will get a duplicate voice note.`,
        ),
      );
      pool = _.shuffle(approvedUrls);

      for (let i = 0; i < pool.length; i++) {
        if (senderUrls[recipient]?.includes(pool[i])) {
          continue;
        }

        const candidateUrl = pool[i];
        pool.splice(i, 1);

        const fullFilename = candidateUrl.split('/').at(-1)!;
        const voiceNoteFilename = fullFilename.split('---').at(-1)!;

        assignments.push({
          recipient,
          voiceNoteUrl: candidateUrl,
          voiceNoteFilename,
        });

        assigned = true;
        break;
      }
    }

    if (!assigned) {
      // All approved notes belong to this recipient, or none exist
      console.log(
        chalk.yellow(
          `No available voice note for ${recipient}, using placeholder`,
        ),
      );
      assignments.push({
        recipient,
        voiceNoteUrl: 'example.com',
        voiceNoteFilename: 'example.com',
      });
    }
  }

  return assignments;
}

function writeAssignmentsCsv(
  assignments: Assignment[],
  filePath: string,
): void {
  const header = 'recipient,voice_note_filename,voice_note_url';
  const rows = assignments.map(
    (a) => `${a.recipient},${a.voiceNoteFilename},${a.voiceNoteUrl}`,
  );
  fs.writeFileSync(filePath, [header, ...rows].join('\n') + '\n');
}

function readAssignmentsCsv(filePath: string): Assignment[] {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  // Skip header
  return lines.slice(1).map((line) => {
    const [recipient, voiceNoteFilename, ...urlParts] = line.split(',');
    return {
      recipient,
      voiceNoteFilename,
      voiceNoteUrl: urlParts.join(','),
    };
  });
}

// --- Step 2a: Download approved voice notes ---

async function downloadValentines(year: string): Promise<void> {
  const allSubmissions = await fetchAllRecords(year, '{Approved} = TRUE()');

  console.log(`Found ${allSubmissions.length} approved submissions...`);

  if (!fs.existsSync('./notes')) {
    fs.mkdirSync('./notes');
  }

  for (const { url } of allSubmissions) {
    const fullFilename = url.split('/').at(-1)!;
    const localFilename = fullFilename.split('---').at(-1)!;
    const destination = `./notes/${localFilename}`;

    if (fs.existsSync(destination)) {
      console.log(
        chalk.yellow(`Skipping ${localFilename} (already downloaded)`),
      );
      continue;
    }

    console.log(`Downloading ${fullFilename}...`);
    try {
      const params = {
        Bucket: 'valentine-roulette',
        Key: fullFilename,
      };

      const response = await s3.send(new GetObjectCommand(params));
      const readStream = response.Body as Readable;
      const writeStream = fs.createWriteStream(destination);

      await new Promise<void>((resolve, reject) => {
        readStream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        readStream.on('error', reject);
      });

      console.log(chalk.green(`Downloaded ${localFilename}`));
    } catch (_e) {
      console.log(chalk.red(`Could not download ${fullFilename}. Skipping...`));
    }
  }
}

// --- Step 2b: Transcode voice notes to MP4 ---

async function transcodeValentines(): Promise<void> {
  function getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration ?? 0);
      });
    });
  }

  function transcode(
    file: string,
    destination: string,
    audioBitrate: number,
    duration: number,
    retries = 0,
  ): Promise<void> {
    if (retries > 3) {
      console.log(chalk.red(`Giving up on ${file}`));
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input('./heart-small-ps.jpg')
        .loop()
        .addInputOption('-framerate 2')
        .input(`./notes/${file}`)
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate(`${audioBitrate}k`)
        .duration(duration)
        .outputOptions([
          '-max_interleave_delta 100M',
          '-tune stillimage',
          '-pix_fmt yuv420p',
        ])
        .on('start', () => {
          console.log(chalk.green(`Transcoding ${file} @ ${audioBitrate}k...`));
        })
        .on('end', async () => {
          const size = fs.statSync(destination).size;

          if (size > 590000) {
            console.log(
              chalk.red(
                `${file} too large (${size}B). Retrying at ${Math.floor(audioBitrate / 2)}k...`,
              ),
            );
            try {
              await transcode(
                file,
                destination,
                Math.floor(audioBitrate / 2),
                duration,
                retries + 1,
              );
              resolve();
            } catch (err) {
              reject(err);
            }
          } else {
            console.log(
              `Finished ${destination} - bitrate:${audioBitrate} size:${size}`,
            );
            resolve();
          }
        })
        .on('error', (err: Error) => {
          console.log(chalk.red(`Error transcoding ${file}: ${err.message}`));
          reject(err);
        })
        .output(destination)
        .run();
    });
  }

  const files = fs.readdirSync('./notes');
  files.sort(
    (a: string, b: string) =>
      fs.statSync(`./notes/${a}`).size - fs.statSync(`./notes/${b}`).size,
  );

  if (!fs.existsSync('./transcodes')) {
    fs.mkdirSync('./transcodes');
  }

  for (const file of files) {
    const name = file.split('.').at(0);
    const destination = `./transcodes/${name}.mp4`;

    if (fs.existsSync(destination)) {
      console.log(chalk.yellow(`Skipping ${file} (already transcoded)`));
      continue;
    }

    try {
      const duration = await getAudioDuration(`./notes/${file}`);
      await transcode(file, destination, 96, duration);
    } catch (_e) {
      console.log(chalk.red(`Failed to transcode ${file}, continuing...`));
    }
  }
}

// --- Step 2c: Upload transcoded videos to S3 ---

async function uploadValentines(): Promise<void> {
  const files = fs.readdirSync('./transcodes');
  files.sort(
    (a: string, b: string) =>
      fs.statSync(`./transcodes/${a}`).size -
      fs.statSync(`./transcodes/${b}`).size,
  );

  let uploaded = 0;
  for (const file of files) {
    if (file.split('.').at(-1) !== 'mp4') continue;

    let exists = false;
    try {
      await s3.send(
        new HeadObjectCommand({
          Bucket: 'valentine-roulette-converted',
          Key: file,
        }),
      );
      exists = true;
    } catch (_e) {
      // Not found — proceed to upload
    }

    if (exists) {
      console.log(chalk.yellow(`Skipping ${file} (already uploaded)`));
      continue;
    }

    console.log(chalk.green(`Uploading ${file}...`));
    const content = fs.readFileSync(`./transcodes/${file}`);
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: 'valentine-roulette-converted',
        Key: file,
        Body: content,
        ContentType: 'video/mp4',
      },
    });
    await upload.done();
    uploaded++;
  }

  console.log(chalk.green(`Uploaded ${uploaded} files`));
}

// --- Step 3: Send valentines ---

async function sendSingleValentine(to: string, url: string): Promise<unknown> {
  return client.messages.create({
    body: copy,
    from: process.env.TWILIO_FROM_NUMBER,
    mediaUrl: [url],
    to,
  });
}

async function sendValentinesFromCsv(
  assignmentsPath: string,
  sentTrackingPath: string,
): Promise<void> {
  const assignments = readAssignmentsCsv(assignmentsPath);

  // Read already-sent recipients
  const alreadySent = new Set<string>();
  if (fs.existsSync(sentTrackingPath)) {
    const lines = fs
      .readFileSync(sentTrackingPath, 'utf-8')
      .split('\n')
      .filter(Boolean);
    for (const line of lines) {
      alreadySent.add(line);
    }
  }

  const toSend = assignments.filter((a) => !alreadySent.has(a.recipient));
  console.log(
    `${toSend.length} to send (${alreadySent.size} already sent, ${assignments.length} total)`,
  );

  let count = 0;
  for (const assignment of toSend) {
    count++;

    if (assignment.voiceNoteFilename === 'example.com') {
      console.log(
        chalk.yellow(
          `[${count}/${toSend.length}] Skipping ${assignment.recipient} (placeholder)`,
        ),
      );
      continue;
    }

    const mp4Name = assignment.voiceNoteFilename.split('.').at(0) + '.mp4';
    const videoUrl = `https://valentine-roulette-converted.s3.amazonaws.com/${mp4Name}`;

    try {
      await sendSingleValentine(assignment.recipient, videoUrl);
      fs.appendFileSync(sentTrackingPath, assignment.recipient + '\n');
      console.log(
        chalk.green(
          `[${count}/${toSend.length}] Sent ${mp4Name} to ${assignment.recipient}`,
        ),
      );
    } catch (e) {
      console.log(
        chalk.red(
          `[${count}/${toSend.length}] Failed to send to ${assignment.recipient}`,
        ),
      );
    }

    await sleep(500);
  }
}

// --- Standalone utilities (not part of main pipeline) ---

async function remindOldUsers() {
  const reminderCopy =
    '💘 hey friends and lovers, last vday your voice made hearts flutter ! record a new voice note valentine at voice-note-valentine.com';
  const oldUsers = await fetchAllRecords('2023');
  const newUsers = await fetchAllRecords('2024');

  const oldDigits = oldUsers.map((u) => u.sender);
  const newDigits = newUsers.map((u) => u.sender);

  let diff = _.difference(oldDigits, newDigits);
  diff = _.uniq(diff);
  console.log(chalk.green(`Sending to ${diff.length} numbers...`));

  for (let i = 0; i < diff.length; i++) {
    const to = diff[i];
    try {
      await client.messages.create({
        body: reminderCopy,
        from: process.env.TWILIO_FROM_NUMBER,
        to: `+1${to}`,
      });

      console.log(chalk.green(`[${i + 1}/${diff.length}] Sent to ${to}`));
      await sleep(1000);
    } catch (_e) {
      console.log(chalk.red(`[error] Could not reach ${to}`));
    }
  }
}

// --- Main pipeline ---

async function main(): Promise<void> {
  console.log(chalk.green(`\n=== Valentine Pipeline for ${YEAR} ===\n`));

  // Step 1: Assign voice notes to recipients
  console.log(chalk.yellow('Step 1: Assigning voice notes to recipients...'));
  const assignments = await assignValentines(YEAR);
  writeAssignmentsCsv(assignments, ASSIGNMENTS_CSV);
  console.log(
    chalk.green(
      `Wrote ${assignments.length} assignments to ${ASSIGNMENTS_CSV}\n`,
    ),
  );

  // Step 2a: Download approved voice notes from S3
  console.log(chalk.yellow('Step 2a: Downloading approved voice notes...'));
  await downloadValentines(YEAR);
  console.log(chalk.green('Downloads complete.\n'));

  // Step 2b: Transcode to MP4
  console.log(chalk.yellow('Step 2b: Transcoding voice notes to MP4...'));
  await transcodeValentines();
  console.log(chalk.green('Transcoding complete.\n'));

  // Step 2c: Upload transcoded videos to S3
  console.log(chalk.yellow('Step 2c: Uploading transcoded videos to S3...'));
  await uploadValentines();
  console.log(chalk.green('Uploads complete.\n'));

  // Step 3: Send valentines via SMS
  console.log(chalk.yellow('Step 3: Sending valentines via SMS...'));
  await sendValentinesFromCsv(ASSIGNMENTS_CSV, SENT_TRACKING);
  console.log(chalk.green('\n=== Pipeline complete! ===\n'));
}

main();
