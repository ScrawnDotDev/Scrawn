/**
 * Helper function to check if an error is an AuthError
 * Works around instanceof issues with ConnectError prototype chains
 */
export const isAuthError = (error: any): boolean => {
  return error?.name === "AuthError" && error?.type !== undefined;
};

/**
 * Helper function to check if an error is a StorageError
 * Works around instanceof issues with ConnectError prototype chains
 */
export const isStorageError = (error: any): boolean => {
  return error?.name === "StorageError" && error?.type !== undefined;
};

/**
 * Helper function to check if an error is a PaymentError
 * Works around instanceof issues with ConnectError prototype chains
 */
export const isPaymentError = (error: any): boolean => {
  return error?.name === "PaymentError" && error?.type !== undefined;
};
