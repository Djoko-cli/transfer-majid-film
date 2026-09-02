import api from "./api.service";

const get = async (): Promise<string> => {
  return (await api.get("/version")).data.version;
};

export default { get };
