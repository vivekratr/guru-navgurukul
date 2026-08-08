export function extractBearerToken(
  authorizationHeader: string | undefined,
): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token, ...rest] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token || rest.length > 0) {
    return null;
  }

  return token;
}
