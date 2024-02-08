import chalk from 'chalk';
import ffmpeg from 'fluent-ffmpeg';
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);
import _ from 'lodash';
import fs from 'fs';

import AWS from 'aws-sdk';
AWS.config.update({
  accessKeyId: process.env.VDAY_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VDAY_AWS_SECRET_ACCESS_KEY,
  region: 'us-east-1',
});
const s3 = new AWS.S3();

interface VRecord {
  sender: string;
  url: string;
  approved: boolean;
}

import Airtable from 'airtable';
Airtable.configure({
  endpointUrl: 'https://api.airtable.com',
  apiKey: process.env.AIRTABLE_API_KEY,
});

const base = Airtable.base(process.env.AIRTABLE_VDAY_BASE ?? '');

const copy =
  "Happy Valentine's Day! Here's a little something to make you smile, courtesy of a random stranger. Love, The Valentine Roulette Team";

const copy2 =
  "Here's a day-late dose of love. Please accept Cupid's apology for running behind. But, hey, love doesn't end after Feb 14! <3 The Valentine Roulette Team";

/*

algorithm for assignments:

randomized, ordered map of sender -> their video-url 
everyone gets the next person's video (if the next person has no video, use rotating? defaults)
last person gets the first person's video


algorithm for generating videos 

we want to keep videos under 600KB

ffmpeg -loop 1 -i heart.jpg -i long.wav -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest out-2.mp4
ffmpeg -loop 1 -i heart.jpg -i long.wav -c:v libx264 -tune stillimage -c:a aac -b:a 96k -pix_fmt yuv420p -shortest out-2.mp4
ffmpeg -loop 1 -i heart.jpg -i long.wav -c:v libx264 -tune stillimage -c:a aac -b:a 48k -pix_fmt yuv420p -shortest out-2.mp4

// speed up video
ffmpeg -loop 1 -i hearts.jpg -i long.wav -c:v libx264 -tune stillimage -c:a aac -b:a 32k -filter:a "atempo=1.5" -pix_fmt yuv420p -shortest out-8.mp4

// could also try trimming / removing silence from start and end
// no idea how to do that

ffmpeg -loop 1 -i heart.jpg -i long.wav -c:v libx264 -tune stillimage -c:a libopus -b:a 48k -pix_fmt yuv420p -shortest out-2.mp4

-filter:a "atempo=2.0"


 */

const sendValentines = async () => {
  let length = 0;
  let numApproved = 0;
  const digits = new Set<string>();
  const digitsToNote = {};
  const extras: string[] = [];

  base('Table 1')
    .select({
      // filterByFormula: '{Approved} = TRUE()',
      view: 'Grid view',
    })
    .eachPage(
      function page(records, fetchNextPage) {
        length += records.length;
        for (const submission of records) {
          const sender = submission.get('Sender');
          const url = submission.get('URL') ?? '';

          if (typeof sender !== 'string' || typeof url !== 'string') {
            continue;
          }

          digits.add(sender);

          if (submission.get('Approved') === true) {
            numApproved++;
            const filename = url.split('/').at(-1);

            if (digitsToNote[sender]) {
              extras.push(filename);
            } else {
              digitsToNote[sender] = filename;
            }
          }
        }

        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        fetchNextPage();
      },
      function done(err: any) {
        if (err) {
          console.error(err);
          return;
        }

        const randomized = _.shuffle([...digits]);
        const assignments = {};

        for (let i = 0; i < randomized.length; i++) {
          const rando = randomized[i];
          const nextRando = randomized[(i + 1) % randomized.length];

          assignments[rando] = null;

          if (digitsToNote[nextRando]) {
            assignments[rando] = digitsToNote[nextRando];
          } else if (extras.length) {
            for (let i = 0; i < extras.length; i++) {
              // Check to make sure we're not sending someone their own note
              const index = extras[i].indexOf(rando);
              if (index === 0 || index === 1) {
                continue;
              }

              assignments[rando] = extras[i];
              extras.splice(i, 1);
              break;
            }
          } else {
            // Sorry dude, you're getting the best one.
            assignments[rando] = 'the-best.wav';
          }
        }

        console.log(`Total Submissions: ${length}`);
        console.log(`Number approved: ${numApproved}`);
        console.log(`Unique Phonenumbers: ${digits.size}`);
        console.log(Object.values(assignments).filter(Boolean).length);

        // let n = 0;

        // for (const to of Object.keys(assignments)) {
        // const wavFilename = assignments[to];
        // const filename = wavFilename.split('.').at(0).split('---').at(-1);
        // const url = `https://valentine-roulette-converted.s3.amazonaws.com/${filename}.mp4`;
        // if (ERRORS.indexOf(parseInt(to, 10)) !== -1) {
        //   client.messages
        //     .create({
        //       body: copy,
        //       from: '+13476577597',
        //       mediaUrl: [url],
        //       to: `+1${to}`,
        //     })
        //     .then(() => {
        //       n++;
        //       console.log(`${n}. Sent ${url} to ${to}`);
        //     })
        //     .catch((_e) => {
        //       console.log(chalk.red(`Could not reach ${to}`));
        //     });
        // }
        // }
      },
    );
};

