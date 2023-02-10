const handler = async (_event, _context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({message: 'hello from vday'}),
  };
};

export {handler};
