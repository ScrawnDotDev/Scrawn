/**
 * Helper function to check if an error is an AuthError
 * Works around instanceof issues with ConnectError prototype chains
 */
export const isAuthError = (error: any): boolean => {
  return error?.name === "AuthError" && error?.type !== undefined;
};
