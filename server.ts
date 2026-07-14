import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API routes
  app.post("/api/ai/summarize", async (req, res) => {
    try {
      const { text, fileType, fileName } = req.body;
      if (!text) {
        return res.status(400).json({ error: "No text or file content provided" });
      }

      const client = getGeminiClient();
      const prompt = `Please summarize the following document content${fileName ? ` from file "${fileName}"` : ""}. Provide a concise yet complete summary, highlighting key points, formatted in clean Markdown. Here is the content:\n\n${text}`;

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an expert document analyzer. Generate precise summaries, key takeaways, and bullet points. Use clean Markdown formatting."
        }
      });

      res.json({ result: response.text });
    } catch (err: any) {
      console.error("Summarize Error:", err);
      res.status(500).json({ error: err.message || "Failed to generate summary" });
    }
  });

  app.post("/api/ai/translate", async (req, res) => {
    try {
      const { text, targetLanguage } = req.body;
      if (!text) {
        return res.status(400).json({ error: "No text provided" });
      }
      if (!targetLanguage) {
        return res.status(400).json({ error: "No target language specified" });
      }

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Please translate the following text into ${targetLanguage}. Maintain the layout, headings, and markdown formatting perfectly:\n\n${text}`,
        config: {
          systemInstruction: `You are an expert translator. Translate the text accurately into ${targetLanguage}, preserving markdown, tables, links, and styling. Output ONLY the translated text, do not add introductory text.`
        }
      });

      res.json({ result: response.text });
    } catch (err: any) {
      console.error("Translate Error:", err);
      res.status(500).json({ error: err.message || "Failed to translate" });
    }
  });

  app.post("/api/ai/ocr", async (req, res) => {
    try {
      const { fileData, mimeType } = req.body; // fileData is base64
      if (!fileData) {
        return res.status(400).json({ error: "No file data provided" });
      }

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType || "image/png",
              data: fileData
            }
          },
          {
            text: "Extract all text from this document or image accurately. Format it beautifully with proper structure, lists, tables if they exist, or clean readable text paragraphs. If it's a form, list the fields and values clearly."
          }
        ],
        config: {
          systemInstruction: "You are a professional OCR engine. Extract text exactly as it appears, preserving formatting and spelling. Do not add conversational chatter, just output the extracted text."
        }
      });

      res.json({ result: response.text });
    } catch (err: any) {
      console.error("OCR Error:", err);
      res.status(500).json({ error: err.message || "Failed to extract text (OCR)" });
    }
  });

  app.post("/api/ai/pdf-to-markdown", async (req, res) => {
    try {
      const { fileData, mimeType } = req.body; // fileData is base64
      if (!fileData) {
        return res.status(400).json({ error: "No file data provided" });
      }

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType || "application/pdf",
              data: fileData
            }
          },
          {
            text: "Convert this document into a structured Markdown file. Maintain headings, bullet points, subheadings, lists, bold text, links, and tables accurately. Output ONLY valid Markdown."
          }
        ],
        config: {
          systemInstruction: "You are an expert document-to-markdown converter. Preserving structure, layout, and textual hierarchy is your highest priority. Do not include conversational remarks."
        }
      });

      res.json({ result: response.text });
    } catch (err: any) {
      console.error("Markdown Conversion Error:", err);
      res.status(500).json({ error: err.message || "Failed to convert to Markdown" });
    }
  });

  // Check if Gemini API Key is configured
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages, model, thinking, searchGrounding, mapsGrounding } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      const client = getGeminiClient();
      let selectedModel = model || "gemini-3.5-flash";

      // Enable High Thinking configuration
      const config: any = {
        systemInstruction: "You are QRLoom Studio AI, a multi-modal creative assistant specialized in helping users generate QR codes, design visuals, analyze documents, and complete general creative tasks. Provide helpful, structured responses using Markdown formatting."
      };

      if (thinking) {
        selectedModel = "gemini-3.1-pro-preview";
        config.thinkingConfig = {
          thinkingLevel: "HIGH"
        };
        // We do NOT set maxOutputTokens for high thinking
      } else {
        config.maxOutputTokens = 2048;
      }

      // Grounding configuration
      const tools: any[] = [];
      if (searchGrounding) {
        tools.push({ googleSearch: {} });
      }
      if (mapsGrounding) {
        tools.push({ googleMaps: {} });
      }
      if (tools.length > 0) {
        config.tools = tools;
      }

      // Convert messages to Gemini format
      const contents = messages.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }]
      }));

      const response = await client.models.generateContent({
        model: selectedModel,
        contents,
        config
      });

      res.json({ result: response.text });
    } catch (err: any) {
      console.error("Chat Error:", err);
      res.status(500).json({ error: err.message || "Failed to generate chat response" });
    }
  });

  app.post("/api/ai/generate-image", async (req, res) => {
    try {
      const { prompt, aspectRatio, size, quality } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const client = getGeminiClient();
      const selectedModel = quality === "studio" ? "gemini-3-pro-image-preview" : "gemini-3.1-flash-image-preview";

      const response = await client.models.generateImages({
        model: selectedModel,
        prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: aspectRatio || "1:1",
          imageSize: size === "4K" ? "2K" : (size || "1K"),
          outputMimeType: "image/png"
        }
      });

      const imgBytes = response.generatedImages?.[0]?.image?.imageBytes;
      if (!imgBytes) {
        throw new Error("No image was returned from the generator model");
      }

      res.json({ imageBytes: imgBytes, mimeType: "image/png" });
    } catch (err: any) {
      console.error("Image Gen Error:", err);
      res.status(500).json({ error: err.message || "Failed to generate image" });
    }
  });

  app.post("/api/ai/edit-image", async (req, res) => {
    try {
      const { image, prompt, mimeType } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image data (base64) is required" });
      }
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const client = getGeminiClient();
      
      const response = await client.models.editImage({
        model: "gemini-3.1-flash-image-preview",
        prompt,
        referenceImages: [
          {
            referenceId: 1,
            referenceType: "input",
            referenceImage: {
              imageBytes: image,
              mimeType: mimeType || "image/png"
            }
          } as any
        ],
        config: {
          numberOfImages: 1
        }
      });

      const imgBytes = response.generatedImages?.[0]?.image?.imageBytes;
      if (!imgBytes) {
        throw new Error("No edited image was returned from the model");
      }

      res.json({ imageBytes: imgBytes, mimeType: "image/png" });
    } catch (err: any) {
      console.error("Image Edit Error:", err);
      res.status(500).json({ error: err.message || "Failed to edit image" });
    }
  });

  app.post("/api/ai/generate-video", async (req, res) => {
    try {
      const { prompt, image, mimeType, aspectRatio } = req.body;
      if (!prompt && !image) {
        return res.status(400).json({ error: "Either prompt or input image is required" });
      }

      const client = getGeminiClient();
      const config: any = {
        numberOfVideos: 1,
        aspectRatio: aspectRatio || "16:9",
        durationSeconds: 5
      };

      const params: any = {
        model: "veo-3.1-fast-generate-preview",
        config
      };

      if (image) {
        params.image = {
          imageBytes: image,
          mimeType: mimeType || "image/png"
        };
        if (prompt) {
          params.prompt = prompt;
        }
      } else {
        params.prompt = prompt;
      }

      const operation = await client.models.generateVideos(params);
      
      // Poll operation for video completion
      let completedOp = operation;
      let attempts = 0;
      while (!completedOp.done && attempts < 25) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        completedOp = await client.operations.get({ operation: completedOp });
        attempts++;
      }

      if (completedOp.error) {
        throw new Error(JSON.stringify(completedOp.error));
      }

      const video = completedOp.response?.generatedVideos?.[0]?.video;
      if (!video || !video.videoBytes) {
        throw new Error("No video was generated or the operation timed out. Please try again.");
      }

      res.json({ videoBytes: video.videoBytes, mimeType: video.mimeType || "video/mp4" });
    } catch (err: any) {
      console.error("Video Gen Error:", err);
      res.status(500).json({ error: err.message || "Failed to generate video" });
    }
  });

  app.post("/api/ai/generate-music", async (req, res) => {
    try {
      const { prompt, duration } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Music prompt is required" });
      }

      const client = getGeminiClient();
      const model = duration === "full" ? "lyria-3-pro-preview" : "lyria-3-clip-preview";

      const response = await client.models.generateContent({
        model,
        contents: prompt
      });

      // Search parts for inlineData containing audio
      const candidates = response.candidates?.[0]?.content?.parts;
      const audioPart = candidates?.find((p: any) => p.inlineData && p.inlineData.mimeType.startsWith("audio/"));

      if (audioPart && audioPart.inlineData) {
        return res.json({ audioBytes: audioPart.inlineData.data, mimeType: audioPart.inlineData.mimeType });
      }

      const firstPart = candidates?.[0];
      if (firstPart && firstPart.inlineData) {
        return res.json({ audioBytes: firstPart.inlineData.data, mimeType: firstPart.inlineData.mimeType });
      }

      throw new Error("The Lyria model did not return synthesized audio content. Please try a different prompt.");
    } catch (err: any) {
      console.error("Music Gen Error:", err);
      res.status(500).json({ error: err.message || "Failed to generate music" });
    }
  });

  app.post("/api/ai/transcribe", async (req, res) => {
    try {
      const { audioData, mimeType } = req.body;
      if (!audioData) {
        return res.status(400).json({ error: "Audio data (base64) is required" });
      }

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType || "audio/wav",
              data: audioData
            }
          },
          {
            text: "Please transcribe this audio input accurately. Provide a clean, verbatim transcription of what is spoken, without any extra remarks or introduction. If there is no audible speech, say '[No speech detected]'."
          }
        ]
      });

      res.json({ text: response.text });
    } catch (err: any) {
      console.error("Transcription Error:", err);
      res.status(500).json({ error: err.message || "Failed to transcribe audio" });
    }
  });

  app.post("/api/ai/analyze-media", async (req, res) => {
    try {
      const { mediaData, mimeType, prompt } = req.body;
      if (!mediaData) {
        return res.status(400).json({ error: "Media data (base64) is required" });
      }
      if (!mimeType) {
        return res.status(400).json({ error: "mimeType is required" });
      }

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            inlineData: {
              mimeType,
              data: mediaData
            }
          },
          {
            text: prompt || "Please analyze this media content in detail. Tell me what is in it, what is happening, and highlight any key information. Format your output in clean Markdown."
          }
        ]
      });

      res.json({ result: response.text });
    } catch (err: any) {
      console.error("Media Analysis Error:", err);
      res.status(500).json({ error: err.message || "Failed to analyze media" });
    }
  });

  // Check if Gemini API Key is configured
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      geminiConfigured: !!process.env.GEMINI_API_KEY
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiClient;
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
