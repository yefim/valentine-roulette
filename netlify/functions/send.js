const handler = async (event, _context) => {
  console.log(event);

  return {
    statusCode: 200,
    body: JSON.stringify({message: 'hello from vday'}),
  };
};

export {handler};
