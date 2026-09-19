import {
  CreateUser,
  CurrentUser,
  UpdateCurrentUser,
  UpdateUser,
} from "../types/user.type";
import api from "./api.service";
import authService from "./auth.service";

const list = async () => {
  return (await api.get("/users")).data;
};

const create = async (user: CreateUser) => {
  return (await api.post("/users", user)).data;
};

const update = async (id: string, user: UpdateUser) => {
  return (await api.patch(`/users/${id}`, user)).data;
};

const remove = async (id: string) => {
  await api.delete(`/users/${id}`);
};

const updateCurrentUser = async (user: UpdateCurrentUser) => {
  return (await api.patch("/users/me", user)).data;
};

const confirmEmailChange = async (code: string) => {
  return (await api.post("/users/me/email/confirm", { code })).data;
};

const resendEmailChangeCode = async () => {
  return (await api.post("/users/me/email/resend")).data;
};

const cancelEmailChange = async () => {
  return (await api.delete("/users/me/email")).data;
};

// Le `File` part tel quel, avec son propre type : le serveur ne le croit pas
// sur parole — il le passe à sharp, qui décode ou refuse — mais c'est ce type
// qui fait retenir la requête par le parseur borné à cette route.
const uploadAvatar = async (file: File) => {
  await api.post("/users/me/avatar", file, {
    headers: { "Content-Type": file.type },
  });
};

const deleteAvatar = async () => {
  await api.delete("/users/me/avatar");
};

const removeCurrentUser = async () => {
  await api.delete("/users/me");
};

const getCurrentUser = async (): Promise<CurrentUser | null> => {
  try {
    await authService.refreshAccessToken();
    return (await api.get("users/me")).data;
  } catch {
    return null;
  }
};

export default {
  list,
  create,
  update,
  remove,
  getCurrentUser,
  updateCurrentUser,
  confirmEmailChange,
  resendEmailChangeCode,
  cancelEmailChange,
  uploadAvatar,
  deleteAvatar,
  removeCurrentUser,
};