async function downloadValentines() {
  const allSubmissions = await fetchAllRecords('2024', '{Approved} = TRUE()');

  console.log(`Found ${allSubmissions.length} approved submissions...`);

  for (const { url } of allSubmissions) {
    const filename = url.split('/').at(-1);
    const destination = `./notes/${filename.split('---').at(-1)}`;

    if (fs.existsSync(destination)) {
      continue;
    }

    console.log(`Downloading ${filename}...`);
    try {
      const params = {
        Bucket: 'valentine-roulette',
        Key: filename,
      };

      await s3.headObject(params).promise();
      const readStream = s3.getObject(params).createReadStream();

      const writeStream = fs.createWriteStream(destination);
      readStream.pipe(writeStream);
    } catch (_e) {
      console.log(`Could not find ${filename}. Skipping...`);
    }
  }
}

async function transcodeValentines() {
  function transcode(
    file: string,
    destination: string,
    audioBitrate: number,
    retries = 0,
  ): void {
    // Give up after 3 retries.
    if (retries > 3) {
      console.log(chalk.red(`Giving up on ${file}`));
      return;
    }

    ffmpeg()
      // .input('./hearts.jpg')
      .input('./heart-small-ps.jpg')
      .loop()
      .addInputOption('-framerate 2')
      .input(`./notes/${file}`)
      .videoCodec('libx264')
      .audioCodec('aac')
      // .audioFilters('silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB,areverse')
      // .audioQuality(9) // https://superuser.com/a/1515841
      .audioBitrate(`${audioBitrate}k`)
      // .audioBitrate('96k')
      // .audioBitrate('48k')
      .outputOptions([
        '-fflags shortest',
        '-max_interleave_delta 100M',
        '-tune stillimage',
        // '-crf 18',
        '-pix_fmt yuv420p',
        // '-t 00:00:10',
        '-shortest',
      ])
      .on('start', function () {
        console.log(
          chalk.green(
            `Transcoding ${file} with audio bitrate of ${audioBitrate}...`,
          ),
        );
      })
      .on('end', function () {
        const size = fs.statSync(destination).size;

        if (size > 590000) {
          console.log(
            chalk.red(`Big boy coming in at ${size}. Trying ${file} again.`),
          );
          transcode(
            file,
            destination,
            Math.floor(audioBitrate / 2),
            retries + 1,
          );
        } else {
          console.log(
            `Finished transcoding ${destination} - bitrate:${audioBitrate} size:${size}`,
          );
        }
      })
      .output(destination)
      .run();
  }

  const files = fs.readdirSync('./notes');

  // Sort files by size, smallest to largest
  files.sort(function (a: string, b: string) {
    return fs.statSync(`./notes/${a}`).size - fs.statSync(`./notes/${b}`).size;
  });

  // for (const file of files.slice(0, 2)) {
  for (const file of files) {
    const name = file.split('.').at(0);
    const destination = `./transcodes/${name}.mp4`;

    // Skip files we've already transcoded.
    if (fs.existsSync(destination)) {
      console.log(chalk.yellow(`Skipping ${file}...`));
      continue;
    }

    transcode(file, destination, 96);
  }
}

const uploadValentines = async () => {
  const files = fs.readdirSync('./transcodes');
  let uploaded = 0;

  // Sort files by size, smallest to largest
  files.sort(function (a: string, b: string) {
    return (
      fs.statSync(`./transcodes/${a}`).size -
      fs.statSync(`./transcodes/${b}`).size
    );
  });

  // for (const file of files.slice(0, 3)) {
  for (const file of files) {
    if (file.split('.').at(-1) !== 'mp4') continue;
    const content = fs.readFileSync(`./transcodes/${file}`);
    console.log(`Uploading ${file}...`);
    uploaded++;

    // Remove check if we're replacing files
    const exists = await s3
      .headObject({
        Bucket: 'valentine-roulette-converted',
        Key: file,
      })
      .promise()
      .then(
        () => true,
        (err: any) => {
          if (err.code === 'NotFound') {
            return false;
          }
          throw err;
        },
      );

    if (!exists) {
      s3.upload({
        Bucket: 'valentine-roulette-converted',
        Key: file,
        Body: content,
        ContentType: 'video/mp4',
      }).promise();
    }
  }

  console.log(`Uploaded: ${uploaded}`);
};

