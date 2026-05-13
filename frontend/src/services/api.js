import axios from "axios";

const client = axios.create({ baseURL: "/api" });

export async function uploadDocument(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function analyzeDocument(docId) {
  const { data } = await client.post("/analyze", { doc_id: docId });
  return data;
}

export async function fetchProviders() {
  const { data } = await client.get("/providers");
  return data;
}

export async function generateCode(selections) {
  const { data } = await client.post("/generate", { selections });
  return data;
}
