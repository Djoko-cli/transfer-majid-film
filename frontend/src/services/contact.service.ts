import api from "./api.service";

const sendMessage = async (
  subject: string,
  message: string,
  replyTo?: string,
  // Honeypot - see contact.tsx's own field for why this exists and stays
  // empty for every real visitor.
  website?: string,
): Promise<void> => {
  await api.post("contact", { subject, message, replyTo, website });
};

export default { sendMessage };
