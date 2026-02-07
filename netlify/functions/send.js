const AWS = require('aws-sdk');
const Airtable = require('airtable');
const uuid = require('uuid');
const Busboy = require('busboy');

function parseMultipartForm(event) {
  return new Promise((resolve) => {
    // we'll store all form fields inside of this
    const fields = {};

    // let's instantiate our busboy instance!
    const busboy = Busboy({
      // it uses request headers
      // to extract the form boundary value (the ----WebKitFormBoundary thing)
      headers: event.headers,
    });

    // before parsing anything, we need to set up some handlers.
    // whenever busboy comes across a file ...
    busboy.on(
      'file',
      (fieldname, filestream, filename, _transferEncoding, mimeType) => {
        console.log('busboy.on(file)');
        // ... we take a look at the file's data ...
        filestream.on('data', (data) => {
          console.log('filestream.on(data)');
          // ... and write the file's name, type and content into `fields`.
          fields[fieldname] = {
            filename,
            type: mimeType,
            content: data,
          };
        });
      },
    );

    // whenever busboy comes across a normal field ...
    busboy.on('field', (fieldName, value) => {
      console.log('busboy.on(field)');
      // ... we write its value into `fields`.
      fields[fieldName] = value;
    });

    // once busboy is finished, we resolve the promise with the resulted fields.
    busboy.on('finish', () => {
      console.log('busboy.on(finish)');
      resolve(fields);
    });

    // now that all handlers are set up, we can finally start processing our request!
    busboy.end(Buffer.from(event.body, 'base64'));
  });
}

function validPhonenumber(str) {
  return str.length === 10 || (str.length === 11 && str[0] === '1');
}

async function handler(event, _context) {
  console.log(`[handler ${Date.now()}]`);

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 302,
      headers: {
        'Location': 'https://voice-note-valentine.com/send',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({}),
    };
  }

  // Parse the request body.
  const fields = await parseMultipartForm(event);

  const digits = fields.phonenumber
    ? fields.phonenumber.match(/\d/g).join('')
    : '';

  if (!fields.file || !validPhonenumber(digits)) {
    return {
      statusCode: 400,
      body: 'Something went wrong. Please go back, refresh, and try again. Make sure your phone number is 10 digits and your voice note is recorded.',
    };
  }

  const s3 = new AWS.S3({
    accessKeyId: process.env.VDAY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.VDAY_AWS_SECRET_ACCESS_KEY,
  });

  const key = `${digits}---${uuid.v4()}.mp3`;

  try {
    await s3
      .upload({
        Bucket: 'valentine-roulette',
        Key: key,
        Body: fields.file.content,
      })
      .promise();
  } catch (e) {
    return {
      statusCode: 400,
      body: 'Something went wrong. Please go back, refresh, and try again. Make sure your phone number is 10 digits and your voice note is recorded.',
    };
  }

  // Best-effort Airtable logging
  try {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
      process.env.AIRTABLE_VDAY_BASE,
    );
    const s3Url = `https://valentine-roulette.s3.us-east-1.amazonaws.com/${key}`;
    const sender = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    await new Promise((resolve, reject) => {
      base('2026').create(
        {
          Sender: sender,
          URL: s3Url,
          Timestamp: new Date().toISOString(),
          Voicenote: [{ url: s3Url }],
        },
        (err, record) => {
          if (err) reject(err);
          else resolve(record);
        },
      );
    });
  } catch (e) {
    console.error('Airtable write failed:', e);
  }

  return {
    statusCode: 302,
    headers: {
      'Location': 'https://voice-note-valentine.com/share',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({}),
  };
}

module.exports.handler = handler;
