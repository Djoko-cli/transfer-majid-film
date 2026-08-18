import api from "./api.service";

const requestCode = async (email: string): Promise<void> => {
  await api.post("verification/request-code", { email });
};

const verifyCode = async (email: string, code: string): Promise<void> => {
  await api.post("verification/verify-code", { email, code });
};

export default { requestCode, verifyCode };
