const chalk = require('chalk');
const ffmpeg = require('fluent-ffmpeg');
const client = require('twilio')(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);
const _ = require('lodash');
const fs = require('fs');

const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: process.env.VDAY_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VDAY_AWS_SECRET_ACCESS_KEY,
  region: 'us-east-1',
});
const s3 = new AWS.S3();

const Airtable = require('airtable');
Airtable.configure({
  endpointUrl: 'https://api.airtable.com',
  apiKey: process.env.AIRTABLE_API_KEY,
});

const base = Airtable.base(process.env.AIRTABLE_VDAY_BASE);

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
  const digits = new Set();
  const digitsToNote = {};
  const extras = [];

  base('Table 1')
    .select({
      // filterByFormula: '{Approved} = TRUE()',
      view: 'Grid view',
    })
    .eachPage(
      function page(records, fetchNextPage) {
        length += records.length;
        records.forEach(function(submission) {
          const sender = submission.get('Sender');
          digits.add(sender);

          if (submission.get('Approved') === true) {
            numApproved++;

            const url = submission.get('URL');
            const filename = url.split('/').at(-1);

            if (digitsToNote[sender]) {
              extras.push(filename);
            } else {
              digitsToNote[sender] = filename;
            }
          }
        });

        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        fetchNextPage();
      },
      function done(err) {
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

        let n = 0;

        for (const to of Object.keys(assignments)) {
          const wavFilename = assignments[to];
          const filename = wavFilename.split('.').at(0).split('---').at(-1);
          const url = `https://valentine-roulette-converted.s3.amazonaws.com/${filename}.mp4`;

          if (ERRORS.indexOf(parseInt(to, 10)) !== -1) {
            client.messages
              .create({
                body: copy,
                from: '+13476577597',
                mediaUrl: [url],
                to: `+1${to}`,
              })
              .then(() => {
                n++;
                console.log(`${n}. Sent ${url} to ${to}`);
              })
              .catch((_e) => {
                console.log(chalk.red(`Could not reach ${to}`));
              });
          }
        }
      },
    );
};

const downloadValentines = async () => {
  let length = 0;

  base('Table 1')
    .select({
      filterByFormula: '{Approved} = TRUE()',
      view: 'Grid view',
    })
    .eachPage(
      async function page(records, fetchNextPage) {
        length += records.length;
        // This function (`page`) will get called for each page of records.

        records.forEach(async (submission) => {
          const url = submission.get('URL');
          const filename = url.split('/').at(-1);
          const destination = `./notes/${filename.split('---').at(-1)}`;

          // Skip over existing files
          if (fs.existsSync(destination)) {
            return;
          }

          const params = {
            Bucket: 'valentine-roulette',
            Key: filename,
          };

          const { Body } = await s3.getObject(params).promise();
          fs.writeFileSync(destination, Body);

          console.log('Retrieved', url);
        });

        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        // If there are no more records, `done` will get called.
        fetchNextPage();
      },
      function done(err) {
        if (err) {
          console.error(err);
          return;
        }

        console.log(`Number approved: ${length}`);
      },
    );
};

const transcodeValentines = async () => {
  const transcode = (file, destination, audioBitrate, retries = 0) => {
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
      .on('start', function() {
        console.log(
          chalk.green(
            `Transcoding ${file} with audio bitrate of ${audioBitrate}...`,
          ),
        );
      })
      .on('end', function() {
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
  };

  const files = fs.readdirSync('./notes');

  // Sort files by size, smallest to largest
  files.sort(function(a, b) {
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
};

const uploadValentines = async () => {
  const files = fs.readdirSync('./transcodes');
  let uploaded = 0;

  // Sort files by size, smallest to largest
  files.sort(function(a, b) {
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
        (err) => {
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

        records.forEach(function(submission) {
          const url = submission.get('URL');
          const id = url.split('---').at(-1).split('.').at(0);

          // todo: populate SENT array
          const SENT = [];
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
        });

        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        // If there are no more records, `done` will get called.
        fetchNextPage();
      },
      function done(err) {
        if (err) {
          console.error(err);
          return;
        }

        console.log(`Sent: ${sent}`);
      },
    );
};

const sendValentines2 = async () => {
  const wavFilenames = [];

  const lateComers = [];

  const getRandomUrl = (number) => {
    const r = _.sample(wavFilenames);

    // Check to make sure we're not sending someone their own note
    const index = r.indexOf(number);
    if (index === 0 || index === 1) {
      // try again.
      console.log(`${number} was about to get ${r}. Trying again...`);
      return getRandomUrl();
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
        records.forEach(function(submission) {
          const url = submission.get('URL');
          const filename = url.split('/').at(-1);
          wavFilenames.push(filename);
        });

        // To fetch the next page of records, call `fetchNextPage`.
        // If there are more records, `page` will get called again.
        fetchNextPage();
      },
      function done(_err) {
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
            .catch((_e) => {
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
    .catch((e) => {
      console.log(e);
      console.log(chalk.red(`Could not reach ${to}`));
    });
};

// downloadValentines();
// transcodeValentines();
// uploadValentines();
// sendValentines();
// sendValentines2();
// markValentinesAsSent();
// sendSingleValentine();
