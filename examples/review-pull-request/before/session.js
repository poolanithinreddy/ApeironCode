export const reportAuthFailure = (token, error) => {
  console.error(`Authentication failed for ${token}: ${error.message}`);
};
