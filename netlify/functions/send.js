const axios = require('axios');
const FormData = require('form-data');
const Busboy = require('busboy');

function parseMultipartForm(event) {
  return new Promise((resolve) => {
    // we'll store all form fields inside of this
    const fields = {};

    // let's instantiate our busboy instance!
    const busboy = Busboy({
      // it uses request headers
      // to extract the form boundary value (the ----WebKitFormBoundary thing)
      headers: event.headers
    });

    // before parsing anything, we need to set up some handlers.
    // whenever busboy comes across a file ...
    busboy.on(
      "file",
      (fieldname, filestream, filename, _transferEncoding, mimeType) => {
        console.log('busboy.on(file)');
        // ... we take a look at the file's data ...
        filestream.on("data", (data) => {
          console.log('filestream.on(data)');
          // ... and write the file's name, type and content into `fields`.
          fields[fieldname] = {
            filename,
            type: mimeType,
            content: data,
          };
        });
      }
    );

    // whenever busboy comes across a normal field ...
    busboy.on("field", (fieldName, value) => {
      console.log('busboy.on(field)');
      // ... we write its value into `fields`.
      fields[fieldName] = value;
    });

    // once busboy is finished, we resolve the promise with the resulted fields.
    busboy.on("finish", () => {
      console.log('busboy.on(finish)');
      resolve(fields)
    });

    // now that all handlers are set up, we can finally start processing our request!
    busboy.end(Buffer.from(event.body, 'base64'));
  });
}


const handler = async (event, _context) => {
  console.log('here we go...');

  console.log(event.httpMethod);

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 200,
      body: `Try sending a POST. You sent a ${event.httpMethod}.`
    };
  }

  const fields = await parseMultipartForm(event);
  const { filename, content } = fields.file;

  const formData = new FormData();
  formData.append('file', content, filename);

  /*
  const result = await axios.post('url', formData, {
    maxBodyLength: Infinity,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  */

  return {
    statusCode: 200,
    body: 'Thanks for sending a POST.'
  };
};

module.exports.handler = handler;
