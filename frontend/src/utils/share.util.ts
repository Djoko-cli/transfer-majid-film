import shareService from "../services/share.service";

export const generateShareId = (length: number = 16) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomArray = new Uint8Array(length >= 3 ? length : 3);
  crypto.getRandomValues(randomArray);
  randomArray.forEach((number) => {
    result += chars[number % chars.length];
  });
  return result;
};

// Ids are short random strings, so a collision is rare but not impossible —
// retry a handful of times rather than surfacing a raw availability error to
// whoever is submitting a share.
export const generateAvailableShareId = async (
  length: number,
  attemptsLeft: number = 10,
): Promise<string> => {
  if (attemptsLeft <= 0) {
    throw new Error("Could not generate an available share id");
  }
  const candidate = generateShareId(length);
  return (await shareService.isShareIdAvailable(candidate))
    ? candidate
    : generateAvailableShareId(length, attemptsLeft - 1);
};
