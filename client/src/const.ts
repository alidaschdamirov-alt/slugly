// Returns the branded Clerk sign-in page URL for unauthenticated users.
export const getLoginUrl = () => {
  return `${window.location.origin}/auth`;
};
