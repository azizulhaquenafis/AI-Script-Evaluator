import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  console.log("INITIAL KEY:", process.env.GEMINI_API_KEY);
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  app.post("/api/extract", async (req, res) => {
    try {
      const { base64Data, mimeType, fileName } = req.body;
      const model = "gemini-2.5-flash";
      const apiKey = process.env.GEMINI_API_KEY || "";
      
      const ai = new GoogleGenAI({ apiKey });
      
      const content = {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data.split(',')[1] || base64Data 
            }
          },
          {
            text: `Extract the mobile/phone number from the first page of this script. 
            Also, extract the student's personal name strictly from the provided filename: "${fileName || 'Unknown'}".
            
            Rules:
            1. Student Name: Extract only the human name part of the filename. Ignore words like "PDF", "Assignment", "Test", "Project", "Branch", or date strings.
            2. Clean the name: Remove digits, underscores, dashes, and file extensions.
            3. Naming Convention: Apply Title Case (e.g., 'john_doe_test.pdf' -> 'John Doe').
            4. Phone Number: Extract the student's mobile number from the script image.
            
            The output MUST be JSON format.`
          }
        ]
      };

      const response = await ai.models.generateContent({ 
        model,
        contents: { parts: content.parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              studentName: { type: Type.STRING, description: "Personal name extracted from filename" },
              phoneNumber: { type: Type.STRING, description: "Mobile number found on page" }
            },
            required: ["studentName", "phoneNumber"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("Failed to extract student info");
      }

      res.json(JSON.parse(text.trim()));
    } catch (error: any) {
      console.error("Extraction error:", error);
      let errorMessage = error.message || "Failed to extract info";
      
      if (errorMessage.includes("API key not valid") || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
        errorMessage = "Invalid Gemini API Key. Please configure your API key in the AI Studio Settings menu.";
      }

      res.status(500).json({ 
        error: errorMessage,
        details: String(error)
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
