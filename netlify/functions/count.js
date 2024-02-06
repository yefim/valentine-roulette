const AWS = require('aws-sdk');

async function handler(_event, _context) {
  const s3 = new AWS.S3({
    accessKeyId: process.env.VDAY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.VDAY_AWS_SECRET_ACCESS_KEY,
  });

  const objects = await s3
    .listObjectsV2({
      Bucket: 'valentine-roulette',
      Prefix: '',
      Delimiter: '/',
    })
    .promise();

  const numberOfObjects = objects.Contents?.length ?? 0;

  return {
    'statusCode': 200,
    'Content-Type': 'application/json; charset=utf-8',
    'body': JSON.stringify({ count: numberOfObjects }),
  };
}

module.exports.handler = handler;
