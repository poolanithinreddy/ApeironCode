export const reportAuthFailure = (_token, error) => {
  console.error(`Authentication failed: ${error.message}`);
};
