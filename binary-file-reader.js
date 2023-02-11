const BinaryFileReader = {
  read: function(file, callback) {
    var reader = new FileReader();

    var fileInfo = {
      name: file.name,
      type: file.type,
      size: file.size,
      file: null
    };

    reader.onload = function() {
      fileInfo.file = new Uint8Array(reader.result);
      callback(null, fileInfo);
    }

    reader.onerror = function() {
      callback(reader.error);
    }

    reader.readAsArrayBuffer(file);
  }
}

export {BinaryFileReader};