const markValentinesAsSent = async () => {
  let sent = 0;

  base('Table 1')
    .select({
      filterByFormula: '{Approved} = TRUE()',
      view: 'Grid view',
    })
    .eachPage(
      function page(records, fetchNextPage) {
        // This function (`page`) will get called for each page of records.

        for (const submission of records) {
          const url = submission.get('URL');
          if (typeof url !== 'string') {
            continue;
          }

          const id = url.split('---').at(-1).split('.').at(0);

          // todo: populate SENT array
          const SENT: string[] = [];
          if (SENT.indexOf(id) !== -1) {
            sent++;

            /*
        base('Table 1').update([
          {
            "id": submission.id,
            "fields": {
              "Sent Out": true,
            }
          }
        ], function(err, _records) {
          if (err) {
            console.log(err);
          }
        });
        */
          }
        }

        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        // If there are no more records, `done` will get called.
        fetchNextPage();
      },
      function done(err: any) {
        if (err) {
          console.error(err);
          return;
        }

        console.log(`Sent: ${sent}`);
      },
    );
};

const sendValentines2 = async () => {
  const wavFilenames: string[] = [];

  const lateComers = [];

  const getRandomUrl = (number: string) => {
    const r = _.sample(wavFilenames);

    // Check to make sure we're not sending someone their own note
    const index = r.indexOf(number);
    if (index === 0 || index === 1) {
      // try again.
      console.log(`${number} was about to get ${r}. Trying again...`);
      return getRandomUrl(number);
    } else {
      const i = wavFilenames.indexOf(r);
      wavFilenames.splice(i, 1);
      const name = r.split('---').at(-1).split('.').at(0);
      return `https://valentine-roulette-converted.s3.amazonaws.com/${name}.mp4`;
    }
  };

  base('Table 1')
    .select({
      filterByFormula: 'AND({Approved} = TRUE(), {Sent Out} = FALSE())',
      view: 'Grid view',
    })
    .eachPage(
      function page(records, fetchNextPage) {
        for (const submission of records) {
          const url = submission.get('URL');
          if (typeof url !== 'string') {
            continue;
          }
          const filename = url.split('/').at(-1);
          wavFilenames.push(filename);
        }

        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        fetchNextPage();
      },
      function done() {
        let n = 0;

        console.log(wavFilenames.length);

        for (const to of lateComers) {
          const url = getRandomUrl(to);

          client.messages
            .create({
              body: copy2,
              from: '+13476577597',
              mediaUrl: [url],
              to: `+1${to}`,
            })
            .then(() => {
              n++;
              console.log(`${n}. Sent ${url} to ${to}`);
            })
            .catch(() => {
              console.log(chalk.red(`Could not reach ${to}`));
            });
        }

        console.log(wavFilenames.length);
      },
    );
};

const sendSingleValentine = async () => {
  const to = '';
  const url = '';

  client.messages
    .create({
      body: copy2,
      from: '+13476577597',
      mediaUrl: [url],
      to: `+1${to}`,
    })
    .then(() => {
      console.log(`Sent ${url} to ${to}`);
    })
    .catch((e: any) => {
      console.log(e);
      console.log(chalk.red(`Could not reach ${to}`));
    });
};

async function remindOldUsers() {
  const copy =
    '💘 hey friends and lovers, last vday your voice made hearts flutter ! record a new voicenote valentine at valentineroulette.com';
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
        body: copy,
        from: '+12294083291',
        to: `+1${to}`,
      });

      console.log(chalk.green(`[${i + 1}/${diff.length}] Sent to ${to}`));

      await sleep(1000);
    } catch (_e) {
      console.log(chalk.red(`[error] Could not reach ${to}`));
    }
  }
}

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
        maxRecords: 250,
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
              results.push({
                url,
                sender,
                approved,
              });
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

async function main() {
  // await downloadValentines();
  // await transcodeValentines();
  // uploadValentines();
  // sendValentines();
  // sendValentines2();
  // markValentinesAsSent();
  // sendSingleValentine();
  // await remindOldUsers();
}

main();
