module.exports = {
  echo: async function(input) {
    return {
      ok: true,
      result: {
        type: 'text',
        text: `Echo: ${JSON.stringify(input)}`
      }
    };
  }
};
