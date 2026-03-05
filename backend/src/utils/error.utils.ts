/** Safely extract error message from unknown catch variable */
export function getErrMsg(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

/** Safely extract error message in lowercase */
export function getErrMsgLower(error: unknown): string {
  return getErrMsg(error).toLowerCase();
}
