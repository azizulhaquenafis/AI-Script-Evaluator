export interface ScriptIdentity {
  studentName: string;
  phoneNumber: string;
}

export async function extractIdentity(base64Data: string, mimeType: string, fileName?: string): Promise<ScriptIdentity> {
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      base64Data,
      mimeType,
      fileName
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || errData.details || "Failed to extract student info");
  }

  return response.json();
}
